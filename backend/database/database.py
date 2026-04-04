import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

from supabase import create_client
from dotenv import load_dotenv

# =========================
# 🔥 LOAD ENV
# =========================
load_dotenv()

# =========================
# 🔥 SUPABASE CLIENT
# =========================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("❌ Missing Supabase credentials")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# =========================
# 🔥 DATABASE CONNECTION
# =========================
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise Exception("❌ DATABASE_URL not set")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"sslmode": "require"}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# =========================
# 🔥 DATABASE CLASS
# =========================
class Database:
    def __init__(self):
        self.supabase = supabase

    def get_training_dataset(self):
        db_session = SessionLocal()

        try:
            print("🚀 Fetching hybrid training data (History + Live)...")

            # Systematic Query from the View we created
            query = text("""
                SELECT *
                FROM v_price_features
                WHERE price IS NOT NULL
                ORDER BY recorded_at DESC
                LIMIT 80000
            """)

            result = db_session.execute(query)
            rows = result.fetchall()

            if not rows:
                raise Exception("❌ No training data found in v_price_features")

            columns = result.keys()
            df = pd.DataFrame(rows, columns=columns)

            # ==========================================
            # 🔥 SYNC WITH ML LOGIC (is_live & is_weekend)
            # ==========================================
            # Ensure is_live exists (0 = Historical, 1 = 2026 Live)
            if "is_live" not in df.columns:
                df["is_live"] = 0
            else:
                df["is_live"] = df["is_live"].fillna(0).astype(int)

            # ==========================================
            # 🔥 ADD DAYS UNTIL DEP & WEEKEND LOGIC
            # ==========================================
            if "departure_date" in df.columns:
                df["departure_date"] = pd.to_datetime(df["departure_date"], errors="coerce")
                today = pd.Timestamp.now().normalize()
                
                # Calculate lead time (The core price driver)
                df["days_until_dep"] = (df["departure_date"] - today).dt.days
                
                # Calculate is_weekend (Sat=5, Sun=6)
                df["is_weekend"] = df["departure_date"].dt.dayofweek.apply(lambda x: 1 if x >= 5 else 0)

                # Fix negatives and nulls
                df["days_until_dep"] = df["days_until_dep"].fillna(0)
                df["days_until_dep"] = df["days_until_dep"].clip(lower=0)
            else:
                df["days_until_dep"] = 7
                df["is_weekend"] = 0

            # ==========================================
            # 🔥 FIXED: CATEGORICAL CLEANING (.str accessor)
            # ==========================================
            categorical_cols = ["origin_code", "destination_code", "airline_code"]

            for col in categorical_cols:
                if col in df.columns:
                    # Using .str ensures we apply methods to the whole series correctly
                    df[col] = df[col].astype(str).str.upper().str.strip()

            # ==========================================
            # 🔥 NUMERIC CONVERSION
            # ==========================================
            numeric_cols = [
                "price", "day_of_week", "month", "week_of_year",
                "hour_of_day", "is_peak_hour", "seats_available",
                "price_change_1d", "price_change_3d", "demand_score",
                "seasonality_factor", "days_until_dep", "is_live", "is_weekend"
            ]

            for col in numeric_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")

            # ==========================================
            # 🔥 HANDLE NULLS (PRESERVED SYSTEMATIC DEFAULTS)
            # ==========================================
            df["price_change_1d"] = df.get("price_change_1d", 0).fillna(0)
            df["price_change_3d"] = df.get("price_change_3d", 0).fillna(0)
            df["demand_score"] = df.get("demand_score", 0.5).fillna(0.5)
            df["seasonality_factor"] = df.get("seasonality_factor", 1.0).fillna(1.0)

            if "is_peak_hour" in df.columns:
                df["is_peak_hour"] = df["is_peak_hour"].fillna(0).astype(int)

            # Final safety fill for XGBoost compatibility
            df = df.fillna(0)

            # ==========================================
            # 🔥 FILTER DATA (PRESERVED LOGIC)
            # ==========================================
            df = df[(df["price"] > 800) & (df["price"] < 60000)]

            # ==========================================
            # 🔥 FINAL SCHEMA VALIDATION
            # ==========================================
            required_cols = ["price", "month", "days_until_dep"]
            for col in required_cols:
                if col in df.columns:
                    df = df[df[col].notnull()]

            print(f"✅ Dataset Synchronized: {len(df)} rows ready for ML.")
            return df

        except Exception as e:
            print("❌ DB ERROR:", e)
            raise e

        finally:
            db_session.close()

# =========================
# 🔥 INSTANCE
# =========================
database = Database()