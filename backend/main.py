"""
SkyMind – FastAPI Backend (FULLY FIXED)
=========================================
Fixes:
  1. All airlines parsed from Amadeus (not just Air India)
  2. City name → IATA conversion
  3. Proper CORS for all origins
  4. Alerts system fully working
  5. Auth integration
  6. Background job for price alerts
  7. Real notification dispatch
  8. Health check
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import traceback
import uuid
from datetime import datetime
import asyncio
import logging

logger = logging.getLogger(__name__)

from ml.price_predictor import predictor

# ---------------------------------------------------------------------------
# City → IATA mapping
# ---------------------------------------------------------------------------
CITY_TO_IATA = {
    "delhi": "DEL", "new delhi": "DEL", "newdelhi": "DEL",
    "mumbai": "BOM", "bombay": "BOM",
    "bangalore": "BLR", "bengaluru": "BLR", "bengalore": "BLR",
    "hyderabad": "HYD",
    "chennai": "MAA", "madras": "MAA",
    "kolkata": "CCU", "calcutta": "CCU",
    "kochi": "COK", "cochin": "COK",
    "goa": "GOI", "south goa": "GOI", "north goa": "MYA",
    "ahmedabad": "AMD",
    "jaipur": "JAI", "pink city": "JAI",
    "lucknow": "LKO",
    "pune": "PNQ", "poona": "PNQ",
    "amritsar": "ATQ",
    "guwahati": "GAU",
    "varanasi": "VNS", "banaras": "VNS",
    "patna": "PAT",
    "bhubaneswar": "BBI",
    "ranchi": "IXR",
    "chandigarh": "IXC",
    "srinagar": "SXR",
    "jammu": "IXJ",
    "leh": "IXL",
    "dehradun": "DED",
    "imphal": "IMF",
    "nagpur": "NAG",
    "indore": "IDR",
    "bhopal": "BHO",
    "raipur": "RPR",
    "visakhapatnam": "VTZ", "vizag": "VTZ",
    "coimbatore": "CJB",
    "madurai": "IXM",
    "trichy": "TRZ", "tiruchirappalli": "TRZ",
    "thiruvananthapuram": "TRV", "trivandrum": "TRV",
    "kozhikode": "CCJ", "calicut": "CCJ",
    "mangalore": "IXE",
    "mysore": "MYQ", "mysuru": "MYQ",
    "siliguri": "IXB", "bagdogra": "IXB",
    "udaipur": "UDR",
    "jodhpur": "JDH",
    "jaisalmer": "JSA",
    "port blair": "IXZ", "andaman": "IXZ",
    "agatti": "AGX", "lakshadweep": "AGX",
    "dubai": "DXB",
    "london": "LHR",
    "singapore": "SIN",
    "doha": "DOH",
    "abu dhabi": "AUH",
    "bangkok": "BKK",
    "kuala lumpur": "KUL",
    "new york": "JFK",
    "tokyo": "NRT",
    "istanbul": "IST",
}

AIRLINE_MAP = {
    "AI": "Air India",
    "6E": "IndiGo",
    "UK": "Vistara",
    "SG": "SpiceJet",
    "IX": "Air India Express",
    "QP": "Akasa Air",
    "G8": "Go First",
    "S5": "Star Air",
    "2T": "TruJet",
    "I7": "Alliance Air",
    "EK": "Emirates",
    "SQ": "Singapore Airlines",
    "QR": "Qatar Airways",
    "EY": "Etihad Airways",
    "BA": "British Airways",
    "TK": "Turkish Airlines",
    "MH": "Malaysia Airlines",
    "LH": "Lufthansa",
    "AF": "Air France",
    "KL": "KLM",
    "NH": "ANA",
    "JL": "Japan Airlines",
    "CX": "Cathay Pacific",
    "TG": "Thai Airways",
    "OZ": "Asiana Airlines",
    "KE": "Korean Air",
    "FZ": "flydubai",
    "G9": "Air Arabia",
    "XY": "Flynas",
    "WY": "Oman Air",
    "UL": "SriLankan Airlines",
}

def resolve_iata(code: str) -> str:
    """Convert city name or IATA code to IATA code."""
    if not code:
        return code
    code_stripped = code.strip()
    # If already looks like IATA (2-4 uppercase letters)
    if len(code_stripped) <= 4 and code_stripped.isalpha():
        return code_stripped.upper()
    # Try city name mapping
    lower = code_stripped.lower()
    return CITY_TO_IATA.get(lower, code_stripped.upper())


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SkyMind AI API",
    version="3.0.0",
    description="AI-powered flight price prediction backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "https://skymind-gray.vercel.app",
        "https://*.vercel.app",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ---------------------------------------------------------------------------
# Mount routers
# ---------------------------------------------------------------------------
try:
    from routers import flights, prediction, booking, payment, auth, notifications, alerts, user
    app.include_router(flights.router,       prefix="/flights",       tags=["flights"])
    app.include_router(prediction.router,    prefix="/prediction",    tags=["prediction"])
    app.include_router(booking.router,       prefix="/booking",       tags=["booking"])
    app.include_router(payment.router,       prefix="/payment",       tags=["payment"])
    app.include_router(auth.router,          prefix="/auth",          tags=["auth"])
    app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
    app.include_router(alerts.router,        prefix="/alerts",        tags=["alerts"])
    app.include_router(user.router,          prefix="/user",          tags=["user"])
except Exception as e:
    logger.warning(f"Could not mount some routers: {e}")

# ---------------------------------------------------------------------------
# In-memory alert store
# ---------------------------------------------------------------------------
_alerts: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    origin: str
    destination: str
    departure_date: str | None = None

    @field_validator("origin", "destination")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = resolve_iata(v.strip())
        if not v:
            raise ValueError("Field cannot be empty")
        return v

    @field_validator("destination")
    @classmethod
    def different_from_origin(cls, v: str, info) -> str:
        origin = info.data.get("origin", "")
        if resolve_iata(v).upper() == resolve_iata(origin).upper():
            raise ValueError("Origin and destination cannot be the same")
        return resolve_iata(v)


class SetAlertRequest(BaseModel):
    origin: str
    destination: str
    target_price: float
    departure_date: str | None = None
    user_label: str | None = None
    user_id: str | None = None
    notify_email: str | None = None
    notify_phone: str | None = None


class SearchRequest(BaseModel):
    origin: str
    destination: str
    departure_date: str
    return_date: str | None = None
    adults: int = 1
    cabin_class: str = "ECONOMY"
    currency: str = "INR"


# ---------------------------------------------------------------------------
# Background alert checker
# ---------------------------------------------------------------------------
async def _run_alert_checker():
    """Background task: check all alerts against current prices."""
    while True:
        await asyncio.sleep(1800)  # every 30 minutes
        try:
            for alert_id, alert in list(_alerts.items()):
                try:
                    result = predictor.forecast_with_analysis(
                        origin=alert["origin"],
                        destination=alert["destination"],
                    )
                    current_price = result["predicted_price"]
                    if current_price <= alert["target_price"]:
                        alert["triggered"] = True
                        alert["triggered_at"] = datetime.utcnow().isoformat()
                        alert["current_price"] = current_price
                        # Send notifications
                        _dispatch_alert_notification(alert, current_price)
                except Exception as e:
                    logger.error(f"Alert check failed: {e}")
        except Exception as e:
            logger.error(f"Alert checker error: {e}")


def _dispatch_alert_notification(alert: dict, current_price: float):
    """Send email/SMS notifications for triggered alert."""
    try:
        from services.notifications import dispatcher
        alert_data = {
            "name": alert.get("user_label", "Traveller"),
            "origin": alert["origin"],
            "destination": alert["destination"],
            "departure_date": alert.get("departure_date", ""),
            "target_price": alert["target_price"],
            "current_price": current_price,
            "cabin": "Economy",
        }
        if alert.get("notify_email"):
            dispatcher.email.send_price_alert(alert["notify_email"], alert_data)
        if alert.get("notify_phone"):
            dispatcher.sms.send_price_alert(alert["notify_phone"], alert_data)
    except Exception as e:
        logger.error(f"Notification dispatch failed: {e}")


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(_run_alert_checker())
    try:
        from services.scheduler import start_scheduler
        start_scheduler()
    except Exception as e:
        logger.warning(f"Scheduler not started: {e}")


# ---------------------------------------------------------------------------
# Core endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "SkyMind AI API",
        "version": "3.0.0",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "SkyMind AI API — use /docs for API reference",
        "version": "3.0.0",
    }


@app.get("/resolve-airport")
def resolve_airport(q: str):
    """Resolve city name or IATA code."""
    iata = resolve_iata(q)
    return {"input": q, "iata": iata}


@app.post("/predict")
def predict(body: PredictRequest):
    """AI-driven flight price forecast and booking recommendation."""
    try:
        result = predictor.forecast_with_analysis(
            origin=resolve_iata(body.origin),
            destination=resolve_iata(body.destination),
            departure_date=body.departure_date,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Internal server error during price prediction. Please try again.",
        )


@app.post("/set-alert")
def set_alert(body: SetAlertRequest):
    """Store a price alert."""
    origin = resolve_iata(body.origin)
    destination = resolve_iata(body.destination)

    if not origin or not destination:
        raise HTTPException(status_code=422, detail="Origin and destination are required")
    if origin == destination:
        raise HTTPException(status_code=422, detail="Origin and destination cannot be the same")
    if body.target_price <= 0:
        raise HTTPException(status_code=422, detail="Target price must be positive")

    alert_id = str(uuid.uuid4())[:8]
    _alerts[alert_id] = {
        "id": alert_id,
        "origin": origin,
        "destination": destination,
        "target_price": body.target_price,
        "departure_date": body.departure_date,
        "user_label": body.user_label or f"{origin}→{destination}",
        "user_id": body.user_id,
        "notify_email": body.notify_email,
        "notify_phone": body.notify_phone,
        "created_at": datetime.utcnow().isoformat(),
        "triggered": False,
        "current_price": None,
    }

    return {
        "success": True,
        "alert_id": alert_id,
        "message": f"Alert set for {origin}→{destination} at ₹{body.target_price:,.0f}",
    }


@app.get("/check-alerts")
def check_alerts(user_id: str | None = None):
    """Check all stored alerts against current predicted prices."""
    triggered = []
    all_alerts = []

    for alert_id, alert in _alerts.items():
        # Filter by user_id if provided
        if user_id and alert.get("user_id") and alert["user_id"] != user_id:
            continue
        try:
            result = predictor.forecast_with_analysis(
                origin=alert["origin"],
                destination=alert["destination"],
            )
            current_price = result["predicted_price"]
            is_triggered = current_price <= alert["target_price"]

            enriched = {
                **alert,
                "current_price": current_price,
                "triggered": is_triggered,
                "savings": round(alert["target_price"] - current_price, 2) if is_triggered else 0,
                "trend": result["trend"],
                "recommendation": result["recommendation"],
            }
            all_alerts.append(enriched)
            if is_triggered:
                triggered.append(enriched)
        except Exception:
            all_alerts.append(alert)

    return {
        "alerts": all_alerts,
        "triggered": triggered,
        "triggered_count": len(triggered),
    }


@app.delete("/alerts/{alert_id}")
def delete_alert(alert_id: str):
    """Remove a price alert."""
    if alert_id not in _alerts:
        raise HTTPException(status_code=404, detail="Alert not found")
    del _alerts[alert_id]
    return {"success": True, "message": "Alert removed"}


@app.get("/airline-logo/{iata_code}")
def get_airline_logo_url(iata_code: str):
    """Return airline logo URL."""
    code = iata_code.upper()
    return {
        "iata": code,
        "name": AIRLINE_MAP.get(code, code),
        "logo_url": f"https://content.airhex.com/content/logos/airlines_{code}_200_200_s.png",
        "logo_rect": f"https://content.airhex.com/content/logos/airlines_{code}_100_25_r.png",
    }


@app.get("/airlines")
def list_airlines():
    """Return all known airline mappings."""
    return {
        code: {
            "name": name,
            "logo_url": f"https://content.airhex.com/content/logos/airlines_{code}_200_200_s.png",
        }
        for code, name in AIRLINE_MAP.items()
    }


@app.get("/city-to-iata")
def city_to_iata_endpoint(city: str):
    """Convert city name to IATA code."""
    iata = resolve_iata(city)
    return {"city": city, "iata": iata}
