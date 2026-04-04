"""
Razorpay payment integration endpoints for SkyMind 2026.
"""

from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
import hmac
import hashlib
from typing import Dict, Any

from config import settings
from database import database as db
from services.notifications import dispatcher

router = APIRouter()

# =========================================================
# RAZORPAY CLIENT
# =========================================================
def get_razorpay_client():
    import razorpay
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))

# =========================================================
# MODELS
# =========================================================
class CreateOrderRequest(BaseModel):
    amount: float
    currency: str = "INR"
    booking_id: str
    booking_reference: str

class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    booking_id: str

# =========================================================
# CREATE ORDER
# =========================================================
@router.post("/create-order")
async def create_razorpay_order(req: CreateOrderRequest):
    try:
        # 1. Verify Booking Exists and is PENDING
        booking_res = db.supabase.table("bookings").select("*").eq("id", req.booking_id).execute()

        if not booking_res.data:
            raise HTTPException(404, "Booking not found")

        booking = booking_res.data[0]
        
        if booking.get("payment_status") == "PAID":
            return {"message": "Booking already paid", "order_id": None}

        # 2. Validate Amount (Crucial to prevent price tampering)
        # Using round to avoid floating point precision issues
        if round(float(booking.get("total_price", 0)), 2) != round(float(req.amount), 2):
            raise HTTPException(400, "Price mismatch: Amount does not match the booking total.")

        client = get_razorpay_client()

        # Razorpay expects amount in PAISE (e.g., ₹100.00 = 10000 paise)
        amount_paise = int(round(req.amount * 100))

        order_data = {
            "amount": amount_paise,
            "currency": req.currency,
            "receipt": req.booking_reference,
            "notes": {
                "booking_id": req.booking_id,
                "market_era": "2026_PROD"
            }
        }

        order = client.order.create(order_data)

        return {
            "order_id": order["id"],
            "amount": req.amount,
            "currency": req.currency,
            "key": settings.razorpay_key_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Order creation error: {str(e)}")

# =========================================================
# VERIFY PAYMENT
# =========================================================
@router.post("/verify")
async def verify_payment(req: VerifyPaymentRequest, background_tasks: BackgroundTasks):
    try:
        # 1. Signature Verification (HMAC-SHA256)
        message = f"{req.razorpay_order_id}|{req.razorpay_payment_id}"
        
        generated_signature = hmac.new(
            settings.razorpay_key_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()

        if generated_signature != req.razorpay_signature:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Security alert: Invalid payment signature.")

        # 2. Fetch Booking and Check Status (Idempotency check)
        booking_res = db.supabase.table("bookings").select("*").eq("id", req.booking_id).execute()
        if not booking_res.data:
            raise HTTPException(404, "Booking context lost.")

        booking = booking_res.data[0]
        if booking.get("payment_status") == "PAID":
            return {"success": True, "message": "Already processed."}

        # 3. Finalize Status in DB
        db.supabase.table("bookings").update({
            "payment_status": "PAID",
            "status": "CONFIRMED",
            "razorpay_payment_id": req.razorpay_payment_id,
            "razorpay_order_id": req.razorpay_order_id,
            "paid_at": "now()"
        }).eq("id", req.booking_id).execute()

        # 4. Background Notification (Email/SMS)
        # We use background_tasks to return a response to the UI instantly
        background_tasks.add_task(
            send_post_payment_comms, 
            booking, 
            req.razorpay_payment_id
        )

        return {
            "success": True,
            "payment_id": req.razorpay_payment_id,
            "message": "Payment successful. Tickets are being issued.",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Verification failed: {str(e)}")

# =========================================================
# UTILITY: POST-PAYMENT COMMS
# =========================================================
def send_post_payment_comms(booking: Dict[str, Any], payment_id: str):
    """Helper to dispatch all notifications after successful payment."""
    try:
        # Safely extract flight info
        itinerary = booking.get("flight_data", {}).get("itineraries", [{}])[0]
        first_seg = itinerary.get("segments", [{}])[0]

        comms_data = {
            "name": booking.get("passengers", [{}])[0].get("first_name", "Valued Traveller"),
            "booking_ref": booking.get("booking_reference"),
            "origin": first_seg.get("departure", {}).get("iataCode"),
            "destination": itinerary.get("segments", [{}])[-1].get("arrival", {}).get("iataCode"),
            "departure_date": first_seg.get("departure", {}).get("at"),
            "amount": f"{booking.get('currency')} {booking.get('total_price')}",
            "payment_id": payment_id
        }

        # Email
        dispatcher.email.send_booking_confirmation(booking.get("contact_email"), comms_data)
        
        # SMS (If phone exists)
        if booking.get("contact_phone"):
            dispatcher.sms.send_booking_confirmation(booking.get("contact_phone"), comms_data)

    except Exception as e:
        print(f"Post-payment notification error: {e}")

# =========================================================
# FETCH PAYMENT DETAILS
# =========================================================
@router.get("/status/{payment_id}")
async def get_payment_status(payment_id: str):
    try:
        client = get_razorpay_client()
        payment = client.payment.fetch(payment_id)
        return {
            "payment_id": payment_id,
            "status": payment.get("status"),
            "method": payment.get("method"),
            "amount": payment.get("amount", 0) / 100,
            "email": payment.get("email")
        }
    except Exception as e:
        raise HTTPException(500, f"Razorpay Fetch Error: {str(e)}")