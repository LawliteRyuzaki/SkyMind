"use client";
// app/predict/page.tsx  (FIXED)
// =====================================================================
// Fixes applied:
//   1. ALL displayed values come from API response (no static data)
//   2. recommendation displayed as "BOOK NOW" / "WAIT" / "MONITOR"
//   3. probability displayed as percentage (Math.round(p * 100))
//   4. confidence displayed as percentage
//   5. Loading state: "Analyzing fares with AI…" + disabled buttons
//   6. Error message if API fails
//   7. Graph uses real forecast data via PriceChart component
//   8. ONE WAY hides return date; ROUND TRIP shows it
//   9. Past-date validation + same origin/destination guard
//  10. "FLY SMARTER" text fixed
// =====================================================================

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePrediction } from "@/hooks/usePrediction";
import type { Recommendation, Trend } from "@/lib/api";

// Lazy-load chart (Chart.js is large)
const PriceChart = dynamic(
  () => import("@/components/charts/PriceChart").then((m) => m.PriceChart),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRecommendation(rec: Recommendation): string {
  return rec.replace(/_/g, " "); // "BOOK_NOW" → "BOOK NOW"
}

function recommendationColour(rec: Recommendation): string {
  const map: Record<Recommendation, string> = {
    BOOK_NOW: "bg-red-500 text-white",
    WAIT:     "bg-green-500 text-white",
    MONITOR:  "bg-yellow-400 text-black",
  };
  return map[rec] ?? "bg-gray-400 text-white";
}

function trendIcon(trend: Trend): string {
  return trend === "RISING" ? "↑" : trend === "FALLING" ? "↓" : "→";
}

function trendColour(trend: Trend): string {
  return trend === "RISING"
    ? "text-red-500"
    : trend === "FALLING"
      ? "text-green-500"
      : "text-blue-500";
}

// Today's date in YYYY-MM-DD for min attribute
const todayISO = new Date().toISOString().split("T")[0];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function PredictPage() {
  const [origin, setOrigin]             = useState("");
  const [destination, setDestination]   = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate]     = useState("");
  const [tripType, setTripType]         = useState<"ONE_WAY" | "ROUND_TRIP">("ONE_WAY");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { result, loading, error, predict, reset } = usePrediction();

  // ------------------------------------------------------------------
  // Validation + submit
  // ------------------------------------------------------------------
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const org = origin.trim().toUpperCase();
    const dst = destination.trim().toUpperCase();

    if (!org || !dst) {
      setValidationError("Please enter both origin and destination.");
      return;
    }
    if (org === dst) {
      setValidationError("Origin and destination cannot be the same.");
      return;
    }
    if (departureDate && departureDate < todayISO) {
      setValidationError("Departure date cannot be in the past.");
      return;
    }

    reset();
    predict({ origin: org, destination: dst, departure_date: departureDate || undefined });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* ── Hero ── */}
      <section className="py-20 text-center">
        <h1 className="text-5xl font-black tracking-tight mb-3">
          {/* FIX: was "FLY SMART ER" */}
          FLY <span className="text-blue-400">SMARTER</span>
        </h1>
        <p className="text-gray-400 text-lg">
          AI-powered price predictions for your next journey
        </p>
      </section>

      {/* ── Search form ── */}
      <section className="max-w-2xl mx-auto px-4">
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 rounded-2xl p-6 space-y-4 shadow-xl"
        >
          {/* Trip type toggle */}
          <div className="flex gap-2">
            {(["ONE_WAY", "ROUND_TRIP"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTripType(t)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tripType === t
                    ? "bg-blue-500 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {t.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Origin / Destination */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">From</label>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="DEL"
                maxLength={6}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">To</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="BOM"
                maxLength={6}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Departure Date
              </label>
              <input
                type="date"
                value={departureDate}
                min={todayISO}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* FIX: only show return date for ROUND TRIP */}
            {tripType === "ROUND_TRIP" && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Return Date
                </label>
                <input
                  type="date"
                  value={returnDate}
                  min={departureDate || todayISO}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Validation error */}
          {validationError && (
            <p className="text-red-400 text-sm">{validationError}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
          >
            {loading ? "Analyzing fares with AI…" : "Predict Price →"}
          </button>
        </form>
      </section>

      {/* ── API error ── */}
      {error && (
        <section className="max-w-2xl mx-auto px-4 mt-6">
          <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-xl px-5 py-4 text-sm">
            ⚠️ {error}
          </div>
        </section>
      )}

      {/* ── Results ── */}
      {result && (
        <section className="max-w-4xl mx-auto px-4 mt-8 pb-20 space-y-6">
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Recommendation */}
            <div className="bg-gray-900 rounded-2xl p-5 flex flex-col gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Recommendation
              </span>
              <span
                className={`self-start px-3 py-1 rounded-full text-sm font-bold ${recommendationColour(result.recommendation)}`}
              >
                {formatRecommendation(result.recommendation)}
              </span>
            </div>

            {/* Probability */}
            <div className="bg-gray-900 rounded-2xl p-5 flex flex-col gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Price Increase Probability
              </span>
              <span className="text-2xl font-black text-white">
                {/* FIX: convert 0.72 → 72% */}
                {Math.round(result.probability_increase * 100)}%
              </span>
            </div>

            {/* Confidence */}
            <div className="bg-gray-900 rounded-2xl p-5 flex flex-col gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Model Confidence
              </span>
              <span className="text-2xl font-black text-white">
                {Math.round(result.confidence * 100)}%
              </span>
            </div>

            {/* Trend */}
            <div className="bg-gray-900 rounded-2xl p-5 flex flex-col gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Price Trend
              </span>
              <span
                className={`text-2xl font-black ${trendColour(result.trend)}`}
              >
                {trendIcon(result.trend)} {result.trend}
              </span>
            </div>
          </div>

          {/* Predicted price + reason */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                  Current Predicted Price
                </p>
                <p className="text-4xl font-black">
                  ₹{result.predicted_price.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                  Expected Change (30d)
                </p>
                <p
                  className={`text-2xl font-bold ${
                    result.expected_change_percent >= 0
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {result.expected_change_percent >= 0 ? "+" : ""}
                  {result.expected_change_percent.toFixed(1)}%
                </p>
              </div>
            </div>
            <p className="mt-4 text-gray-300 text-sm leading-relaxed">
              {result.reason}
            </p>
          </div>

          {/* Price forecast chart – FIX: uses real data */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <h2 className="font-semibold text-gray-200 mb-4">
              30-Day Price Forecast
            </h2>
            <PriceChart forecast={result.forecast} trend={result.trend} />
          </div>
        </section>
      )}

      {/* ── Empty state (no result yet, not loading, no error) ── */}
      {!result && !loading && !error && (
        <section className="max-w-2xl mx-auto px-4 mt-10 text-center text-gray-600">
          <p>Enter an origin and destination above to get AI price insights.</p>
        </section>
      )}
    </main>
  );
}
