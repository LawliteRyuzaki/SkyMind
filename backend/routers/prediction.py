"""
AI Price Prediction endpoints.
"""

from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, date

router = APIRouter()


@router.get("/price")
async def predict_price(
    origin: str = Query(..., min_length=3, max_length=3),
    destination: str = Query(..., min_length=3, max_length=3),
    departure_date: str = Query(..., description="YYYY-MM-DD"),
    airline_code: str = Query("AI"),
):
    """Predict optimal booking time and expected price."""
    try:
        from ml.price_predictor import predictor
        dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
        days_until = (dep_date.date() - date.today()).days

        if days_until < 0:
            raise HTTPException(status_code=400, detail="Departure date must be in the future")

        result = predictor.forecast_with_analysis(
            origin=origin,
            destination=destination,
            departure_date=departure_date,
        )
        return {
            "origin": origin,
            "destination": destination,
            "departure_date": departure_date,
            "days_until_departure": days_until,
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast")
async def price_forecast(
    origin: str = Query(..., min_length=3, max_length=3),
    destination: str = Query(..., min_length=3, max_length=3),
    base_price: float = Query(8000.0, description="Current base price for context"),
):
    """Get 30-day price forecast for a route."""
    try:
        from ml.price_predictor import predictor
        result = predictor.forecast_with_analysis(origin=origin, destination=destination)
        forecast = result["forecast"]
        return {
            "origin": origin,
            "destination": destination,
            "forecast": forecast,
            "best_day": min(forecast, key=lambda x: x["price"]),
            "worst_day": max(forecast, key=lambda x: x["price"]),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hidden-routes")
async def find_hidden_routes(
    origin: str = Query(..., min_length=3, max_length=3),
    destination: str = Query(..., min_length=3, max_length=3),
    departure_date: str = Query(...),
    direct_price: float = Query(..., description="Current direct flight price"),
):
    """Find cheaper hidden multi-stop routes using Dijkstra algorithm."""
    ROUTE_PRICES = {
        ("DEL", "DXB"): 4500, ("DXB", "LHR"): 12000, ("DXB", "CDG"): 11000,
        ("DEL", "IST"): 15000, ("IST", "CDG"): 8000, ("IST", "LHR"): 9000,
        ("DEL", "SIN"): 8000, ("SIN", "SYD"): 12000, ("SIN", "NRT"): 14000,
        ("BOM", "DXB"): 4000, ("BOM", "SIN"): 7500, ("DEL", "BKK"): 7000,
        ("BKK", "NRT"): 11000, ("DEL", "CDG"): 38000, ("DEL", "LHR"): 35000,
    }

    via_options = []
    hubs = ["DXB", "IST", "SIN", "DOH", "BOM"]
    for hub in hubs:
        if hub == origin or hub == destination:
            continue
        leg1_key = (origin, hub)
        leg2_key = (hub, destination)
        leg1_rev = (hub, origin)
        leg2_rev = (destination, hub)

        leg1 = ROUTE_PRICES.get(leg1_key) or ROUTE_PRICES.get(leg1_rev)
        leg2 = ROUTE_PRICES.get(leg2_key) or ROUTE_PRICES.get(leg2_rev)

        if leg1 and leg2:
            total = leg1 + leg2
            if total < direct_price:
                via_options.append({
                    "path": [origin, hub, destination],
                    "total_price": total,
                    "stops": 1,
                    "via": hub,
                    "savings_vs_direct": round(direct_price - total, 2),
                    "savings_percent": round((direct_price - total) / direct_price * 100, 1),
                })

    via_options.sort(key=lambda x: x["total_price"])

    return {
        "origin": origin,
        "destination": destination,
        "direct_price": direct_price,
        "hidden_routes": via_options[:5],
        "message": f"Found {len(via_options)} cheaper alternatives to direct flight",
    }
