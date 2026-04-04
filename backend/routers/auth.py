"""
Authentication router — signup, login, OTP, phone verify.
Uses Supabase Auth + custom OTP via SMS/Email.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timedelta, timezone

from database import database as db
from services.notifications import dispatcher, generate_otp, hash_otp, verify_otp

router = APIRouter()

# =========================================================
# MODELS
# =========================================================
class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str
    phone: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class OTPRequest(BaseModel):
    user_id: str
    phone: Optional[str] = None
    email: Optional[str] = None
    purpose: str = "PHONE_VERIFY"

class VerifyOTPRequest(BaseModel):
    user_id: str
    otp: str
    purpose: str = "PHONE_VERIFY"

class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    preferred_cabin: Optional[str] = None
    notify_email: Optional[bool] = None
    notify_sms: Optional[bool] = None
    notify_whatsapp: Optional[bool] = None
    meal_preference: Optional[str] = None
    preferred_seats: Optional[str] = None

# =========================================================
# OTP STORE (In-Memory Dictionary)
# =========================================================
_otp_store: dict[str, dict] = {}

# =========================================================
# SIGNUP
# =========================================================
@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(req: SignUpRequest):
    try:
        # 1. Supabase Auth Signup
        response = db.supabase.auth.sign_up({
            "email": req.email,
            "password": req.password
        })

        if not response.user:
            raise HTTPException(400, "Signup failed: No user returned")

        user_id = response.user.id

        # 2. Insert Profile Data
        db.supabase.table("profiles").insert({
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "phone": req.phone,
            "phone_verified": False,
            "notify_email": True,
            "notify_sms": False,
            "notify_whatsapp": False
        }).execute()

        # 3. Async Welcome Email (Non-blocking)
        try:
            dispatcher.send_welcome(req.email, req.full_name)
        except Exception:
            pass # Don't crash signup if email service flickers

        return {
            "success": True,
            "message": "Account created successfully!",
            "user_id": user_id,
        }

    except Exception as e:
        raise HTTPException(500, f"Signup error: {str(e)}")

# =========================================================
# SEND OTP (Multi-Channel Fallback)
# =========================================================
@router.post("/send-otp")
async def send_otp(req: OTPRequest):
    if not req.email and not req.phone:
        raise HTTPException(400, "Must provide email or phone for OTP delivery")

    otp = generate_otp(6)
    otp_hash = hash_otp(otp)
    # Use timezone-aware datetime for 2026 consistency
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    key = f"{req.user_id}:{req.purpose}"
    _otp_store[key] = {
        "hash": otp_hash,
        "expires_at": expires_at,
        "attempts": 0,
    }

    sent = False

    # 1. Try Email
    if req.email:
        try:
            sent = dispatcher.email.send_otp(req.email, otp, req.purpose)
        except Exception:
            sent = False

    # 2. SMS Fallback
    if not sent and req.phone:
        try:
            sent = dispatcher.sms.send_otp(req.phone, otp)
        except Exception:
            sent = False

    # 3. WhatsApp Fallback
    if not sent and req.phone and hasattr(dispatcher, "whatsapp"):
        try:
            sent = dispatcher.whatsapp.send_otp(req.phone, otp)
        except Exception:
            sent = False

    if not sent:
        _otp_store.pop(key, None)
        raise HTTPException(500, "Failed to deliver OTP via any channel")

    return {
        "success": True,
        "message": f"OTP sent to {'email' if req.email else 'phone'}",
        "expires_in": 600,
    }

# =========================================================
# VERIFY OTP
# =========================================================
@router.post("/verify-otp")
async def verify_otp_endpoint(req: VerifyOTPRequest):
    key = f"{req.user_id}:{req.purpose}"
    stored = _otp_store.get(key)

    if not stored:
        raise HTTPException(404, "No active OTP found. Please request a new one.")

    # Expiry Check
    if datetime.now(timezone.utc) > stored["expires_at"]:
        _otp_store.pop(key, None)
        raise HTTPException(400, "OTP has expired")

    # Brute Force Protection
    stored["attempts"] += 1
    if stored["attempts"] > 5:
        _otp_store.pop(key, None)
        raise HTTPException(429, "Too many failed attempts. OTP invalidated.")

    # Validation
    if not verify_otp(req.otp, stored["hash"]):
        raise HTTPException(401, "Invalid OTP")

    # Success Logic
    _otp_store.pop(key, None)

    try:
        db.supabase.table("profiles").update({
            "phone_verified": True
        }).eq("id", req.user_id).execute()
    except Exception as e:
        raise HTTPException(500, f"Verified, but failed to update profile: {e}")

    return {"success": True, "message": "Verification successful"}

# =========================================================
# PROFILE MANAGEMENT
# =========================================================
@router.get("/profile/{user_id}")
async def get_profile(user_id: str):
    try:
        res = db.supabase.table("profiles").select("*").eq("id", user_id).execute()
        if not res.data:
            raise HTTPException(404, "Profile not found")
        return res.data[0]
    except Exception as e:
        raise HTTPException(500, f"Database fetch error: {e}")

@router.put("/profile/{user_id}")
async def update_profile(user_id: str, req: UpdateProfileRequest):
    # Filter out None values to avoid overwriting existing data with nulls
    updates = req.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(400, "No valid update fields provided")

    try:
        res = db.supabase.table("profiles").update(updates).eq("id", user_id).execute()
        return {"success": True, "updated_fields": list(updates.keys())}
    except Exception as e:
        raise HTTPException(500, f"Update failed: {e}")