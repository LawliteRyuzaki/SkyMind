"""
Flight search and listing endpoints — FULLY FIXED.
Now parses ALL airlines, not just Air India.
Supports city name → IATA conversion.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from datetime import datetime, date
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Full airline name map — same as main.py
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

CITY_TO_IATA = {
    "delhi": "DEL", "new delhi": "DEL",
    "mumbai": "BOM", "bombay": "BOM",
    "bangalore": "BLR", "bengaluru": "BLR",
    "hyderabad": "HYD",
    "chennai": "MAA", "madras": "MAA",
    "kolkata": "CCU", "calcutta": "CCU",
    "kochi": "COK", "cochin": "COK",
    "goa": "GOI",
    "ahmedabad": "AMD",
    "jaipur": "JAI",
    "lucknow": "LKO",
    "pune": "PNQ",
    "amritsar": "ATQ",
    "guwahati": "GAU",
    "varanasi": "VNS",
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
    "vizag": "VTZ", "visakhapatnam": "VTZ",
    "coimbatore": "CJB",
    "madurai": "IXM",
    "trichy": "TRZ", "tiruchirappalli": "TRZ",
    "trivandrum": "TRV", "thiruvananthapuram": "TRV",
    "calicut": "CCJ", "kozhikode": "CCJ",
    "mangalore": "IXE",
    "mysore": "MYQ",
    "siliguri": "IXB",
    "udaipur": "UDR",
    "jodhpur": "JDH",
    "port blair": "IXZ",
    "dubai": "DXB",
    "london": "LHR",
    "singapore": "SIN",
    "doha": "DOH",
    "bangkok": "BKK",
}


def resolve_iata(code: str) -> str:
    """Convert city name or IATA code to IATA code."""
    if not code:
        return code
    stripped = code.strip()
    lower = stripped.lower()
    if lower in CITY_TO_IATA:
        return CITY_TO_IATA[lower]
    return stripped.upper()


def parse_flight_offers_fixed(raw: dict) -> list[dict]:
    """
    Parse Amadeus response — extracts ALL airlines correctly.
    CRITICAL FIX: was previously only returning Air India.
    """
    offers = []
    data = raw.get("data", [])
    dictionaries = raw.get("dictionaries", {})

    # Merge Amadeus carrier dict with our hardcoded map
    carriers = {**AIRLINE_MAP, **dictionaries.get("carriers", {})}
    aircraft_dict = dictionaries.get("aircraft", {})

    for offer in data:
        itineraries = offer.get("itineraries", [])
        price_info = offer.get("price", {})

        parsed_itineraries = []
        for itin in itineraries:
            segments = []
            for seg in itin.get("segments", []):
                dep = seg.get("departure", {})
                arr = seg.get("arrival", {})
                # FIXED: use operating carrier if available, fallback to carrierCode
                carrier_code = (
                    seg.get("operating", {}).get("carrierCode")
                    or seg.get("carrierCode", "")
                )
                carrier_code = carrier_code.upper()
                airline_name = carriers.get(carrier_code, carrier_code)

                segments.append({
                    "flight_number": f"{carrier_code}{seg.get('number', '')}",
                    "airline_code": carrier_code,
                    "airline_name": airline_name,
                    "airline_logo": f"https://content.airhex.com/content/logos/airlines_{carrier_code}_200_200_s.png",
                    "airline_logo_rect": f"https://content.airhex.com/content/logos/airlines_{carrier_code}_100_25_r.png",
                    "aircraft": aircraft_dict.get(
                        seg.get("aircraft", {}).get("code", ""), "Unknown"
                    ),
                    "origin": dep.get("iataCode", ""),
                    "destination": arr.get("iataCode", ""),
                    "departure_time": dep.get("at", ""),
                    "arrival_time": arr.get("at", ""),
                    "duration": seg.get("duration", ""),
                    "cabin": seg.get("cabin", "ECONOMY"),
                    "stops": seg.get("numberOfStops", 0),
                    "terminal_departure": dep.get("terminal", ""),
                    "terminal_arrival": arr.get("terminal", ""),
                })
            parsed_itineraries.append({
                "duration": itin.get("duration", ""),
                "segments": segments,
            })

        # FIXED: correctly extract validating airlines
        validating = offer.get("validatingAirlineCodes", [])
        primary_carrier = validating[0] if validating else (
            parsed_itineraries[0]["segments"][0]["airline_code"]
            if parsed_itineraries and parsed_itineraries[0]["segments"]
            else "??"
        )

        total_price = float(price_info.get("grandTotal", price_info.get("total", 0)))
        base_price = float(price_info.get("base", total_price * 0.85))

        offers.append({
            "id": offer.get("id", str(len(offers))),
            "source": offer.get("source", "GDS"),
            "price": {
                "total": total_price,
                "base": base_price,
                "currency": price_info.get("currency", "INR"),
                "fees": price_info.get("fees", []),
                "grand_total": total_price,
            },
            "itineraries": parsed_itineraries,
            "validating_airlines": validating,
            "primary_airline": primary_carrier,
            "primary_airline_name": carriers.get(primary_carrier, primary_carrier),
            "primary_airline_logo": f"https://content.airhex.com/content/logos/airlines_{primary_carrier}_200_200_s.png",
            "traveler_pricings": offer.get("travelerPricings", []),
            "last_ticketing_date": offer.get("lastTicketingDate"),
            "seats_available": offer.get("numberOfBookableSeats"),
            "instant_ticketing": offer.get("instantTicketingRequired", False),
        })

    return offers


def get_ai_insight(origin: str, destination: str, days_until: int) -> dict:
    """Get AI price insight for a route."""
    try:
        from ml.price_predictor import predictor
        result = predictor.forecast_with_analysis(origin=origin, destination=destination)
        return {
            "recommendation": result["recommendation"],
            "reason": result["reason"],
            "probability_increase": result["probability_increase"],
            "trend": result["trend"],
            "predicted_price": result["predicted_price"],
        }
    except Exception:
        return {
            "recommendation": "MONITOR",
            "reason": "Monitor prices for this route.",
            "probability_increase": 0.5,
            "trend": "STABLE",
            "predicted_price": None,
        }


@router.get("/search")
async def search_flights(
    origin: str = Query(..., description="IATA code or city name"),
    destination: str = Query(..., description="IATA code or city name"),
    departure_date: str = Query(..., description="YYYY-MM-DD"),
    return_date: Optional[str] = Query(None),
    adults: int = Query(1, ge=1, le=9),
    cabin_class: str = Query("ECONOMY"),
    currency: str = Query("INR"),
    max_results: int = Query(20, ge=1, le=50),
):
    """Search flights — supports city names, returns ALL airlines."""
    # Resolve city names to IATA
    origin_iata = resolve_iata(origin)
    destination_iata = resolve_iata(destination)

    if origin_iata == destination_iata:
        raise HTTPException(status_code=400, detail="Origin and destination cannot be the same")

    try:
        from services.amadeus import amadeus_service
        raw = await amadeus_service.search_flights(
            origin=origin_iata,
            destination=destination_iata,
            departure_date=departure_date,
            return_date=return_date,
            adults=adults,
            cabin_class=cabin_class,
            currency=currency,
            max_results=max_results,
        )
        flights = parse_flight_offers_fixed(raw)
    except Exception as e:
        logger.error(f"Amadeus search failed: {e}")
        # Return meaningful error, not 500
        raise HTTPException(
            status_code=503,
            detail=f"Flight search temporarily unavailable: {str(e)}. Try routes like DEL→BOM."
        )

    # Enrich with AI insights
    try:
        dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
        days_until = (dep_date.date() - date.today()).days
    except Exception:
        days_until = 30

    ai = get_ai_insight(origin_iata, destination_iata, days_until)
    for flight in flights:
        flight["ai_insight"] = ai

    return {
        "flights": flights,
        "count": len(flights),
        "origin_iata": origin_iata,
        "destination_iata": destination_iata,
        "search_params": {
            "origin": origin_iata,
            "destination": destination_iata,
            "departure_date": departure_date,
            "return_date": return_date,
            "adults": adults,
            "cabin_class": cabin_class,
            "currency": currency,
        },
    }


@router.get("/airports")
async def search_airports(q: str = Query(..., min_length=1)):
    """Search airports by city/name/IATA."""
    AIRPORTS = [
        {"iata": "DEL", "city": "New Delhi", "name": "Indira Gandhi International", "country": "India", "state": "Delhi"},
        {"iata": "BOM", "city": "Mumbai", "name": "Chhatrapati Shivaji Maharaj International", "country": "India", "state": "Maharashtra"},
        {"iata": "BLR", "city": "Bengaluru", "name": "Kempegowda International", "country": "India", "state": "Karnataka"},
        {"iata": "MAA", "city": "Chennai", "name": "Chennai International", "country": "India", "state": "Tamil Nadu"},
        {"iata": "HYD", "city": "Hyderabad", "name": "Rajiv Gandhi International", "country": "India", "state": "Telangana"},
        {"iata": "CCU", "city": "Kolkata", "name": "Netaji Subhas Chandra Bose International", "country": "India", "state": "West Bengal"},
        {"iata": "COK", "city": "Kochi", "name": "Cochin International", "country": "India", "state": "Kerala"},
        {"iata": "GOI", "city": "Goa", "name": "Goa International Airport (Dabolim)", "country": "India", "state": "Goa"},
        {"iata": "MYA", "city": "North Goa", "name": "Mopa International Airport", "country": "India", "state": "Goa"},
        {"iata": "AMD", "city": "Ahmedabad", "name": "Sardar Vallabhbhai Patel International", "country": "India", "state": "Gujarat"},
        {"iata": "JAI", "city": "Jaipur", "name": "Jaipur International", "country": "India", "state": "Rajasthan"},
        {"iata": "LKO", "city": "Lucknow", "name": "Chaudhary Charan Singh International", "country": "India", "state": "Uttar Pradesh"},
        {"iata": "PNQ", "city": "Pune", "name": "Pune Airport", "country": "India", "state": "Maharashtra"},
        {"iata": "ATQ", "city": "Amritsar", "name": "Sri Guru Ram Dass Jee International", "country": "India", "state": "Punjab"},
        {"iata": "NAG", "city": "Nagpur", "name": "Dr. Babasaheb Ambedkar International", "country": "India", "state": "Maharashtra"},
        {"iata": "IXC", "city": "Chandigarh", "name": "Chandigarh International", "country": "India", "state": "Punjab"},
        {"iata": "SXR", "city": "Srinagar", "name": "Sheikh ul-Alam International", "country": "India", "state": "J&K"},
        {"iata": "IXJ", "city": "Jammu", "name": "Jammu Airport", "country": "India", "state": "J&K"},
        {"iata": "IXL", "city": "Leh", "name": "Kushok Bakula Rimpochhe Airport", "country": "India", "state": "Ladakh"},
        {"iata": "GAU", "city": "Guwahati", "name": "Lokpriya Gopinath Bordoloi International", "country": "India", "state": "Assam"},
        {"iata": "IMF", "city": "Imphal", "name": "Imphal International", "country": "India", "state": "Manipur"},
        {"iata": "IXB", "city": "Siliguri", "name": "Bagdogra Airport", "country": "India", "state": "West Bengal"},
        {"iata": "BBI", "city": "Bhubaneswar", "name": "Biju Patnaik International", "country": "India", "state": "Odisha"},
        {"iata": "IXR", "city": "Ranchi", "name": "Birsa Munda Airport", "country": "India", "state": "Jharkhand"},
        {"iata": "PAT", "city": "Patna", "name": "Jay Prakash Narayan International", "country": "India", "state": "Bihar"},
        {"iata": "VNS", "city": "Varanasi", "name": "Lal Bahadur Shastri International", "country": "India", "state": "Uttar Pradesh"},
        {"iata": "IDR", "city": "Indore", "name": "Devi Ahilyabai Holkar Airport", "country": "India", "state": "Madhya Pradesh"},
        {"iata": "BHO", "city": "Bhopal", "name": "Raja Bhoj Airport", "country": "India", "state": "Madhya Pradesh"},
        {"iata": "RPR", "city": "Raipur", "name": "Swami Vivekananda Airport", "country": "India", "state": "Chhattisgarh"},
        {"iata": "VTZ", "city": "Visakhapatnam", "name": "Visakhapatnam Airport", "country": "India", "state": "Andhra Pradesh"},
        {"iata": "TRV", "city": "Thiruvananthapuram", "name": "Trivandrum International", "country": "India", "state": "Kerala"},
        {"iata": "CCJ", "city": "Kozhikode", "name": "Calicut International", "country": "India", "state": "Kerala"},
        {"iata": "CNN", "city": "Kannur", "name": "Kannur International", "country": "India", "state": "Kerala"},
        {"iata": "IXM", "city": "Madurai", "name": "Madurai Airport", "country": "India", "state": "Tamil Nadu"},
        {"iata": "TRZ", "city": "Tiruchirappalli", "name": "Tiruchirappalli International", "country": "India", "state": "Tamil Nadu"},
        {"iata": "CJB", "city": "Coimbatore", "name": "Coimbatore International", "country": "India", "state": "Tamil Nadu"},
        {"iata": "IXE", "city": "Mangalore", "name": "Mangalore International", "country": "India", "state": "Karnataka"},
        {"iata": "UDR", "city": "Udaipur", "name": "Maharana Pratap Airport", "country": "India", "state": "Rajasthan"},
        {"iata": "JDH", "city": "Jodhpur", "name": "Jodhpur Airport", "country": "India", "state": "Rajasthan"},
        {"iata": "IXZ", "city": "Port Blair", "name": "Veer Savarkar International", "country": "India", "state": "Andaman & Nicobar"},
        {"iata": "DXB", "city": "Dubai", "name": "Dubai International", "country": "UAE", "state": "Dubai"},
        {"iata": "LHR", "city": "London", "name": "Heathrow Airport", "country": "UK", "state": "England"},
        {"iata": "CDG", "city": "Paris", "name": "Charles de Gaulle Airport", "country": "France", "state": "Île-de-France"},
        {"iata": "JFK", "city": "New York", "name": "John F. Kennedy International", "country": "USA", "state": "New York"},
        {"iata": "SIN", "city": "Singapore", "name": "Changi Airport", "country": "Singapore", "state": "Singapore"},
        {"iata": "BKK", "city": "Bangkok", "name": "Suvarnabhumi Airport", "country": "Thailand", "state": "Bangkok"},
        {"iata": "IST", "city": "Istanbul", "name": "Istanbul Airport", "country": "Turkey", "state": "Istanbul"},
        {"iata": "NRT", "city": "Tokyo", "name": "Narita International", "country": "Japan", "state": "Kanto"},
        {"iata": "DOH", "city": "Doha", "name": "Hamad International", "country": "Qatar", "state": "Qatar"},
        {"iata": "AUH", "city": "Abu Dhabi", "name": "Abu Dhabi International", "country": "UAE", "state": "Abu Dhabi"},
        {"iata": "KUL", "city": "Kuala Lumpur", "name": "KLIA", "country": "Malaysia", "state": "Selangor"},
    ]
    q_lower = q.lower().strip()
    results = [
        a for a in AIRPORTS
        if q_lower in a["city"].lower()
        or q_lower in a["iata"].lower()
        or q_lower in a["name"].lower()
        or q_lower in a.get("state", "").lower()
    ]
    # Add logo URLs
    for r in results:
        r["logo_url"] = f"https://content.airhex.com/content/logos/airlines_{r['iata']}_200_200_s.png"
    return {"airports": results[:12]}


@router.get("/inspiration")
async def flight_inspiration(
    origin: str = Query(..., min_length=1),
    currency: str = Query("INR"),
):
    """Get cheapest destinations from an origin airport."""
    origin_iata = resolve_iata(origin)
    try:
        from services.amadeus import amadeus_service
        raw = await amadeus_service.get_flight_inspiration(origin=origin_iata, currency=currency)
        return raw
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cheapest-dates")
async def cheapest_dates(
    origin: str = Query(..., min_length=1),
    destination: str = Query(..., min_length=1),
):
    """Get cheapest dates for a route."""
    origin_iata = resolve_iata(origin)
    destination_iata = resolve_iata(destination)
    try:
        from services.amadeus import amadeus_service
        raw = await amadeus_service.get_cheapest_dates(
            origin=origin_iata, destination=destination_iata
        )
        return raw
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
