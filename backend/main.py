import os
import traceback
from datetime import datetime, timezone
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client
from rapidfuzz import fuzz

# ✅ YOUR EXISTING ROUTERS
from routers import auth, alerts, booking, payment, user, prediction, flights
from services.scheduler import start_scheduler

# ✅ ML
from ml.price_model import get_predictor

load_dotenv()

app = FastAPI(title="SkyMind API", version="9.0.0")

# =========================================================
# ROUTERS
# =========================================================
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(alerts.router, prefix="/alerts", tags=["Alerts"])
app.include_router(booking.router, prefix="/booking", tags=["Booking"])
app.include_router(payment.router, prefix="/payment", tags=["Payment"])
app.include_router(user.router, prefix="/user", tags=["User"])
app.include_router(prediction.router, prefix="/ai", tags=["AI"])
app.include_router(flights.router, prefix="/flights", tags=["Flights"])

# =========================================================
# CORS
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# SUPABASE
# =========================================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("❌ Supabase credentials missing")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# =========================================================
# LOAD MODEL (Global Instance)
# =========================================================
predictor = None

# =========================================================
# STARTUP EVENT
# =========================================================
@app.on_event("startup")
def startup_event():
    global predictor
    print("🚀 Starting scheduler...")
    start_scheduler()
    
    print("🧠 Loading Price Predictor...")
    predictor = get_predictor() 

# =========================================================
# HEALTH
# =========================================================
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": "loaded" if predictor else "loading",
        "time": datetime.now(timezone.utc).isoformat(),
    }

# =========================================================
# AIRPORT SEARCH
# =========================================================
@app.get("/airports")
def get_airports(q: str = ""):
    try:
        q = q.strip().lower()

        if not q or len(q) < 2:
            return []

        CITY_ALIASES = {
            "bbsr": "bhubaneswar",
            "blr": "bangalore",
            "del": "delhi",
            "bom": "mumbai",
            "hyd": "hyderabad",
            "maa": "chennai",
        }

        q = CITY_ALIASES.get(q, q)

        res = supabase.table("airports") \
            .select("iata_code, city, name, country") \
            .limit(200) \
            .execute()

        airports = res.data
        scored = []

        for a in airports:
            city = a["city"].lower()
            name = a["name"].lower()
            code = a["iata_code"].lower()
            country = a["country"]

            score = 0

            if code == q: score += 120
            if city == q: score += 110
            if city.startswith(q): score += 100
            if q in city: score += 70
            if q in name: score += 50

            score += fuzz.token_sort_ratio(q, city) * 0.3
            score += fuzz.token_sort_ratio(q, name) * 0.2

            # India Priority
            if country == "India":
                score += 20
            else:
                score -= 20

            if score > 80:
                scored.append((score, a))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = [a for _, a in scored[:10]]

        return [
            {
                "iata": a["iata_code"],
                "label": f'{a["city"]} ({a["iata_code"]})',
                "city": a["city"],
                "airport": a["name"],
                "country": a["country"]
            }
            for a in results
        ]

    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Airport search failed")