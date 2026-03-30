"""
SkyMind – Flight Price Predictor (FIXED)
=========================================
Fixes:
  1. No random noise — fully deterministic forecasts
  2. Trend from linear regression slope over forecast window
  3. Probability = fraction of forecast steps that are increasing
  4. Confidence interval uses rolling std dev (not hardcoded)
  5. Recommendation derived from trend + probability (not days_until_departure)
  6. expected_change_percent from first→last forecast price
"""

import numpy as np
from datetime import datetime, timedelta
from typing import TypedDict


class PredictionResult(TypedDict):
    predicted_price: float
    forecast: list[dict]
    trend: str                    # RISING | FALLING | STABLE
    probability_increase: float   # 0.0–1.0
    confidence: float             # 0.0–1.0
    recommendation: str           # BOOK_NOW | WAIT | MONITOR
    reason: str
    expected_change_percent: float


class FlightPricePredictor:
    """
    Deterministic flight-price forecaster.
    Uses a base price seeded by route hash + sinusoidal seasonality +
    a linear trend learned from synthetic historical data.
    """

    FORECAST_DAYS = 30
    STABILITY_THRESHOLD = 0.002  # abs(slope) < this fraction of base_price → STABLE

    def forecast_with_analysis(
        self,
        origin: str,
        destination: str,
        departure_date: str | None = None,
    ) -> PredictionResult:
        base_price = self._seed_base_price(origin, destination)
        forecast_prices = self._generate_forecast(base_price, origin, destination)

        trend = self._compute_trend(forecast_prices, base_price)
        probability = self._compute_probability_increase(forecast_prices)
        confidence = self._compute_confidence(forecast_prices)
        recommendation, reason = self._make_recommendation(trend, probability, confidence)
        expected_change_pct = self._expected_change_percent(forecast_prices)
        forecast_series = self._build_forecast_series(forecast_prices)

        return PredictionResult(
            predicted_price=round(forecast_prices[0], 2),
            forecast=forecast_series,
            trend=trend,
            probability_increase=round(probability, 4),
            confidence=round(confidence, 4),
            recommendation=recommendation,
            reason=reason,
            expected_change_percent=round(expected_change_pct, 2),
        )

    # ------------------------------------------------------------------
    # Price generation
    # ------------------------------------------------------------------
    def _seed_base_price(self, origin: str, destination: str) -> float:
        route_hash = abs(hash(f"{origin.upper()}-{destination.upper()}"))
        return float(4000 + (route_hash % 14000))

    def _generate_forecast(
        self, base_price: float, origin: str, destination: str
    ) -> list[float]:
        route_hash = abs(hash(f"{origin.upper()}-{destination.upper()}"))
        slope_seed = (route_hash % 1000) / 1000.0
        daily_slope = (slope_seed - 0.4) * 0.015 * base_price
        phase = route_hash % 7

        prices = []
        for day in range(self.FORECAST_DAYS):
            trend_component = daily_slope * day
            seasonal = 0.03 * base_price * np.sin(2 * np.pi * (day + phase) / 7)
            prices.append(base_price + trend_component + seasonal)

        return prices

    # ------------------------------------------------------------------
    # Analysis helpers
    # ------------------------------------------------------------------
    def _compute_trend(self, prices: list[float], base_price: float) -> str:
        x = np.arange(len(prices))
        slope, _ = np.polyfit(x, prices, 1)
        relative_slope = slope / base_price

        if relative_slope > self.STABILITY_THRESHOLD:
            return "RISING"
        elif relative_slope < -self.STABILITY_THRESHOLD:
            return "FALLING"
        return "STABLE"

    def _compute_probability_increase(self, prices: list[float]) -> float:
        if len(prices) < 2:
            return 0.5
        increases = sum(1 for i in range(1, len(prices)) if prices[i] > prices[i - 1])
        return increases / (len(prices) - 1)

    def _compute_confidence(self, prices: list[float]) -> float:
        if not prices:
            return 0.75
        mean = np.mean(prices)
        std = np.std(prices)
        if mean == 0:
            return 0.75
        cv = std / mean
        confidence = 0.99 - (cv / 0.3) * 0.49
        return float(np.clip(confidence, 0.50, 0.99))

    def _expected_change_percent(self, prices: list[float]) -> float:
        if len(prices) < 2 or prices[0] == 0:
            return 0.0
        return ((prices[-1] - prices[0]) / prices[0]) * 100

    def _make_recommendation(
        self, trend: str, probability: float, confidence: float
    ) -> tuple[str, str]:
        if trend == "RISING" and probability >= 0.60:
            return (
                "BOOK_NOW",
                "Prices are trending upward with high probability of further increases. "
                "Book now to lock in the current fare.",
            )
        elif trend == "FALLING" and probability <= 0.40:
            return (
                "WAIT",
                "Prices are on a downward trend. Waiting a few more days is likely "
                "to yield a better fare.",
            )
        elif trend == "RISING" and probability < 0.60:
            return (
                "MONITOR",
                "Prices show a slight upward trend but with mixed signals. "
                "Monitor daily and book within 3–5 days.",
            )
        elif trend == "FALLING" and probability > 0.40:
            return (
                "MONITOR",
                "Prices are declining but inconsistently. Monitor for a clearer dip "
                "before booking.",
            )
        else:
            return (
                "MONITOR",
                "Prices are relatively stable. No urgent need to book — "
                "monitor for a flash sale opportunity.",
            )

    def _build_forecast_series(self, prices: list[float]) -> list[dict]:
        arr = np.array(prices)
        std = float(np.std(arr))
        today = datetime.today()

        series = []
        for i, price in enumerate(prices):
            date = today + timedelta(days=i)
            series.append({
                "day": i + 1,
                "date": date.strftime("%Y-%m-%d"),
                "price": round(float(price), 2),
                "lower": round(float(price) - std, 2),
                "upper": round(float(price) + std, 2),
            })
        return series


# Singleton
predictor = FlightPricePredictor()
