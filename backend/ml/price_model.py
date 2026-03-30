"""
SkyMind AI Price Prediction Engine
- Gradient Boosting (scikit-learn) for price prediction
- Deterministic 30-day forecast (no random noise)
- Data-driven recommendation logic using forecast trend
- Real probability based on forecast slope
- Real confidence from standard deviation
"""

import os
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import joblib
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import heapq

logger = logging.getLogger(__name__)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)


class FlightPricePredictor:
    """
    Gradient Boosting model for flight price prediction.
    Features: days_until_departure, day_of_week, month, is_weekend,
              is_near_departure, is_advance_booking, log_days,
              airline_enc, origin_enc, dest_enc
    """

    def __init__(self, route_key: Optional[str] = None):
        self.route_key  = route_key or "global"
        self.model: Optional[GradientBoostingRegressor] = None
        self.airline_encoder = LabelEncoder()
        self.origin_encoder  = LabelEncoder()
        self.dest_encoder    = LabelEncoder()
        self._trained = False
        # Auto-train on init if no saved model
        self._load_if_needed()
        if not self._trained:
            self.train(self._generate_synthetic_data())

    # ── Feature engineering ────────────────────────────────────────────
    def _engineer_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["days_until_departure"] = pd.to_numeric(df["days_until_departure"], errors="coerce").fillna(30)
        df["day_of_week"]  = pd.to_numeric(df.get("day_of_week",  0), errors="coerce").fillna(0)
        df["month"]        = pd.to_numeric(df.get("month",        6), errors="coerce").fillna(6)
        df["is_weekend"]        = df["day_of_week"].isin([5, 6]).astype(int)
        df["is_near_departure"] = (df["days_until_departure"] <= 7).astype(int)
        df["is_advance_booking"]= (df["days_until_departure"] >= 60).astype(int)
        df["log_days"]          = np.log1p(df["days_until_departure"])
        return df

    # ── Train ──────────────────────────────────────────────────────────
    def train(self, df: pd.DataFrame) -> dict:
        if len(df) < 10:
            df = self._generate_synthetic_data()
        df = self._engineer_features(df)

        df["airline_enc"] = self.airline_encoder.fit_transform(
            df.get("airline_code", pd.Series(["AI"] * len(df))).fillna("AI"))
        df["origin_enc"]  = self.origin_encoder.fit_transform(
            df.get("origin_code",  pd.Series(["DEL"] * len(df))).fillna("DEL"))
        df["dest_enc"]    = self.dest_encoder.fit_transform(
            df.get("destination_code", pd.Series(["BOM"] * len(df))).fillna("BOM"))

        FEATS = ["days_until_departure","day_of_week","month",
                 "is_weekend","is_near_departure","is_advance_booking",
                 "log_days","airline_enc","origin_enc","dest_enc"]

        X, y = df[FEATS].values, df["price"].values
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

        self.model = GradientBoostingRegressor(
            n_estimators=200, learning_rate=0.05,
            max_depth=4, subsample=0.8, random_state=42)
        self.model.fit(X_tr, y_tr)

        mae = mean_absolute_error(y_te, self.model.predict(X_te))
        self._trained = True
        self._save()
        logger.info(f"Model trained. MAE: ₹{mae:.2f}")
        return {"mae": mae, "samples": len(df)}

    # ── Single prediction ──────────────────────────────────────────────
    def _predict_price(self, days_until: int, dep_date: datetime,
                       airline: str = "AI", origin: str = "DEL",
                       destination: str = "BOM") -> float:
        """Raw price prediction (no recommendation logic)."""
        if not self._trained or self.model is None:
            return self._heuristic_price(days_until, dep_date)

        def safe_enc(enc, val):
            try:   return enc.transform([val])[0]
            except: return 0

        row = pd.DataFrame([{
            "days_until_departure": days_until,
            "day_of_week":          dep_date.weekday(),
            "month":                dep_date.month,
            "airline_code":         airline,
            "origin_code":          origin,
            "destination_code":     destination,
        }])
        row = self._engineer_features(row)
        row["airline_enc"] = safe_enc(self.airline_encoder, airline)
        row["origin_enc"]  = safe_enc(self.origin_encoder,  origin)
        row["dest_enc"]    = safe_enc(self.dest_encoder,     destination)

        FEATS = ["days_until_departure","day_of_week","month",
                 "is_weekend","is_near_departure","is_advance_booking",
                 "log_days","airline_enc","origin_enc","dest_enc"]
        return float(self.model.predict(row[FEATS])[0])

    def predict(self, days_until_departure: int, departure_date: datetime,
                airline_code: str = "AI", origin_code: str = "DEL",
                destination_code: str = "BOM") -> dict:
        """Predict price + recommendation for one flight."""
        price = self._predict_price(days_until_departure, departure_date,
                                    airline_code, origin_code, destination_code)
        return self._build_recommendation(price, days_until_departure)

    # ── 30-day deterministic forecast ──────────────────────────────────
    def forecast_30_days(self, origin: str, destination: str,
                         base_price: float = 5000.0) -> List[Dict]:
        """
        Deterministic 30-day forecast.
        Each point = model prediction for that day's departure horizon.
        NO random noise — same input always gives same output.
        """
        today  = datetime.now()
        result = []
        prices = []

        for i in range(30):
            book_date  = today + timedelta(days=i)
            days_until = 30 - i          # horizon shrinks as we get closer
            days_until = max(days_until, 1)

            price = self._predict_price(
                days_until, book_date,
                origin=origin, destination=destination)

            # Scale to base_price context
            if base_price and base_price > 0:
                scale = base_price / 8000.0
                price = price * scale

            price = max(price, base_price * 0.40)
            prices.append(price)
            result.append({
                "date":             book_date.strftime("%Y-%m-%d"),
                "price":            round(price, 2),
                "confidence_low":   0.0,  # filled below
                "confidence_high":  0.0,
                "recommendation":   "",
            })

        # Confidence intervals from rolling std (real, not ±10%)
        arr    = np.array(prices)
        window = 7
        for i in range(len(result)):
            start = max(0, i - window)
            chunk = arr[start:i+1]
            std   = float(np.std(chunk)) if len(chunk) > 1 else arr[i] * 0.08
            result[i]["confidence_low"]  = round(max(arr[i] - 1.5 * std, arr[i] * 0.75), 2)
            result[i]["confidence_high"] = round(arr[i] + 1.5 * std, 2)
            # recommendation per day
            days_left = 30 - i
            result[i]["recommendation"] = self._day_recommendation(days_left, arr, i)

        return result

    # ── forecast_with_analysis (used by /predict endpoint) ─────────────
    def forecast_with_analysis(self, origin: str, destination: str,
                                base_price: float = 8000.0) -> dict:
        """
        Full analysis: forecast + data-driven recommendation.
        Returns all fields required by frontend.
        """
        forecast = self.forecast_30_days(origin, destination, base_price)
        prices   = [f["price"] for f in forecast]
        arr      = np.array(prices)

        # ── Trend: slope of linear regression over 30 days ──────────────
        x = np.arange(len(arr))
        slope = float(np.polyfit(x, arr, 1)[0])  # price change per day

        if   slope >  200: trend = "RISING_FAST"
        elif slope >   50: trend = "RISING"
        elif slope < -200: trend = "FALLING_FAST"
        elif slope <  -50: trend = "FALLING"
        else:              trend = "NEUTRAL"

        # ── Real probability: fraction of days price goes up ────────────
        diffs             = np.diff(arr)
        prob_increase     = float(np.sum(diffs > 0) / len(diffs)) if len(diffs) else 0.5
        prob_increase     = round(prob_increase, 2)

        # ── Confidence from std dev ──────────────────────────────────────
        std               = float(np.std(arr))
        mean_p            = float(np.mean(arr))
        cv                = std / mean_p if mean_p > 0 else 0.2
        confidence        = round(max(0.50, min(0.97, 1 - cv)), 2)

        # ── Expected change ──────────────────────────────────────────────
        expected_change   = round((arr[-1] - arr[0]) / arr[0] * 100, 1) if arr[0] > 0 else 0

        # ── Data-driven recommendation ────────────────────────────────────
        current_price = arr[0]
        min_price     = float(np.min(arr))
        max_price     = float(np.max(arr))
        pct_from_min  = (current_price - min_price) / (max_price - min_price + 1) * 100

        if   trend == "FALLING_FAST" or pct_from_min > 70:
            recommendation = "WAIT"
            reason = f"Prices are trending down. Expected to fall {abs(expected_change):.1f}% over 30 days."
        elif trend == "RISING_FAST" or prob_increase > 0.70:
            recommendation = "BOOK_NOW"
            reason = f"Prices rising fast. {round(prob_increase*100)}% chance of increase. Book before it's too late."
        elif trend == "RISING" or prob_increase > 0.55:
            recommendation = "BOOK_SOON"
            reason = f"Gradual upward trend detected. Book within the next few days for best price."
        elif pct_from_min < 20:
            recommendation = "BOOK_NOW"
            reason = f"Current price is near the 30-day low. Great time to book."
        else:
            recommendation = "WAIT"
            reason = f"Prices are stable. Monitor for a few more days before booking."

        return {
            "predicted_price":      round(current_price, 2),
            "forecast":             forecast,
            "trend":                trend,
            "price_trend":          trend,
            "probability_increase": prob_increase,
            "confidence":           confidence,
            "recommendation":       recommendation,
            "reason":               reason,
            "expected_change_percent": expected_change,
            "best_day":  min(forecast, key=lambda x: x["price"]),
            "worst_day": max(forecast, key=lambda x: x["price"]),
        }

    # ── Helpers ────────────────────────────────────────────────────────
    def _day_recommendation(self, days_left: int, prices: np.ndarray, idx: int) -> str:
        if days_left <= 3:   return "LAST_MINUTE"
        if days_left <= 14:  return "BOOK_NOW"
        if days_left <= 30:  return "BOOK_SOON"
        return "WAIT"

    def _build_recommendation(self, pred_price: float, days_until: int) -> dict:
        """Single-point recommendation (used by /prediction/price endpoint)."""
        if   days_until > 60: rec, reason, trend = "WAIT",      "Plenty of time. Prices typically drop 60+ days before departure.", "NEUTRAL"
        elif days_until > 21: rec, reason, trend = "BOOK_SOON", "Good window. Prices may rise in coming weeks.",                    "RISING"
        elif days_until > 7:  rec, reason, trend = "BOOK_NOW",  "Prices rising rapidly. Book immediately.",                        "RISING_FAST"
        else:                  rec, reason, trend = "LAST_MINUTE","Last-minute prices. Book if you must travel.",                   "HIGH"

        prob     = round(min(0.95, max(0.05, 1 - (days_until / 90))), 2)
        conf     = round(min(0.92, max(0.60, 0.95 - days_until * 0.003)), 2)

        return {
            "predicted_price":      round(pred_price, 2),
            "recommendation":       rec,
            "reason":               reason,
            "price_trend":          trend,
            "probability_increase": prob,
            "confidence":           conf,
            "expected_change_percent": round((1 - days_until / 90) * 30, 1),
        }

    def _heuristic_price(self, days_until: int, dep_date: datetime) -> float:
        base = 8000
        if   days_until <= 3:   m = 2.5
        elif days_until <= 7:   m = 1.8
        elif days_until <= 14:  m = 1.4
        elif days_until <= 30:  m = 1.1
        elif days_until <= 60:  m = 0.95
        else:                   m = 0.85
        if dep_date.weekday() in [4, 5, 6]: m *= 1.15
        season = {12:1.3, 1:1.2, 6:1.15, 7:1.15, 10:1.1}.get(dep_date.month, 1.0)
        return base * m * season

    def _generate_synthetic_data(self) -> pd.DataFrame:
        np.random.seed(42)
        n = 2000
        days   = np.random.randint(1, 120, n)
        months = np.random.randint(1, 13, n)
        dow    = np.random.randint(0, 7, n)
        base   = 8000
        prices = (
            base
            + (1 / (days + 1)) * 15000
            + np.where(dow >= 5, 1500, 0)
            + np.where(np.isin(months, [12, 1, 6, 7]), 2000, 0)
            + np.random.normal(0, 600, n)  # reduced noise for more determinism
        )
        prices = np.maximum(prices, 3000)
        airlines = ["AI", "6E", "SG", "UK", "G8"]
        origins  = ["DEL", "BOM", "BLR", "MAA", "HYD", "CCU"]
        dests    = ["DXB", "LHR", "SIN", "BKK", "CDG", "NRT"]
        return pd.DataFrame({
            "days_until_departure": days, "month": months,
            "day_of_week": dow,           "price": prices,
            "airline_code":    np.random.choice(airlines, n),
            "origin_code":     np.random.choice(origins, n),
            "destination_code":np.random.choice(dests,   n),
        })

    def _save(self):
        path = os.path.join(MODEL_DIR, f"{self.route_key}_model.pkl")
        joblib.dump({
            "model":           self.model,
            "airline_encoder": self.airline_encoder,
            "origin_encoder":  self.origin_encoder,
            "dest_encoder":    self.dest_encoder,
        }, path)

    def _load_if_needed(self):
        if self._trained: return
        path = os.path.join(MODEL_DIR, f"{self.route_key}_model.pkl")
        if os.path.exists(path):
            saved = joblib.load(path)
            self.model           = saved["model"]
            self.airline_encoder = saved["airline_encoder"]
            self.origin_encoder  = saved["origin_encoder"]
            self.dest_encoder    = saved["dest_encoder"]
            self._trained = True


