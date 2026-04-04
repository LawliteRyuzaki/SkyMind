"""
Booking creation and management endpoints.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import uuid
import string
import random
from datetime import datetime, timezone

from database import database as db
from services.notifications import dispatcher

router = APIRouter()

# =========================================================
# MODELS
# =========================================================
class PassengerData(BaseModel):
    type: str = "ADULT"
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    nationality: Optional[str] = None
    meal_preference: Optional[str] = None
    baggage_allowance: int = 15

class CreateBookingRequest(BaseModel):
    flight_offer_id: str
    flight_data: dict
    passengers: List[PassengerData]
    contact_email: EmailStr
    contact_phone: str
    cabin_class: str = "ECONOMY"
    currency: str = "INR"
    user_id: Optional[str] = None

# =========================================================
# HELPERS
# =========================================================
def generate_booking_ref() -> str:
    """Generates a 6-character alphanumeric PNR."""
    chars = string.ascii_uppercase + string.digits
    return "SM" + "".join(random.choices(chars, k=6))

def extract_price(flight_data: dict) -> float:
    """Safely extracts the total price from complex flight JSON."""
    try:
        price_info = flight_data.get("price", {})
        # Check grandTotal first, then total
        val = price_info.get("grandTotal") or price_info.get("total") or 0
        return float(val)
    except (ValueError, TypeError):
        return 0.0

# =========================================================
# CREATE BOOKING
# =========================================================
@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_booking(req: CreateBookingRequest):
    try:
        booking_ref = generate_booking_ref()
        total_price = extract_price(req.flight_data)

        if total_price <= 0:
            raise HTTPException(400, "Could not determine flight price. Please refresh the offer.")

        booking_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Prepare for Supabase (ensure passengers is a list of dicts)
        passenger_list = [p.model_dump() for p in req.passengers]

        booking_payload = {
            "id": booking_id,
            "booking_reference": booking_ref,
            "status": "PENDING",
            "payment_status": "UNPAID",
            "flight_offer_id": req.flight_offer_id,
            "flight_data": req.flight_data,
            "passengers": passenger_list,
            "contact_email": req.contact_email,
            "contact_phone": req.contact_phone,
            "cabin_class": req.cabin_class,
            "total_price": total_price,
            "currency": req.currency,
            "user_id": req.user_id,
            "created_at": now
        }

        # 🚀 SAVE TO SUPABASE
        res = db.supabase.table("bookings").insert(booking_payload).execute()
        
        if not res.data:
            raise HTTPException(500, "Database insert failed")

        # 📧 SEND ASYNC CONFIRMATION
        try:
            # Safely extract route info for the email
            itinerary = req.flight_data.get("itineraries", [{}])[0]
            first_segment = itinerary.get("segments", [{}])[0]
            last_segment = itinerary.get("segments", [{}])[-1]

            dispatcher.email.send_booking_confirmation(
                req.contact_email,
                {
                    "name": req.passengers[0].first_name,
                    "booking_ref": booking_ref,
                    "origin": first_segment.get("departure", {}).get("iataCode", ""),
                    "destination": last_segment.get("arrival", {}).get("iataCode", ""),
                    "departure_date": first_segment.get("departure", {}).get("at", ""),
                    "amount": f"{req.currency} {total_price:,.2f}",
                }
            )
        except Exception as email_err:
            print(f"Non-critical Error: Confirmation email failed: {email_err}")

        return {
            "success": True,
            "booking_id": booking_id,
            "booking_reference": booking_ref,
            "message": "Booking initiated. Please complete payment within 15 minutes to secure this fare.",
        }

    except Exception as e:
        raise HTTPException(500, f"Booking creation failed: {str(e)}")

# =========================================================
# GET BOOKING
# =========================================================
@router.get("/{booking_id}")
async def get_booking(booking_id: str):
    try:
        res = db.supabase.table("bookings").select("*").eq("id", booking_id).execute()

        if not res.data:
            raise HTTPException(404, "Booking not found")

        return res.data[0]
    except Exception as e:
        raise HTTPException(500, f"Fetch error: {e}")

# =========================================================
# CANCEL BOOKING
# =========================================================
@router.post("/{booking_id}/cancel")
async def cancel_booking(booking_id: str):
    try:
        # Check current status before cancelling
        check = db.supabase.table("bookings").select("status").eq("id", booking_id).execute()
        
        if not check.data:
            raise HTTPException(404, "Booking not found")
        
        if check.data[0]["status"] == "CANCELLED":
            return {"success": True, "message": "Booking is already cancelled"}

        # 🔄 UPDATE STATUS
        db.supabase.table("bookings").update({
            "status": "CANCELLED",
            "payment_status": "REFUND_PENDING" if check.data[0].get("payment_status") == "PAID" else "VOID"
        }).eq("id", booking_id).execute()

        return {
            "success": True,
            "message": "Booking cancelled successfully",
            "refund_status": "PROCESSING" if check.data[0].get("payment_status") == "PAID" else "NONE"
        }

    except Exception as e:
        raise HTTPException(500, f"Cancellation failed: {e}")