"""
Flight search and listing endpoints.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from datetime import datetime, date

from services.amadeus import amadeus_service, parse_flight_offers

router = APIRouter()


def get_ai_insight(origin: str, destination: str, days_until: int) -> dict:
    """Get AI price insight for a route. Gracefully falls back if model unavailable."""
    try:
        from ml.price_predictor import predictor
        result = predictor.forecast_with_analysis(origin=origin, destination=destination)
        rec = result["recommendation"]
        return {
            "recommendation": rec,
            "reason": result["reason"],
            "probability_increase": result["probability_increase"],
            "trend": result["trend"],
        }
    except Exception:
        pass

    try:
        from ml.price_model import get_predictor
        predictor_ml = get_predictor()
        dep_date = datetime.today()
        prediction = predictor_ml.predict(
            days_until_departure=max(1, days_until),
            departure_date=dep_date,
            origin_code=origin,
            destination_code=destination,
        )
        return {
            "recommendation": prediction.get("recommendation", "MONITOR"),
            "reason": prediction.get("reason", "Monitor prices for this route."),
            "probability_increase": prediction.get("probability_increase", 0.5),
            "trend": prediction.get("price_trend", "STABLE"),
        }
    except Exception:
        return {
            "recommendation": "MONITOR",
            "reason": "Monitor prices for this route.",
            "probability_increase": 0.5,
            "trend": "STABLE",
        }


@router.get("/search")
async def search_flights(
    origin: str = Query(..., min_length=3, max_length=3, description="IATA origin code"),
    destination: str = Query(..., min_length=3, max_length=3, description="IATA destination code"),
    departure_date: str = Query(..., description="YYYY-MM-DD"),
    return_date: Optional[str] = Query(None, description="YYYY-MM-DD for round trip"),
    adults: int = Query(1, ge=1, le=9),
    cabin_class: str = Query("ECONOMY", description="ECONOMY|BUSINESS|FIRST|PREMIUM_ECONOMY"),
    currency: str = Query("INR"),
    max_results: int = Query(20, ge=1, le=50),
):
    """Search for flights using Amadeus API."""
    try:
        raw = await amadeus_service.search_flights(
            origin=origin,
            destination=destination,
            departure_date=departure_date,
            return_date=return_date,
            adults=adults,
            cabin_class=cabin_class,
            currency=currency,
            max_results=max_results,
        )
        flights = parse_flight_offers(raw)

        # Enrich with AI price insights
        try:
            dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
            days_until = (dep_date.date() - date.today()).days
        except Exception:
            days_until = 30

        for flight in flights:
            flight["ai_insight"] = get_ai_insight(origin, destination, days_until)

        return {
            "flights": flights,
            "count": len(flights),
            "search_params": {
                "origin": origin,
                "destination": destination,
                "departure_date": departure_date,
                "return_date": return_date,
                "adults": adults,
                "cabin_class": cabin_class,
                "currency": currency,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Flight search failed: {str(e)}")


@router.get("/airports")
async def search_airports(
    q: str = Query(..., min_length=2, description="City or airport name"),
):
    """Search airports by city/name."""
    AIRPORTS = [
        {"iata": "DEL", "city": "New Delhi", "name": "Indira Gandhi International", "country": "India"},
        {"iata": "BOM", "city": "Mumbai", "name": "Chhatrapati Shivaji Maharaj International", "country": "India"},
        {"iata": "BLR", "city": "Bengaluru", "name": "Kempegowda International", "country": "India"},
        {"iata": "MAA", "city": "Chennai", "name": "Chennai International", "country": "India"},
        {"iata": "HYD", "city": "Hyderabad", "name": "Rajiv Gandhi International", "country": "India"},
        {"iata": "CCU", "city": "Kolkata", "name": "Netaji Subhas Chandra Bose International", "country": "India"},
        {"iata": "COK", "city": "Kochi", "name": "Cochin International", "country": "India"},
        {"iata": "GOI", "city": "Goa", "name": "Goa International Airport", "country": "India"},
        {"iata": "AMD", "city": "Ahmedabad", "name": "Sardar Vallabhbhai Patel International", "country": "India"},
        {"iata": "JAI", "city": "Jaipur", "name": "Jaipur International", "country": "India"},
        {"iata": "PNQ", "city": "Pune", "name": "Pune Airport", "country": "India"},
        {"iata": "ATQ", "city": "Amritsar", "name": "Sri Guru Ram Dass Jee International", "country": "India"},
        {"iata": "LKO", "city": "Lucknow", "name": "Chaudhary Charan Singh International", "country": "India"},
        {"iata": "DXB", "city": "Dubai", "name": "Dubai International", "country": "UAE"},
        {"iata": "LHR", "city": "London", "name": "Heathrow", "country": "UK"},
        {"iata": "CDG", "city": "Paris", "name": "Charles de Gaulle", "country": "France"},
        {"iata": "JFK", "city": "New York", "name": "John F. Kennedy International", "country": "USA"},
        {"iata": "SIN", "city": "Singapore", "name": "Changi Airport", "country": "Singapore"},
        {"iata": "BKK", "city": "Bangkok", "name": "Suvarnabhumi Airport", "country": "Thailand"},
        {"iata": "IST", "city": "Istanbul", "name": "Istanbul Airport", "country": "Turkey"},
        {"iata": "NRT", "city": "Tokyo", "name": "Narita International", "country": "Japan"},
        {"iata": "DOH", "city": "Doha", "name": "Hamad International", "country": "Qatar"},
    ]
    q_lower = q.lower()
    results = [
        a for a in AIRPORTS
        if q_lower in a["city"].lower()
        or q_lower in a["iata"].lower()
        or q_lower in a["name"].lower()
    ]
    return {"airports": results}


@router.get("/inspiration")
async def flight_inspiration(
    origin: str = Query(..., min_length=3, max_length=3),
    currency: str = Query("INR"),
):
    """Get cheapest destinations from an origin airport."""
    try:
        raw = await amadeus_service.get_flight_inspiration(origin=origin, currency=currency)
        return raw
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cheapest-dates")
async def cheapest_dates(
    origin: str = Query(..., min_length=3, max_length=3),
    destination: str = Query(..., min_length=3, max_length=3),
):
    """Get cheapest dates for a route."""
    try:
        raw = await amadeus_service.get_cheapest_dates(origin=origin, destination=destination)
        return raw
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
