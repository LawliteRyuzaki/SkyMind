"""
SkyMind Flight Search Engine — April 2026 Edition
Primary: Amadeus GDS | Fallback: AviationStack | Safety: Rich Synthetic Data
Intelligence: XGBoost PricePredictor Integration
"""
import logging
import os
import random
import traceback
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from database.database import database as db
from ml.price_model import get_predictor

logger = logging.getLogger(__name__)
router = APIRouter()
model = get_predictor()

# ==========================================
# 📋 CONFIGURATION & MAPPINGS
# ==========================================
AIRLINE_MAP = {
    "AI": "Air India", "6E": "IndiGo", "UK": "Vistara", "SG": "SpiceJet",
    "IX": "Air India Express", "QP": "Akasa Air", "G8": "Go First",
    "S5": "Star Air", "2T": "TruJet", "I7": "Alliance Air",
    "EK": "Emirates", "SQ": "Singapore Airlines", "QR": "Qatar Airways",
    "EY": "Etihad Airways", "BA": "British Airways", "TK": "Turkish Airlines",
    "MH": "Malaysia Airlines", "LH": "Lufthansa", "AF": "Air France",
    "KL": "KLM", "NH": "ANA", "JL": "Japan Airlines",
    "CX": "Cathay Pacific", "TG": "Thai Airways", "KE": "Korean Air",
    "FZ": "flydubai", "G9": "Air Arabia", "WY": "Oman Air",
    "UL": "SriLankan Airlines", "5J": "Cebu Pacific",
}

CITY_TO_IATA = {
    "delhi": "DEL", "new delhi": "DEL", "mumbai": "BOM", "bombay": "BOM",
    "bangalore": "BLR", "bengaluru": "BLR", "hyderabad": "HYD",
    "chennai": "MAA", "madras": "MAA", "kolkata": "CCU", "calcutta": "CCU",
    "kochi": "COK", "goa": "GOI", "ahmedabad": "AMD", "jaipur": "JAI",
    "lucknow": "LKO", "pune": "PNQ", "amritsar": "ATQ", "guwahati": "GAU",
    "varanasi": "VNS", "patna": "PAT", "bhubaneswar": "BBI", "ranchi": "IXR",
    "chandigarh": "IXC", "srinagar": "SXR", "jammu": "IXJ", "leh": "IXL",
    "dubai": "DXB", "london": "LHR", "singapore": "SIN", "doha": "DOH"
}

ROUTE_AIRLINES = {
    ("DEL", "BOM"): ["6E", "AI", "UK", "SG", "QP"],
    ("DEL", "BLR"): ["6E", "AI", "UK", "SG", "QP"],
    ("BOM", "BLR"): ["6E", "AI", "UK", "SG"],
    ("DEL", "DXB"): ["AI", "EK", "6E", "FZ"],
}

ROUTE_BASE_PRICES = {
    ("DEL", "BOM"): 3200, ("DEL", "BLR"): 3800, ("BOM", "BLR"): 2800,
    ("DEL", "DXB"): 6800, ("DEL", "LHR"): 28000,
}

DEP_TIMES = ["06:00", "07:30", "09:15", "12:15", "15:00", "18:00", "21:00", "22:30"]

# ==========================================
# 🧠 ML INTELLIGENCE LAYER
# ==========================================
def enrich_with_prediction_api(flights, origin, destination, departure_date):
    try:
        dep_date_obj = datetime.strptime(departure_date, "%Y-%m-%d").date()
        days_until_dep = max((dep_date_obj - date.today()).days, 0)

        for f in flights:
            try:
                base_price = f["price"]["total"]
                airline = f.get("primary_airline", "AI")

                features = {
                    "origin_code": origin,
                    "destination_code": destination,
                    "airline_code": airline,
                    "days_until_dep": days_until_dep,
                    "day_of_week": dep_date_obj.weekday(),
                    "month": dep_date_obj.month,
                    "week_of_year": dep_date_obj.isocalendar()[1],
                    "hour_of_day": 12,
                    "is_peak_hour": 0,
                    "is_weekend": 1 if dep_date_obj.weekday() >= 5 else 0,
                    "is_live": 1,
                    "seats_available": f.get("seats_available") or 30,
                    "price_change_1d": 0,
                    "price_change_3d": 0,
                    "demand_score": 0.85 if days_until_dep < 7 else 0.5,
                    "seasonality_factor": 1.25 if dep_date_obj.month in [4, 5, 10, 12] else 1.0
                }

                predicted = model.predict(features)
                predicted = max(2800, min(predicted, 55000))
                f["ai_price"] = round(predicted)
                
                if predicted > base_price * 1.12:
                    f["recommendation"] = "BOOK NOW 🔥"
                    f["trend"] = "INCREASING"
                elif predicted < base_price * 0.88:
                    f["recommendation"] = "WAIT ⏳"
                    f["trend"] = "DECREASING"
                else:
                    f["recommendation"] = "FAIR PRICE ✅"
                    f["trend"] = "STABLE"

            except Exception:
                f["ai_price"] = base_price
                f["recommendation"] = "MONITOR"
                f["trend"] = "STABLE"
        return flights
    except Exception:
        return flights

