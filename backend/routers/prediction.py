"""
AI Price Prediction + Price Alert endpoints.
"""

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from datetime import datetime, date
from typing import List, Optional
from ml.price_model import get_predictor, HiddenRouteFinder
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# ══════════════════════════════════════════════════════════════════════
# In-memory alert store (demo-friendly, no DB required)
# ══════════════════════════════════════════════════════════════════════
_alerts: List[dict] = []


# ── 1. Single price prediction ─────────────────────────────────────────
@router.get("/price")
async def predict_price(
    origin:         str   = Query(..., min_length=3, max_length=3),
    destination:    str   = Query(..., min_length=3, max_length=3),
    departure_date: str   = Query(..., description="YYYY-MM-DD"),
    airline_code:   str   = Query("AI"),
):
    """Predict price + recommendation for a specific flight."""
    try:
        predictor  = get_predictor()
        dep_date   = datetime.strptime(departure_date, "%Y-%m-%d")
        days_until = (dep_date.date() - date.today()).days

        if days_until < 0:
            raise HTTPException(status_code=400, detail="Departure date must be in the future")

        result = predictor.predict(
            days_until_departure=days_until,
            departure_date=dep_date,
            airline_code=airline_code,
            origin_code=origin,
            destination_code=destination,
        )
        return {
            "origin":            origin,
            "destination":       destination,
            "departure_date":    departure_date,
            "days_until_departure": days_until,
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── 2. Full 30-day forecast with analysis (main predict page) ──────────
@router.get("/forecast")
async def price_forecast(
    origin:      str   = Query(..., min_length=3, max_length=3),
    destination: str   = Query(..., min_length=3, max_length=3),
    base_price:  float = Query(8000.0),
):
    """
    Full AI analysis: 30-day forecast + trend + recommendation.
    Uses forecast_with_analysis() for data-driven results.
    """
    try:
        predictor = get_predictor()
        analysis  = predictor.forecast_with_analysis(
            origin=origin.upper(),
            destination=destination.upper(),
            base_price=base_price,
        )
        return {
            "origin":      origin.upper(),
            "destination": destination.upper(),
            **analysis,
        }
    except Exception as e:
        logger.error(f"Forecast error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── 3. Hidden routes via Dijkstra ─────────────────────────────────────
@router.get("/hidden-routes")
async def find_hidden_routes(
    origin:         str   = Query(..., min_length=3, max_length=3),
    destination:    str   = Query(..., min_length=3, max_length=3),
    departure_date: str   = Query(...),
    direct_price:   float = Query(...),
):
    """Find cheaper hidden multi-stop routes using Dijkstra algorithm."""
    ROUTE_PRICES = {
        ("DEL","DXB"):4500, ("DXB","LHR"):12000, ("DXB","CDG"):11000,
        ("DEL","IST"):15000,("IST","CDG"):8000,  ("IST","LHR"):9000,
        ("DEL","SIN"):8000, ("SIN","SYD"):12000, ("SIN","NRT"):14000,
        ("BOM","DXB"):4000, ("BOM","SIN"):7500,  ("DEL","BKK"):7000,
        ("BKK","NRT"):11000,("DEL","CDG"):38000, ("DEL","LHR"):35000,
        ("BOM","LHR"):28000,("CCU","DXB"):6000,  ("HYD","DXB"):5500,
        ("MAA","SIN"):7000, ("BLR","DXB"):5000,  ("AMD","DXB"):5200,
        ("DEL","NRT"):32000,("BOM","NRT"):30000, ("DEL","SYD"):40000,
    }

    finder = HiddenRouteFinder()
    for (o, d), price in ROUTE_PRICES.items():
        finder.add_route(o, d, price)
        finder.add_route(d, o, price)

    via_options = []
    hubs = ["DXB","IST","SIN","DOH","KUL","CMB","BKK","AUH"]
    for hub in hubs:
        if hub in [origin, destination]: continue
        leg1 = ROUTE_PRICES.get((origin, hub)) or ROUTE_PRICES.get((hub, origin))
        leg2 = ROUTE_PRICES.get((hub, destination)) or ROUTE_PRICES.get((destination, hub))
        if leg1 and leg2:
            total = leg1 + leg2
            if total < direct_price:
                savings = direct_price - total
                via_options.append({
                    "path":             [origin, hub, destination],
                    "total_price":      total,
                    "stops":            1,
                    "via":              hub,
                    "savings_vs_direct":round(savings, 2),
                    "savings_percent":  round(savings / direct_price * 100, 1),
                })

    via_options.sort(key=lambda x: x["total_price"])
    return {
        "origin":        origin,
        "destination":   destination,
        "direct_price":  direct_price,
        "hidden_routes": via_options[:5],
        "message":       f"Found {len(via_options)} cheaper alternatives",
    }


# ══════════════════════════════════════════════════════════════════════
# PRICE ALERT SYSTEM
# ══════════════════════════════════════════════════════════════════════

class AlertRequest(BaseModel):
    origin:       str
    destination:  str
    target_price: float
    label:        Optional[str] = None   # e.g. "DEL→DXB May trip"


@router.post("/set-alert")
async def set_alert(req: AlertRequest):
    """Store a price alert in memory."""
    import uuid
    alert = {
        "id":           str(uuid.uuid4())[:8],
        "origin":       req.origin.upper(),
        "destination":  req.destination.upper(),
        "target_price": req.target_price,
        "label":        req.label or f"{req.origin.upper()}→{req.destination.upper()}",
        "created_at":   datetime.now().isoformat(),
        "triggered":    False,
    }
    _alerts.append(alert)
    logger.info(f"Alert set: {alert}")
    return {
        "success":    True,
        "alert_id":   alert["id"],
        "message":    f"Alert set! You'll be notified when {req.origin.upper()}→{req.destination.upper()} drops below ₹{req.target_price:,.0f}",
    }


@router.get("/check-alerts")
async def check_alerts():
    """
    Check all active alerts against current ML predictions.
    Returns triggered alerts with current price + recommendation.
    """
    predictor  = get_predictor()
    triggered  = []
    active     = []

    for alert in _alerts:
        if alert.get("triggered"):
            continue
        try:
            analysis = predictor.forecast_with_analysis(
                origin=alert["origin"],
                destination=alert["destination"],
            )
            current_price = analysis["predicted_price"]
            if current_price <= alert["target_price"]:
                alert["triggered"]      = True
                alert["current_price"]  = current_price
                alert["recommendation"] = analysis["recommendation"]
                alert["reason"]         = analysis["reason"]
                triggered.append(alert)
            else:
                alert["current_price"]  = current_price
                active.append(alert)
        except Exception as e:
            logger.warning(f"Alert check failed for {alert['id']}: {e}")
            active.append(alert)

    return {
        "triggered": triggered,
        "active":    active,
        "total":     len(_alerts),
    }


@router.get("/list-alerts")
async def list_alerts():
    """Return all alerts (triggered + active)."""
    return {"alerts": _alerts, "total": len(_alerts)}


@router.delete("/delete-alert/{alert_id}")
async def delete_alert(alert_id: str):
    """Delete an alert by ID."""
    global _alerts
    before = len(_alerts)
    _alerts = [a for a in _alerts if a["id"] != alert_id]
    return {"success": len(_alerts) < before, "remaining": len(_alerts)}
