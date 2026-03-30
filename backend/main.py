"""
SkyMind – FastAPI Backend  (FIXED)
====================================
Fixes applied:
  1. POST /predict endpoint added / corrected
  2. Request body uses Pydantic (origin + destination)
  3. Calls predictor.forecast_with_analysis() – no fake data
  4. Structured JSON errors on all failure paths
  5. CORS configured for local dev + production frontend
  6. Health check endpoint added
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import traceback

from ml.price_predictor import predictor  # singleton instance


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SkyMind AI API",
    version="1.0.0",
    description="AI-powered flight price prediction backend",
)

# CORS – allow Next.js dev server and production URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://sky-mind-eta.vercel.app",
        "*",  # remove in strict production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    origin: str
    destination: str
    departure_date: str | None = None  # optional ISO date string

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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "SkyMind AI API"}


@app.post("/predict")
def predict(body: PredictRequest):
    """
    Returns AI-driven flight price forecast and booking recommendation.

    Request body:
        { "origin": "DEL", "destination": "BOM", "departure_date": "2025-06-15" }

    Response:
        {
            "predicted_price": 7240.50,
            "forecast": [...],
            "trend": "RISING",
            "probability_increase": 0.72,
            "confidence": 0.83,
            "recommendation": "BOOK_NOW",
            "reason": "...",
            "expected_change_percent": 8.4
        }
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
        # Log full traceback server-side, return clean error to client
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Internal server error during price prediction. Please try again.",
        )
