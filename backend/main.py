"""
SkyMind – FastAPI Backend (FIXED)
===================================
Fixed:
  1. POST /predict — real ML output, no static data
  2. POST /set-alert — in-memory alert store
  3. GET /check-alerts — compare predicted vs target, return triggered alerts
  4. CORS configured for local + Vercel
  5. Full error handling + validation
  6. Health check endpoint
  7. Proper router mounting
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import traceback
import uuid
from datetime import datetime

from ml.price_predictor import predictor

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SkyMind AI API",
    version="2.0.0",
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
# Mount existing routers
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
    print(f"[WARN] Could not mount some routers: {e}")

# ---------------------------------------------------------------------------
# In-memory alert store  { alert_id: AlertRecord }
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
        v = v.strip().upper()
        if not v:
            raise ValueError("Field cannot be empty")
        return v

    @field_validator("destination")
    @classmethod
    def different_from_origin(cls, v: str, info) -> str:
        origin = info.data.get("origin", "")
        if v.upper() == origin.upper():
            raise ValueError("Origin and destination cannot be the same")
        return v


class SetAlertRequest(BaseModel):
    origin: str
    destination: str
    target_price: float
    departure_date: str | None = None
    user_label: str | None = None


# ---------------------------------------------------------------------------
# Core endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "SkyMind AI API", "version": "2.0.0"}


@app.get("/")
def root():
    return {"status": "ok", "message": "SkyMind AI API — use /docs for API reference"}


@app.post("/predict")
def predict(body: PredictRequest):
    """
    Returns AI-driven flight price forecast and booking recommendation.
    """
    try:
        result = predictor.forecast_with_analysis(
            origin=body.origin,
            destination=body.destination,
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
    """Store a price alert in memory."""
    origin = body.origin.strip().upper()
    destination = body.destination.strip().upper()

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
        "created_at": datetime.utcnow().isoformat(),
        "triggered": False,
    }

    return {
        "success": True,
        "alert_id": alert_id,
        "message": f"Alert set for {origin}→{destination} at ₹{body.target_price:,.0f}",
    }


@app.get("/check-alerts")
def check_alerts():
    """Check all stored alerts against current predicted prices."""
    triggered = []
    all_alerts = []

    for alert_id, alert in _alerts.items():
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
            pass

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
