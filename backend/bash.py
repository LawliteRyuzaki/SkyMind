import asyncio
import time
from datetime import datetime, timedelta
from services.amadeus import search_flights

# ==========================================
# 📋 STRATEGIC CONFIGURATION
# ==========================================

# 1. Important Indian Corridors (Hubs + Your Core BBI Routes)
STRATEGIC_ROUTES = [
    ("BBI", "DEL"), ("DEL", "BBI"),  # Your core project route
    ("BBI", "BOM"), ("BOM", "BBI"),  # Regional to Metro
    ("DEL", "BOM"), ("BOM", "DEL"),  # High-volume Business (Pattern Leader)
    ("DEL", "BLR"), ("BLR", "DEL"),  # Tech Corridor
    ("CCU", "DEL"), ("DEL", "CCU"),  # East-North Connection
    ("MAA", "DEL"), ("DEL", "MAA"),  # South-North Connection
    ("COK", "DEL"), ("DEL", "COK")   # Tourist/VFR Hub (Cochin)
]

# 2. Date Buckets to teach the model "Urgency"
# We check: 2 days, 7 days, 14 days, 21 days, and 45 days from today.
# This builds the 'Lead-Time' curve the model needs to predict accurately.
DATE_INTERVALS = [2, 7, 14, 21, 45]

# ==========================================
# 🚀 THE SCRAPER ENGINE
# ==========================================

async def run_meaningful_fetch():
    today = datetime.now()
    total_segments = len(STRATEGIC_ROUTES) * len(DATE_INTERVALS)
    
    print(f"🚀 [ECO-SCAN AI] Starting Strategic Fetch...")
    print(f"📊 Planning to scrape {total_segments} flight segments.")
    print("-" * 50)

    count = 0
    for origin, destination in STRATEGIC_ROUTES:
        for days_out in DATE_INTERVALS:
            target_date = (today + timedelta(days=days_out)).strftime("%Y-%m-%d")
            
            try:
                print(f"🔍 [{count+1}/{total_segments}] Fetching: {origin} -> {destination} | Date: {target_date}")
                
                # This calls your amadeus service which saves to Supabase automatically
                # with is_live=True and all 17 feature columns.
                flights = await search_flights(origin, destination, target_date)
                
                if flights:
                    print(f"   ✅ Success: Captured {len(flights)} flight options.")
                else:
                    print(f"   ⚠️ Warning: No flights found for this segment.")

                # 🕰️ SYSTEMATIC DELAY: Prevents Amadeus 429 (Too Many Requests) 
                # especially important for the 'Test' environment.
                await asyncio.sleep(2.5) 
                
            except Exception as e:
                print(f"   ❌ Error fetching {origin}-{destination}: {e}")
                # If we hit a serious API block, wait longer
                await asyncio.sleep(10)
            
            count += 1

    print("-" * 50)
    print(f"✨ BATCH COMPLETE: 2026 'is_live' baseline is now established.")
    print(f"🤖 You can now run 'model.train()' to update the Trends.")

if __name__ == "__main__":
    asyncio.run(run_meaningful_fetch())