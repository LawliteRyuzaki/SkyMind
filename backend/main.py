import requests
import os
import traceback
import uuid
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from ml.price_predictor import predictor


# =========================
# CONFIG
# =========================
AMADEUS_API_KEY = os.getenv("AMADEUS_API_KEY")
AMADEUS_API_SECRET = os.getenv("AMADEUS_API_SECRET")


def get_amadeus_token():
    url = "https://test.api.amadeus.com/v1/security/oauth2/token"
    data = {
        "grant_type": "client_credentials",
        "client_id": AMADEUS_API_KEY,
        "client_secret": AMADEUS_API_SECRET,
    }
    res = requests.post(url, data=data)
    return res.json()["access_token"]


# =========================
# APP
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_alerts = {}


# =========================
# SCHEMAS
# =========================
class PredictRequest(BaseModel):
    origin: str
    destination: str
    departure_date: str | None = None


class SetAlertRequest(BaseModel):
    origin: str
    destination: str
    target_price: float


# =========================
# SEARCH (🔥 FIXED)
# =========================
@app.get("/search")
def search_flights(origin: str, destination: str, date: str):

    token = get_amadeus_token()

    url = "https://test.api.amadeus.com/v2/shopping/flight-offers"

    headers = {"Authorization": f"Bearer {token}"}

    params = {
        "originLocationCode": origin,
        "destinationLocationCode": destination,
        "departureDate": date,
        "adults": 1,
        "max": 10,
    }

    res = requests.get(url, headers=headers, params=params)
    data = res.json()

    flights = []

    for item in data.get("data", []):
        seg = item["itineraries"][0]["segments"][0]

        flights.append({
            "airline": seg["carrierCode"],
            "departure": seg["departure"]["at"],
            "arrival": seg["arrival"]["at"],
            "price": float(item["price"]["total"]),
        })

    return {"flights": flights}


# =========================
# PREDICT
# =========================
@app.post("/predict")
def predict(body: PredictRequest):
    try:
        result = predictor.forecast_with_analysis(
            origin=body.origin,
            destination=body.destination,
            departure_date=body.departure_date,
        )

        # 🔥 FIX
        result["predicted_price"] = result["forecast"][0]["price"]

        return result

    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Prediction error")


# =========================
# ALERTS
# =========================
@app.post("/set-alert")
def set_alert(body: SetAlertRequest):

    alert_id = str(uuid.uuid4())[:8]

    _alerts[alert_id] = {
        "id": alert_id,
        "origin": body.origin,
        "destination": body.destination,
        "target_price": body.target_price,
        "triggered": False,
        "created_at": datetime.utcnow().isoformat(),
    }

    return {"success": True, "alert_id": alert_id}


@app.get("/check-alerts")
def check_alerts():

    triggered = []

    for alert in _alerts.values():
        try:
            result = predictor.forecast_with_analysis(
                origin=alert["origin"],
                destination=alert["destination"],
            )

            current_price = result["forecast"][0]["price"]

            if current_price <= alert["target_price"] and not alert["triggered"]:
                alert["triggered"] = True
                triggered.append(alert)

        except Exception as e:
            print("Alert error:", e)

    return {"triggered": triggered}


@app.delete("/alerts/{alert_id}")
def delete_alert(alert_id: str):
    if alert_id not in _alerts:
        raise HTTPException(status_code=404, detail="Not found")

    del _alerts[alert_id]
    return {"success": True}