# ══════════════════════════════════════════════════════════════════════
# Hidden Route Finder — Dijkstra
# ══════════════════════════════════════════════════════════════════════

class HiddenRouteFinder:
    def __init__(self):
        self.graph: dict = {}

    def add_route(self, origin: str, destination: str, price: float, via: str = ""):
        self.graph.setdefault(origin, []).append((price, destination, via))

    def find_cheapest_path(self, origin: str, destination: str, max_stops: int = 2):
        if not self.graph: return None
        pq = [(0, origin, [origin], 0)]
        visited = {}
        while pq:
            cost, airport, path, stops = heapq.heappop(pq)
            if airport == destination:
                return {"path": path, "total_price": cost, "stops": stops - 1}
            state = (airport, stops)
            if visited.get(state, float("inf")) <= cost: continue
            visited[state] = cost
            if stops >= max_stops + 1: continue
            for next_price, next_ap, via in self.graph.get(airport, []):
                if next_ap not in path:
                    heapq.heappush(pq, (cost + next_price, next_ap, path + [next_ap], stops + 1))
        return None

    def find_hidden_routes(self, origin: str, destination: str, direct_price: float) -> list:
        results = []
        hubs = ["DXB","IST","SIN","DOH","FRA","AMS","CDG","BKK","KUL","CMB"]
        for hub in hubs:
            if hub in [origin, destination]: continue
            path = self.find_cheapest_path(origin, destination, max_stops=2)
            if path and path["total_price"] < direct_price:
                savings = direct_price - path["total_price"]
                path["savings_vs_direct"] = round(savings, 2)
                path["savings_percent"]   = round(savings / direct_price * 100, 1)
                path["via"] = hub
                results.append(path)
        return sorted(results, key=lambda x: x["total_price"])


# Singleton
_predictor: Optional[FlightPricePredictor] = None

def get_predictor() -> FlightPricePredictor:
    global _predictor
    if _predictor is None:
        _predictor = FlightPricePredictor(route_key="global")
    return _predictor