# ==========================================
# 🛠️ UTILITIES & PARSING
# ==========================================
def resolve_iata(code: str) -> str:
    if not code: return code
    stripped = code.strip().lower()
    return CITY_TO_IATA.get(stripped, stripped.upper())

def get_airline_logo_url(iata: str) -> str:
    return f"https://content.airhex.com/content/logos/airlines_{iata}_200_200_s.png"

def get_airline_logo_rect(iata: str) -> str:
    return f"https://content.airhex.com/content/logos/airlines_{iata}_100_25_r.png"

def parse_flight_offers_fixed(raw: dict) -> list[dict]:
    offers = []
    data = raw.get("data", [])
    dictionaries = raw.get("dictionaries", {})
    carriers = {**AIRLINE_MAP, **dictionaries.get("carriers", {})}

    for offer in data:
        itineraries = offer.get("itineraries", [])
        price_info = offer.get("price", {})
        parsed_itins = []

        for itin in itineraries:
            segments = []
            for seg in itin.get("segments", []):
                carrier_code = (seg.get("operating", {}).get("carrierCode") or seg.get("carrierCode", "")).upper()
                segments.append({
                    "flight_number": f"{carrier_code}{seg.get('number', '')}",
                    "airline_code": carrier_code,
                    "airline_name": carriers.get(carrier_code, carrier_code),
                    "airline_logo": get_airline_logo_url(carrier_code),
                    "airline_logo_rect": get_airline_logo_rect(carrier_code),
                    "origin": seg["departure"]["iataCode"],
                    "destination": seg["arrival"]["iataCode"],
                    "departure_time": seg["departure"]["at"],
                    "arrival_time": seg["arrival"]["at"],
                    "duration": seg["duration"],
                    "cabin": seg.get("cabin", "ECONOMY"),
                    "stops": seg.get("numberOfStops", 0),
                })
            parsed_itins.append({"duration": itin.get("duration"), "segments": segments})

        validating = offer.get("validatingAirlineCodes", [])
        primary = validating[0] if validating else parsed_itins[0]["segments"][0]["airline_code"]
        total = float(price_info.get("grandTotal", price_info.get("total", 0)))

        offers.append({
            "id": offer.get("id"),
            "source": "AMADEUS",
            "price": {"total": total, "currency": price_info.get("currency", "INR")},
            "itineraries": parsed_itins,
            "primary_airline": primary,
            "primary_airline_name": carriers.get(primary, primary),
            "primary_airline_logo": get_airline_logo_url(primary),
            "seats_available": offer.get("numberOfBookableSeats", 9),
        })
    return offers

