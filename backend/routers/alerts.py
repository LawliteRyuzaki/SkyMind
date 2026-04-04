"""
Price alert subscription endpoints.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date

from database import database as db

router = APIRouter()


# =========================================================
# MODEL
# =========================================================
class AlertRequest(BaseModel):
    user_id: str
    origin_code: str = Field(..., min_length=3, max_length=3, description="IATA Airport Code")
    destination_code: str = Field(..., min_length=3, max_length=3, description="IATA Airport Code")
    departure_date: date  # Pydantic auto-validates YYYY-MM-DD
    target_price: float
    currency: str = "INR"
    cabin_class: str = "ECONOMY"

    # 🔥 Notifications
    email: Optional[str] = None
    phone: Optional[str] = None
    notify_email: bool = True
    notify_sms: bool = False
    notify_whatsapp: bool = False


# =========================================================
# CREATE ALERT
# =========================================================
@router.post("/subscribe")
async def subscribe_alert(req: AlertRequest):
    """Subscribe to a price alert with duplicate prevention."""

    try:
        # 1. 🛡️ Duplicate Check: Prevents double-subscribing to the same route/date
        existing = (
            db.supabase.table("price_alerts")
            .select("id")
            .eq("user_id", req.user_id)
            .eq("origin_code", req.origin_code.upper())
            .eq("destination_code", req.destination_code.upper())
            .eq("departure_date", str(req.departure_date))
            .eq("status", "ACTIVE")
            .execute()
        )

        if existing.data:
            return {
                "success": False, 
                "message": f"You already have an active alert for {req.origin_code}→{req.destination_code} on {req.departure_date}."
            }

        # 2. 📝 Prepare Data
        data = {
            "user_id": req.user_id,
            "origin_code": req.origin_code.upper(),
            "destination_code": req.destination_code.upper(),
            "departure_date": str(req.departure_date),
            "target_price": req.target_price,
            "currency": req.currency,
            "cabin_class": req.cabin_class,

            "email": req.email,
            "phone": req.phone,
            "notify_email": req.notify_email,
            "notify_sms": req.notify_sms,
            "notify_whatsapp": req.notify_whatsapp,

            "status": "ACTIVE",
            "created_at": "now()" # Let Supabase handle timestamp
        }

        # 3. 🚀 Insert into Supabase
        res = db.supabase.table("price_alerts").insert(data).execute()

        if not res.data:
            raise HTTPException(500, "Failed to create alert entry in database")

        alert_id = res.data[0]["id"]

        return {
            "success": True,
            "alert_id": alert_id,
            "message": f"Alert set! We'll notify you when {req.origin_code}→{req.destination_code} drops below ₹{req.target_price:,.0f}",
        }

    except Exception as e:
        logger_err = str(e) # Assuming logger is imported elsewhere, otherwise use print
        raise HTTPException(500, f"Error creating alert: {logger_err}")


# =========================================================
# GET USER ALERTS
# =========================================================
@router.get("/user/{user_id}")
async def get_user_alerts(user_id: str):
    """Get all active alerts for a user."""

    try:
        res = (
            db.supabase
            .table("price_alerts")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "ACTIVE")
            .order("departure_date", desc=False)
            .execute()
        )

        alerts = res.data or []

        return {
            "alerts": alerts,
            "count": len(alerts)
        }

    except Exception as e:
        raise HTTPException(500, f"Error fetching alerts: {e}")


# =========================================================
# DELETE ALERT
# =========================================================
@router.delete("/{alert_id}")
async def delete_alert(alert_id: str):
    """Soft delete a price alert by updating status."""

    try:
        # Check if alert exists first
        check = db.supabase.table("price_alerts").select("id").eq("id", alert_id).execute()
        if not check.data:
            raise HTTPException(404, "Alert not found")

        res = (
            db.supabase
            .table("price_alerts")
            .update({"status": "DELETED"})
            .eq("id", alert_id)
            .execute()
        )

        return {
            "success": True,
            "message": "Alert successfully deactivated"
        }

    except Exception as e:
        raise HTTPException(500, f"Error deleting alert: {e}")