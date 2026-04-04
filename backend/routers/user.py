"""
User profile and trips endpoints for SkyMind 2026.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone

from database import database as db

router = APIRouter()

# =========================================================
# GET USER TRIPS
# =========================================================
@router.get("/trips")
async def get_user_trips(user_id: str = Query(...)):
    """
    Fetches and categorizes trips into 'Upcoming' and 'Past' for better UX.
    """
    try:
        res = (
            db.supabase
            .table("bookings")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )

        raw_trips = res.data or []
        now = datetime.now(timezone.utc)

        upcoming = []
        past = []

        for t in raw_trips:
            try:
                # Extract core flight details safely
                flight = t.get("flight_data") or t.get("flight_offer") or {}
                itinerary = flight.get("itineraries", [{}])[0]
                segments = itinerary.get("segments", [{}])
                first_seg = segments[0]
                last_seg = segments[-1]

                dep_time_str = first_seg.get("departure", {}).get("at")
                dep_time_dt = datetime.fromisoformat(dep_time_str.replace('Z', '+00:00'))

                trip_card = {
                    "id": t["id"],
                    "booking_reference": t.get("booking_reference"),
                    "status": t.get("status"),
                    "payment_status": t.get("payment_status"),
                    "origin": first_seg.get("departure", {}).get("iataCode"),
                    "destination": last_seg.get("arrival", {}).get("iataCode"),
                    "departure_time": dep_time_str,
                    "arrival_time": last_seg.get("arrival", {}).get("at"),
                    "airline": first_seg.get("carrierCode"),
                    "price": t.get("total_price"),
                    "currency": t.get("currency"),
                }

                if dep_time_dt > now:
                    upcoming.append(trip_card)
                else:
                    past.append(trip_card)

            except Exception:
                # Fallback for inconsistent data
                past.append(t)

        return {
            "success": True,
            "upcoming": upcoming,
            "past": past,
            "total_count": len(raw_trips)
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to sync trips: {str(e)}")


# =========================================================
# GET PROFILE
# =========================================================
@router.get("/profile/{user_id}")
async def get_profile(user_id: str):
    """
    Fetches the full SkyMind profile including loyalty tier and points.
    """
    try:
        res = (
            db.supabase
            .table("profiles")
            .select("*")
            .eq("id", user_id)
            .execute()
        )

        if not res.data:
            raise HTTPException(404, "Profile not found in SkyMind database.")

        p = res.data[0]

        return {
            "id": p.get("id"),
            "full_name": p.get("full_name"),
            "email": p.get("email"),
            "phone": p.get("phone"),
            "phone_verified": p.get("phone_verified", False),
            "preferences": {
                "notify_email": p.get("notify_email", True),
                "notify_sms": p.get("notify_sms", False),
                "notify_whatsapp": p.get("notify_whatsapp", False),
                "meal": p.get("meal_preference"),
                "seat": p.get("preferred_seats")
            },
            "loyalty": {
                "points": p.get("skymind_points", 0),
                "tier": p.get("tier", "BLUE"),
                "member_since": p.get("created_at")
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Profile fetch error: {str(e)}")