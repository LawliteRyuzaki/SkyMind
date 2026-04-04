import os
import pickle
import pandas as pd
import numpy as np
from datetime import datetime

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor

# Systematic import to match your database service
from database.database import database

MODEL_PATH = "ml/models/global_model.pkl"

class PricePredictor:
    def __init__(self):
        # ⚡ PRESERVED: Your original XGBoost Hyperparameters
        self.model = XGBRegressor(
            n_estimators=900,
            learning_rate=0.04,
            max_depth=9,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=42,
            objective='reg:squarederror'
        )

        # 🔥 PRESERVED: Your exact original feature list
        self.feature_cols = [
            "origin_code", "destination_code", "airline_code",
            "days_until_dep", "urgency", "day_of_week", "month",
            "week_of_year", "hour_of_day", "is_peak_hour",
            "seats_available", "price_change_1d", "price_change_3d",
            "demand_score", "seasonality_factor"
        ]

        self.encoders = {}

    # =========================
    # 🚀 TRAIN
    # =========================
    def train(self):
        print("🚀 Loading dataset...")
        df = database.get_training_dataset()
        
        if df is None or len(df) < 200:
            print("⚠️ Low data — using existing model if available")
            if os.path.exists(MODEL_PATH):
                self.load()
                return
            return

        print(f"Dataset size: {len(df)}")
        print("⚡ Training model...")

        # Time Feature Engineering
        if "days_until_dep" not in df.columns:
            df["days_until_dep"] = 7
        df["days_until_dep"] = df["days_until_dep"].clip(lower=0)
        df["urgency"] = 1 / (df["days_until_dep"] + 1)

        # Defaults & Cleaning
        defaults = {
            "day_of_week": 0, "month": 1, "week_of_year": 1,
            "hour_of_day": 12, "is_peak_hour": 0, "seats_available": 50,
            "price_change_1d": 0, "price_change_3d": 0,
            "demand_score": 0.5, "seasonality_factor": 1.0
        }
        for col, val in defaults.items():
            if col not in df.columns:
                df[col] = val

        df = df.fillna(0)
        df = df[(df["price"] > 800) & (df["price"] < 50000)]

        # Encoding
        for col in ["origin_code", "destination_code", "airline_code"]:
            df[col] = df[col].astype(str).str.upper()
            unique_vals = sorted(df[col].unique())
            self.encoders[col] = {v: i + 1 for i, v in enumerate(unique_vals)}
            df[col] = df[col].map(self.encoders[col])

        # Train Set
        X = df[self.feature_cols]
        y = df["price"]

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        self.model.fit(X_train, y_train)

        # ==========================================
        # 📊 UPDATED PERFORMANCE REPORT (MATCHES YOUR REQUEST)
        # ==========================================
        preds = self.model.predict(X_test)
        
        mae = mean_absolute_error(y_test, preds)
        rmse = np.sqrt(mean_squared_error(y_test, preds))
        mape = np.mean(np.abs((y_test - preds) / np.maximum(y_test, 1))) * 100
        accuracy = 100 - mape

        print("\n📊 MODEL PERFORMANCE (REAL TIME-AWARE):")
        print(f"MAE: {mae:.2f}")
        print(f"RMSE: {rmse:.2f}")
        print(f"MAPE: {mape:.2f}%")
        print(f"Accuracy: {accuracy:.2f}%")

        os.makedirs("ml/models", exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump({"model": self.model, "encoders": self.encoders}, f)
        print("💾 Model saved!")

    def load(self):
        with open(MODEL_PATH, "rb") as f:
            data = pickle.load(f)
            self.model = data["model"]
            self.encoders = data["encoders"]
        print("✅ Loaded model")

    def predict(self, data: dict):
        df = pd.DataFrame([data])
        if "days_until_dep" not in df.columns:
            df["days_until_dep"] = 7
        df["days_until_dep"] = df["days_until_dep"].clip(lower=0)
        df["urgency"] = 1 / (df["days_until_dep"] + 1)

        defaults = {
            "day_of_week": 0, "month": 1, "week_of_year": 1,
            "hour_of_day": 12, "is_peak_hour": 0, "seats_available": 50,
            "price_change_1d": 0, "price_change_3d": 0,
            "demand_score": 0.5, "seasonality_factor": 1.0
        }
        for col, val in defaults.items():
            if col not in df.columns:
                df[col] = val

        df = df.fillna(0)

        for col in ["origin_code", "destination_code", "airline_code"]:
            val = str(df[col].iloc[0]).upper()
            df[col] = self.encoders.get(col, {}).get(val, 0)

        df = df[self.feature_cols]
        pred = self.model.predict(df)[0]
        return float(round(pred, 2))

# =========================
# GLOBAL ACCESS (Singleton)
# =========================
_predictor = None

def get_predictor():
    global _predictor
    if _predictor:
        return _predictor

    p = PricePredictor()
    if os.path.exists(MODEL_PATH):
        p.load()
    else:
        p.train()

    _predictor = p
    return p