def _generate_synthetic_flights(origin, destination, departure_date, adults=1, cabin_class="ECONOMY"):
    key = (origin, destination)
    airlines = ROUTE_AIRLINES.get(key, ["6E", "AI", "UK", "SG"])
    base = ROUTE_BASE_PRICES.get(key, 4500)
    seed_val = hash(f"{origin}{destination}{departure_date}") % (2**31)
    rng = random.Random(seed_val)
    flights = []

    for i, airline_code in enumerate(airlines):
        for j in range(2 if airline_code in ["6E", "AI"] else 1):
            dep_str = rng.choice(DEP_TIMES)
            dur_min = random.randint(90, 140)
            total_price = round(base * rng.uniform(0.9, 1.3) * adults)

            flights.append({
                "id": f"SYN-{origin}-{destination}-{airline_code}-{i}-{j}",
                "source": "SKYMIND_SYNTHETIC",
                "price": {"total": total_price, "currency": "INR"},
                "itineraries": [{"duration": f"PT{dur_min//60}H{dur_min%60}M", "segments": [{
                    "flight_number": f"{airline_code}{rng.randint(100, 999)}",
                    "airline_code": airline_code,
                    "airline_name": AIRLINE_MAP.get(airline_code, airline_code),
                    "airline_logo": get_airline_logo_url(airline_code),
                    "airline_logo_rect": get_airline_logo_rect(airline_code),
                    "origin": origin, "destination": destination,
                    "departure_time": f"{departure_date}T{dep_str}:00",
                    "arrival_time": f"{departure_date}T23:59:00",
                    "duration": f"PT{dur_min//60}H{dur_min%60}M",
                    "cabin": cabin_class, "stops": 0
                }]}],
                "primary_airline": airline_code,
                "primary_airline_name": AIRLINE_MAP.get(airline_code, airline_code),
                "primary_airline_logo": get_airline_logo_url(airline_code),
                "seats_available": rng.randint(2, 12),
            })
    return flights

# ==========================================
# 🔍 MAIN SEARCH ROUTER
# ==========================================
@router.get("/search")
async def search_flights(
    origin: str = Query(...), destination: str = Query(...),
    departure_date: str = Query(...), adults: int = Query(1),
    cabin_class: str = Query("ECONOMY"), max_results: int = Query(20)
):
    origin_iata = resolve_iata(origin)
    destination_iata = resolve_iata(destination)

    if origin_iata == destination_iata:
        raise HTTPException(400, "Origin and destination cannot be the same")

    flights = db.search_flights(origin_iata, destination_iata, departure_date)
    source_used = "DATABASE"

    if not flights:
        try:
            from services.amadeus import amadeus_service
            raw = await amadeus_service.search_flights(
                origin=origin_iata, destination=destination_iata,
                departure_date=departure_date, adults=adults, 
                cabin_class=cabin_class, max_results=max_results
            )
            flights = parse_flight_offers_fixed(raw)
            source_used = "AMADEUS"
        except Exception:
            flights = _generate_synthetic_flights(origin_iata, destination_iata, departure_date, adults, cabin_class)
            source_used = "SYNTHETIC"

    seen = set()
    unique_flights = []
    for f in flights:
        try:
            seg = f["itineraries"][0]["segments"][0]
            key = (seg["flight_number"], seg["departure_time"])
            if key not in seen:
                seen.add(key)
                unique_flights.append(f)
        except: unique_flights.append(f)
    
    flights = sorted(unique_flights, key=lambda x: x["price"]["total"])[:max_results]
    flights = enrich_with_prediction_api(flights, origin_iata, destination_iata, departure_date)

    return {
        "flights": flights, "count": len(flights),
        "origin_iata": origin_iata, "destination_iata": destination_iata,
        "data_source": source_used
    }

@router.get("/airports")
async def search_airports(q: str = Query(...)):
    AIRPORTS = [
        {"iata": "DEL", "city": "New Delhi", "name": "Indira Gandhi International", "country": "India"},
        {"iata": "BOM", "city": "Mumbai", "name": "Chhatrapati Shivaji Maharaj Intl", "country": "India"},
        {"iata": "BLR", "city": "Bengaluru", "name": "Kempegowda International", "country": "India"},
        {"iata": "MAA", "city": "Chennai", "name": "Chennai International", "country": "India"},
        {"iata": "HYD", "city": "Hyderabad", "name": "Rajiv Gandhi International", "country": "India"},
        {"iata": "CCU", "city": "Kolkata", "name": "Netaji Subhas Chandra Bose Intl", "country": "India"},
    ]
    q_lower = q.lower().strip()
    results = [a for a in AIRPORTS if q_lower in a["city"].lower() or q_lower in a["iata"].lower()]
    results.sort(key=lambda x: (x["country"] != "India", x["iata"].lower() != q_lower))
    return {"airports": results[:10]}