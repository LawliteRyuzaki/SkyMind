from fastapi import APIRouter, HTTPException
from datetime import datetime, date, timedelta
import numpy as np
import random
import traceback
import pytz  # Ensure you have pytz installed: pip install pytz

from ml.price_model import get_predictor
from database.database import database as db

router = APIRouter()

# Define India Timezone for 2026 domestic accuracy
IST = pytz.timezone("Asia/Kolkata")

# ==========================================
# 🛡️ SYSTEMATIC PRICE CLAMP
# ==========================================
def adjust_prediction(price: float):
    """
    Reflects the 2026 Indian domestic price floor and ceiling.
    """
    # 2026 Floor: ₹2800 (Tax + Fuel), Ceiling: ₹45000 (Last minute Business)
    return round(max(2800, min(45000, price)), 2)

# ==========================================
# 📊 MARKET TREND ANALYSIS
# ==========================================
def get_recent_prices(origin, destination):
    try:
        res = db.supabase.table("price_history") \
            .select("price") \
            .eq("origin_code", origin) \
            .eq("destination_code", destination) \
            .eq("is_live", True) \
            .order("recorded_at", desc=True) \
            .limit(10) \
            .execute()
        
        return [r["price"] for r in res.data or []]
    except Exception as e:
        print(f"⚠️ Trend fetch error: {e}")
        return []

def get_market_median(prices):
    if not prices:
        return None
    return float(np.median(prices))

# ==========================================
# 🧠 FEATURE ARCHITECT (SYNCED WITH ML)
# ==========================================
def build_features(origin, destination, dep_date, route_data, recent_prices):
    now_ist = datetime.now(IST)
    today_ist = now_ist.date()
    
    days_until_dep = max((dep_date - today_ist).days, 0)
    hour = now_ist.hour
    
    # 📈 Safe Live Trend Calculation (Prevents IndexErrors)
    p0 = recent_prices[0] if len(recent_prices) >= 1 else 0
    p1 = recent_prices[1] if len(recent_prices) >= 2 else p0
    p3 = recent_prices[3] if len(recent_prices) >= 4 else p1

    price_change_1d = p0 - p1
    price_change_3d = p0 - p3

    return {
        "origin_code": origin,
        "destination_code": destination,
        "airline_code": route_data.get("airlines", ["AI"])[0],
        "days_until_dep": days_until_dep,
        "day_of_week": dep_date.weekday(),
        "month": dep_date.month,
        "week_of_year": dep_date.isocalendar()[1],
        "hour_of_day": hour,
        "is_peak_hour": 1 if hour in [7, 8, 9, 18, 19, 20, 21] else 0,
        "is_weekend": 1 if dep_date.weekday() >= 5 else 0,
        "is_live": 1, 
        "seats_available": random.randint(10, 45), # 2026 high-load factor simulation
        "price_change_1d": price_change_1d,
        "price_change_3d": price_change_3d,
        "demand_score": 0.85 if days_until_dep < 7 else 0.5,
        "seasonality_factor": 1.25 if dep_date.month in [4, 5, 10, 12] else 1.0,
    }

# ==========================================
# 🎯 INTELLIGENCE & DECISION ENGINE
# ==========================================
def calculate_confidence(recent_count, volatility):
    # More data = higher trust. High volatility = lower trust.
    base = min(recent_count / 15, 1) * 65 
    stability = max(0, 30 - (volatility / 1500))
    return round(max(25, min(98, base + stability)), 2)

def get_smart_recommendation(current, predicted, confidence):
    if confidence < 40: return "NEUTRAL (Collecting Data)"
    
    # If the Predicted (Future/Fair) price is higher than Current, prices are going UP.
    diff = predicted - current
    if diff > 1200: return "BUY NOW 🔥 (Price Rising)"
    if diff < -1200: return "WAIT ⏳ (Likely to Drop)"
    return "FAIR PRICE ✅"

# ==========================================
# 🔍 THE PREDICTION ENDPOINT
# ==========================================
@router.get("/price")
async def predict_price(origin: str, destination: str, departure_date: str):
    try:
        predictor = get_predictor()
        origin = origin.upper().strip()
        destination = destination.upper().strip()
        
        try:
            dep_date_obj = datetime.strptime(departure_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, detail="Invalid date format. Use YYYY-MM-DD.")

        # 1. Fetch Route Context
        route = db.supabase.table("routes") \
            .select("*") \
            .eq("origin_code", origin) \
            .eq("destination_code", destination) \
            .limit(1).execute()

        if not route.data:
            raise HTTPException(404, detail="Route not currently supported.")

        # 2. Market Data & Features
        recent_prices = get_recent_prices(origin, destination)
        market_median = get_market_median(recent_prices)
        features = build_features(origin, destination, dep_date_obj, route.data[0], recent_prices)

        # 3. Hybrid Prediction Logic
        model_raw_price = predictor.predict(features)
        
        if market_median:
            # Blend: Trust live market median more as sample size grows
            live_weight = min(len(recent_prices) / 10, 0.70)
            final_price = (model_raw_price * (1 - live_weight)) + (market_median * live_weight)
        else:
            final_price = model_raw_price

        final_price = adjust_prediction(final_price)

        # 4. Intelligence Metrics
        volatility = np.std(recent_prices) if len(recent_prices) > 1 else 800
        confidence = calculate_confidence(len(recent_prices), volatility)
        
        # Decision logic: Compare predicted price against current market status
        current_ref = market_median if market_median else (final_price * 0.95)

        return {
            "status": "success",
            "data": {
                "origin": origin,
                "destination": destination,
                "predicted_price": final_price,
                "intelligence": {
                    "confidence": f"{confidence}%",
                    "recommendation": get_smart_recommendation(current_ref, final_price, confidence),
                    "market_status": "VOLATILE" if volatility > 1200 else "STABLE",
                    "days_to_go": features["days_until_dep"]
                },
                "meta": {
                    "peak_season": features["seasonality_factor"] > 1.1,
                    "weekend": bool(features["is_weekend"]),
                    "prediction_timestamp": datetime.now(IST).isoformat()
                }
            }
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Intelligence Engine Busy. Try again.")