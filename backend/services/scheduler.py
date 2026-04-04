import logging
import os
import time
import asyncio
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from database.database import database as db
from ml.price_model import get_predictor

logger = logging.getLogger(__name__)

# Global Scheduler Instance
_scheduler = BackgroundScheduler(timezone="Asia/Kolkata")

# 📅 Systematic Date Buckets for 2026 Market Coverage
DATE_BUCKETS = [1, 2, 3, 5, 7, 10, 14, 21, 28, 30]

# ✈️ Tier-1 Indian Route Batches
ROUTE_BATCHES = [
    [("DEL", "BOM"), ("BOM", "DEL"), ("DEL", "BLR")],
    [("BLR", "DEL"), ("DEL", "CCU"), ("CCU", "DEL")],
    [("BBI", "DEL"), ("DEL", "BBI"), ("BBI", "BLR")],
    [("BLR", "BBI"), ("BOM", "BLR"), ("BLR", "BOM")],
    [("COK", "DEL"), ("DEL", "COK"), ("HYD", "DEL")],
]

_price_cache = {}

def get_cached_price(key):
    if key in _price_cache:
        price, ts = _price_cache[key]
        if time.time() - ts < 3600:
            return price
    return None

def set_cached_price(key, value):
    _price_cache[key] = (value, time.time())

# ==========================================
# 🚀 FETCH + STORE (SYNC-TO-ASYNC BRIDGE)
# ==========================================
def fetch_and_store_flights(origin, destination, date_str):
    from services.amadeus import amadeus_service

    try:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        res = loop.run_until_complete(amadeus_service.search_flights(
            origin=origin, 
            destination=destination, 
            departure_date=date_str,
            max_results=5
        ))

        data = res.get("data", []) if isinstance(res, dict) else []
        if not data:
            return None

        prices = []
        now = datetime.now(timezone.utc)
        dep_dt = datetime.strptime(date_str, "%Y-%m-%d")

        for f in data:
            try:
                price_info = f.get("price", {})
                price = float(price_info.get("total", 0))
                
                if price < 1500: continue 
                prices.append(price)

                db.supabase.table("price_history").insert({
                    "origin_code": origin,
                    "destination_code": destination,
                    "airline_code": f.get("validatingAirlineCodes", ["AI"])[0],
                    "price": price,
                    "currency": "INR",
                    "departure_date": date_str,
                    "days_until_dep": max((dep_dt.date() - now.date()).days, 0),
                    "is_live": True,
                    "recorded_at": now.isoformat(),
                    "market_era": "2026_PROD"
                }).execute()

            except Exception as e:
                logger.warning(f"Row skip during scrape: {e}")

        return min(prices) if prices else None

    except Exception as e:
        logger.error(f"Scraper failed for {origin}->{destination}: {e}")
        return None

# ==========================================
# 🧠 HYBRID FETCH (Cache -> Live -> ML)
# ==========================================
def get_price(origin, destination, date_str):
    key = f"{origin}-{destination}-{date_str}"
    
    cached = get_cached_price(key)
    if cached: return cached

    price = fetch_and_store_flights(origin, destination, date_str)
    if price:
        set_cached_price(key, price)
        return price

    try:
        predictor = get_predictor()
        now = datetime.now(timezone.utc)
        dep_dt = datetime.strptime(date_str, "%Y-%m-%d")
        
        input_data = {
            "origin_code": origin,
            "destination_code": destination,
            "airline_code": "AI",
            "days_until_dep": max((dep_dt.date() - now.date()).days, 0),
            "day_of_week": dep_dt.weekday(),
            "month": dep_dt.month,
            "week_of_year": dep_dt.isocalendar()[1],
            "is_live": True
        }
        pred = float(predictor.predict(input_data))
        set_cached_price(key, pred)
        return pred
    except Exception as e:
        logger.error(f"ML Fallback failed: {e}")
        return None

# ==========================================
# 📅 SCHEDULED TASKS
# ==========================================
def collect_batch(batch_index):
    logger.info(f"📋 Running Scraping Batch {batch_index}...")
    try:
        routes = ROUTE_BATCHES[batch_index]
        today = datetime.now().date()
        for origin, destination in routes:
            for d in DATE_BUCKETS:
                target_date = (today + timedelta(days=d)).strftime("%Y-%m-%d")
                get_price(origin, destination, target_date)
                time.sleep(2) # Protect API Rate Limits
    except Exception as e:
        logger.error(f"Batch {batch_index} failed: {e}")

def check_price_alerts():
    from services.notifications import dispatcher
    logger.info("⏰ Scanning active Price Alerts...")
    try:
        alerts = db.get_active_alerts()
        for alert in alerts:
            current_price = get_price(
                alert["origin_code"], 
                alert["destination_code"], 
                alert["departure_date"]
            )
            if current_price and current_price <= alert["target_price"]:
                dispatcher.send_price_alert(alert, current_price)
    except Exception as e:
        logger.error(f"Alert check failed: {e}")

def retrain_models():
    logger.info("🤖 Maintenance: Retraining XGBoost Predictor...")
    try:
        predictor = get_predictor()
        predictor.train() 
        predictor.load()  
        logger.info("✅ Retraining complete. New 2026 patterns active.")
    except Exception as e:
        logger.error(f"Maintenance retraining failed: {e}")

# ==========================================
# 🚦 STARTUP LOGIC (FIXED)
# ==========================================
def start_scheduler():
    if _scheduler.running:
        return

    # Staggered Batch Collection (Calculates rollover minutes safely)
    base_hour = 1
    for i in range(len(ROUTE_BATCHES)):
        total_minutes = i * 20
        run_hour = base_hour + (total_minutes // 60)
        run_minute = total_minutes % 60

        _scheduler.add_job(
            collect_batch, 
            CronTrigger(hour=run_hour, minute=run_minute),
            args=[i]
        )

    # 30-minute Alert Pulse
    _scheduler.add_job(check_price_alerts, IntervalTrigger(minutes=30))

    # Daily 5 AM model refresh
    _scheduler.add_job(retrain_models, CronTrigger(hour=5, minute=0))

    _scheduler.start()
    logger.info("🚀 SkyMind Background Scheduler Active.")