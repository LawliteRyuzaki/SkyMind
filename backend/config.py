"""
Application configuration loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "SkyMind"
    debug: bool = False
    secret_key: str = "your-random-super-secret-key-here"

    # Database
    database_url: str = "postgresql://postgres:@Vanshu1169@db.lplknxuzgopzgwctssuo.supabase.co:5432/postgres"
    supabase_url: str = "https://lplknxuzgopzgwctssuo.supabase.co"
    supabase_service_key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwbGtueHV6Z29wemd3Y3Rzc3VvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE1ODkyMSwiZXhwIjoyMDg4NzM0OTIxfQ.TA0CZT517jFRi9Iqu-XjMlHqM0Wvd3xor6-tUzHMMd0"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Flight APIs
    amadeus_client_id: str = "FJRvkl6b8GqxSSZl6Pp1CmdJcfQPTRbC"
    amadeus_client_secret: str = "0wc0ZXQUmd75t1yW"
    amadeus_base_url: str = "https://test.api.amadeus.com"
    aviationstack_api_key: str = ""

    # Payment
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""

    # ML
    model_path: str = "./ml/models"

    # Email — Gmail SMTP
    gmail_user: str = "dikshachaudhry1@gmail.com"
    gmail_app_password: str = "mmjt uvyl nmpd vxfj"
    email_from_name: str = "SkyMind Flights"
    email_reply_to: str = "support@skymind.app"

    # SMS — Fast2SMS
    fast2sms_api_key: str = ""
    sms_sender_id: str = "SKYMND"

    # WhatsApp + Intl SMS — Twilio
    twilio_account_sid: str = "ACdbdc1e3adf89bd6f77918fec269cc77d"
    twilio_auth_token: str = "bc1670efe73fce89cc0bf023636f2e73"
    twilio_phone_number: str = "+18148843659"
    twilio_whatsapp_number: str = "whatsapp:+14155238886"

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()