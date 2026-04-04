import os
import httpx
from typing import List
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

from ml.price_model import get_predictor
from database.database import database as db

AMADEUS_API_KEY = os.getenv("AMADEUS_API_KEY")
AMADEUS_API_SECRET = os.getenv("AMADEUS_API_SECRET")
BASE_URL = "https://test.api.amadeus.com" # Switch to 'production' for live 2026 data

# ==========================================
# 🔐 AUTH: TOKEN MANAGEMENT
# ==========================================
async def get_access_token():
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/v1/security/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": AMADEUS_API_KEY,
                "client_secret": AMADEUS_API_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

# ==========================================
# 💾 DB: SYSTEMATIC PRICE LOGGING
# ==========================================
def save_price(origin, destination, price, airline, flight_number, departure_date):
    """Logs data to Supabase to continuously retrain the XGBoost model."""
    try:
        dep_dt = datetime.strptime(departure_date, "%Y-%m-%d")
        now = datetime.now(timezone.utc)
        
        db.supabase.table("price_history").insert({
            "origin_code": origin,
            "destination_code": destination,
            "airline_code": airline,
            "flight_number": flight_number,
            "price": float(price),
            "currency": "INR",
            "departure_date": departure_date,
            "recorded_at": now.isoformat(),
            "is_live": True, 
            "days_until_dep": max((dep_dt.date() - now.date()).days, 0),
            "day_of_week": dep_dt.weekday(),
            "month": dep_dt.month,
            "week_of_year": dep_dt.isocalendar()[1],
            "is_weekend": dep_dt.weekday() >= 5
        }).execute()
    except Exception as e:
        print(f"⚠️ Telemetry Error: {e}")

# ==========================================
# 📊 TRENDS: HISTORICAL LOOKBACK
# ==========================================
def get_recent_prices(origin, destination):
    """Fetches last 5 data points to calculate momentum."""
    try:
        res = db.supabase.table("price_history") \
            .select("price") \
            .eq("origin_code", origin) \
            .eq("destination_code", destination) \
            .order("recorded_at", desc=True) \
            .limit(5) \
            .execute()
        return [r["price"] for r in res.data or []]
    except:
        return []

# ==========================================
# ✈️ PARSE: API RESPONSE CLEANING
# ==========================================
def parse_flight_offers(data: dict) -> List[dict]:
    flights = []
    # 2026 Exchange Rate Logic (Approx EUR to INR)
    EUR_TO_INR = 92.5 
    
    for offer in data.get("data", []):
        try:
            itinerary = offer["itineraries"][0]
            seg = itinerary["segments"][0]
            
            # Extract clean price
            raw_price = float(offer["price"]["grandTotal"])
            price_in_inr = round(raw_price * EUR_TO_INR, 2)

            flights.append({
                "origin": seg["departure"]["iataCode"],
                "destination": seg["arrival"]["iataCode"],
                "airline": seg["carrierCode"],
                "flight_number": f"{seg['carrierCode']}-{seg['number']}",
                "price": price_in_inr,
                "raw_data": offer # Keep for booking flow
            })
        except (KeyError, IndexError, ValueError):
            continue
    return flights

# ==========================================
# 🧠 BRAIN: ML PREDICTION & DECISION
# ==========================================
def enrich_flights_with_ml(flights: List[dict], departure_date: str) -> List[dict]:
    predictor = get_predictor()
    enriched = []
    dep_date_obj = datetime.strptime(departure_date, "%Y-%m-%d").date()
    now = datetime.now()

    for f in flights:
        try:
            origin, destination = f["origin"], f["destination"]
            airline, price = f["airline"], f["price"]

            # 1. Log search to training set
            save_price(origin, destination, price, airline, f["flight_number"], departure_date)

            # 2. Momentum Analysis
            recent = get_recent_prices(origin, destination)
            p1d = (price - recent[0]) if len(recent) >= 1 else 0
            p3d = (price - recent[2]) if len(recent) >= 3 else 0

            # 3. Predict Future Price
            input_features = {
                "origin_code": origin,
                "destination_code": destination,
                "airline_code": airline,
                "days_until_dep": max((dep_date_obj - now.date()).days, 0),
                "day_of_week": dep_date_obj.weekday(),
                "month": dep_date_obj.month,
                "week_of_year": dep_date_obj.isocalendar()[1],
                "hour_of_day": now.hour,
                "price_change_1d": p1d,
                "price_change_3d": p3d,
                "is_peak_hour": 1 if now.hour in [8, 9, 18, 19] else 0
            }

            predicted_val = predictor.predict(input_features)
            
            # Guardrails: Model can't predict more than 50% deviation
            predicted_val = max(price * 0.5, min(predicted_val, price * 1.5))
            
            price_diff = predicted_val - price

            # 4. Actionable Intelligence
            if price_diff < -500:
                decision = "BUY NOW 🔥"
                urgency = "High: Prices expected to rise soon"
            elif price_diff > 500:
                decision = "WAIT ⏳"
                urgency = "Moderate: Model predicts a price drop"
            else:
                decision = "FAIR"
                urgency = "Stable: Current price is within normal range"

            f.update({
                "predicted_price": round(predicted_val, 2),
                "trend_direction": "rising" if price_diff > 0 else "dropping",
                "prediction_confidence": "High" if len(recent) > 10 else "Medium",
                "decision": decision,
                "advice": urgency
            })
        except Exception as e:
            print(f"🧠 Enrichment Skip: {e}")
        
        enriched.append(f)
    return enriched

# ==========================================
# 🔍 SEARCH: MAIN ENTRY POINT
# ==========================================
async def search_flights(origin: str, destination: str, date: str):
    """Public method to fetch and predict flight prices."""
    try:
        token = await get_access_token()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{BASE_URL}/v2/shopping/flight-offers",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "originLocationCode": origin.upper(),
                    "destinationLocationCode": destination.upper(),
                    "departureDate": date,
                    "adults": 1,
                    "max": 10 
                }
            )
            
            if resp.status_code != 200:
                return []

            flights = parse_flight_offers(resp.json())
            
            # Wrap in enrichment (Prediction logic)
            return enrich_flights_with_ml(flights, date)
            
    except Exception as e:
        print(f"🚀 Flight Search Error: {e}")
        return []