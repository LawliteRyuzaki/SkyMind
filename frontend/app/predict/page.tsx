"use client";
// app/predict/page.tsx (FIXED)
// =====================================================================
// All fixes applied:
//   1. All values from API (no hardcoded data)
//   2. "FLY SMARTER" text fixed
//   3. ONE WAY hides return date
//   4. Past-date + same origin/destination validation
//   5. Loading: "Analyzing fares with AI…"
//   6. Error banner on API failure
//   7. Chart uses real forecast data
//   8. Recommendation: "BOOK NOW" not "BOOK_NOW"
//   9. Probability + confidence shown as percent
//  10. "Set Alert" button → stores alert, polls every 10s
//  11. Alert panel shows all active alerts + triggered state
// =====================================================================

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import NavBar from "@/components/layout/NavBar";
import { usePrediction } from "@/hooks/usePrediction";
import { useAlerts } from "@/hooks/useAlerts";
import type { Recommendation, Trend } from "@/lib/api";
import { toast } from "sonner";

const PriceChart = dynamic(
  () => import("@/components/charts/PriceChart").then((m) => m.PriceChart),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRec(rec: Recommendation): string {
  return rec.replace(/_/g, " ");
}

function recStyle(rec: Recommendation): React.CSSProperties {
  const map: Record<Recommendation, React.CSSProperties> = {
    BOOK_NOW: { background: "var(--red)", color: "#fff" },
    WAIT:     { background: "#166534", color: "#fff" },
    MONITOR:  { background: "#92400e", color: "#fff" },
  };
  return map[rec] ?? { background: "var(--grey2)", color: "var(--black)" };
}

function trendIcon(trend: Trend): string {
  return trend === "RISING" ? "↑" : trend === "FALLING" ? "↓" : "→";
}

function trendColor(trend: Trend): string {
  return trend === "RISING" ? "var(--red)" : trend === "FALLING" ? "#166534" : "#2563eb";
}

const todayISO = new Date().toISOString().split("T")[0];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PredictPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [tripType, setTripType] = useState<"ONE_WAY" | "ROUND_TRIP">("ONE_WAY");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [alertPrice, setAlertPrice] = useState("");
  const [alertSetting, setAlertSetting] = useState(false);

  const { result, loading, error, predict, reset } = usePrediction();
  const { alerts, triggered, addAlert, removeAlert, lastChecked } = useAlerts();

  // Show toast when alert triggers
  useEffect(() => {
    for (const alert of triggered) {
      toast.success(
        `🎯 Alert hit! ${alert.origin}→${alert.destination} is now ₹${alert.current_price?.toLocaleString("en-IN")} (target ₹${alert.target_price.toLocaleString("en-IN")})`,
        { duration: 8000 }
      );
    }
  }, [triggered]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const org = origin.trim().toUpperCase();
    const dst = destination.trim().toUpperCase();

    if (!org || !dst) { setValidationError("Please enter both origin and destination."); return; }
    if (org === dst) { setValidationError("Origin and destination cannot be the same."); return; }
    if (departureDate && departureDate < todayISO) { setValidationError("Departure date cannot be in the past."); return; }

    reset();
    predict({ origin: org, destination: dst, departure_date: departureDate || undefined });

    // Pre-fill alert price if we get result
    if (result) setAlertPrice(String(Math.round(result.predicted_price)));
  }

  async function handleSetAlert() {
    const org = origin.trim().toUpperCase();
    const dst = destination.trim().toUpperCase();
    const price = parseFloat(alertPrice);

    if (!org || !dst) { toast.error("Enter origin and destination first"); return; }
    if (!price || price <= 0) { toast.error("Enter a valid target price"); return; }

    setAlertSetting(true);
    const res = await addAlert({
      origin: org,
      destination: dst,
      target_price: price,
      departure_date: departureDate || undefined,
    });
    setAlertSetting(false);

    if (res.ok) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  }

  return (
    <div>
      <NavBar />
      <div style={{ paddingTop: "60px" }}>

        {/* ── Hero ── */}
        <div className="predict-hero">
          <div className="wrap">
            <div className="label" style={{ color: "rgba(255,255,255,.4)", marginBottom: "16px" }}>
              AI Price Intelligence
            </div>
            {/* FIX: was "FLY SMART ER" */}
            <h1 className="predict-title">
              FLY SMARTER
              <em>with AI price prediction.</em>
            </h1>
          </div>
        </div>

        <div className="wrap">
          <div className="predict-grid">

            {/* ── Left: Results ── */}
            <div style={{ order: 2 }}>

              {/* Search form */}
              <div className="chart-area" style={{ marginBottom: "16px" }}>
                <div className="chart-title">Price Prediction</div>
                <div className="chart-sub">Enter a route to get AI-powered fare analysis</div>

                {/* Trip type toggle */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                  {(["ONE_WAY", "ROUND_TRIP"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTripType(t)}
                      className={`trip-tab${tripType === t ? " active" : ""}`}
                      style={{ flex: "none", padding: "7px 16px" }}
                    >
                      {t.replace("_", " ")}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    <div>
                      <label className="field-label">From (IATA)</label>
                      <input
                        className="inp"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value.toUpperCase().slice(0, 4))}
                        placeholder="DEL"
                        maxLength={4}
                        style={{ fontFamily: "var(--fm)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}
                      />
                    </div>
                    <div>
                      <label className="field-label">To (IATA)</label>
                      <input
                        className="inp"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value.toUpperCase().slice(0, 4))}
                        placeholder="BOM"
                        maxLength={4}
                        style={{ fontFamily: "var(--fm)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: tripType === "ROUND_TRIP" ? "1fr 1fr" : "1fr", gap: "10px", marginBottom: "10px" }}>
                    <div>
                      <label className="field-label">Departure Date</label>
                      <input
                        type="date"
                        className="inp"
                        value={departureDate}
                        min={todayISO}
                        onChange={(e) => setDepartureDate(e.target.value)}
                      />
                    </div>
                    {/* FIX: only show return date for ROUND TRIP */}
                    {tripType === "ROUND_TRIP" && (
                      <div>
                        <label className="field-label">Return Date</label>
                        <input
                          type="date"
                          className="inp"
                          value={returnDate}
                          min={departureDate || todayISO}
                          onChange={(e) => setReturnDate(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {validationError && (
                    <div style={{ padding: "10px 14px", background: "rgba(232,25,26,.08)", border: "1px solid var(--red)", color: "var(--red)", fontSize: ".82rem", marginBottom: "10px" }}>
                      {validationError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="search-submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span style={{ animation: "blink 1.2s infinite" }}>●</span>
                        Analyzing fares with AI…
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                        Predict Price
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* API Error */}
              {error && (
                <div style={{ border: "1px solid var(--red)", padding: "16px 20px", background: "rgba(232,25,26,.06)", marginBottom: "16px", borderLeft: "4px solid var(--red)" }}>
                  <div style={{ fontWeight: 700, color: "var(--red)", marginBottom: "4px", fontFamily: "var(--fd)", letterSpacing: ".04em" }}>ANALYSIS FAILED</div>
                  <div style={{ fontSize: ".875rem", color: "var(--grey4)" }}>{error}</div>
                </div>
              )}

              {/* Results */}
              {result && (
                <>
                  {/* Summary stats */}
                  <div className="stat-trio" style={{ marginBottom: "16px" }}>
                    <div className="stat-trio-item">
                      <div className="sti-label">Recommendation</div>
                      <div style={{ display: "inline-flex", alignItems: "center", padding: "5px 12px", fontWeight: 700, fontSize: ".88rem", letterSpacing: ".04em", ...recStyle(result.recommendation) }}>
                        {formatRec(result.recommendation)}
                      </div>
                    </div>
                    {/* FIX: probability as percentage */}
                    <div className="stat-trio-item">
                      <div className="sti-label">Price Increase Prob.</div>
                      <div className="sti-val">{Math.round(result.probability_increase * 100)}%</div>
                      <div className="sti-sub">of further price rise</div>
                    </div>
                    {/* FIX: confidence as percentage */}
                    <div className="stat-trio-item">
                      <div className="sti-label">Model Confidence</div>
                      <div className="sti-val">{Math.round(result.confidence * 100)}%</div>
                    </div>
                  </div>

                  {/* Price + trend */}
                  <div className="chart-area" style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
                      <div>
                        <div className="label" style={{ marginBottom: "6px" }}>Current Predicted Price</div>
                        <div style={{ fontFamily: "var(--fd)", fontSize: "2.8rem", letterSpacing: ".02em", lineHeight: 1 }}>
                          ₹{result.predicted_price.toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="label" style={{ marginBottom: "6px" }}>Trend (30d)</div>
                        <div style={{ fontFamily: "var(--fd)", fontSize: "1.8rem", color: trendColor(result.trend) }}>
                          {trendIcon(result.trend)} {result.trend}
                        </div>
                        <div style={{ fontSize: ".78rem", color: "var(--grey4)", marginTop: "4px" }}>
                          Expected change:{" "}
                          <span style={{ fontWeight: 700, color: result.expected_change_percent >= 0 ? "var(--red)" : "#166534" }}>
                            {result.expected_change_percent >= 0 ? "+" : ""}{result.expected_change_percent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px", background: "var(--off)", border: "1px solid var(--grey1)", fontSize: ".875rem", color: "var(--grey4)", lineHeight: 1.65 }}>
                      {result.reason}
                    </div>
                  </div>

                  {/* 30-day forecast chart — uses REAL data */}
                  <div className="chart-area" style={{ marginBottom: "16px" }}>
                    <div className="chart-title">30-Day Price Forecast</div>
                    <div className="chart-sub" style={{ fontFamily: "var(--fm)" }}>
                      Best: ₹{Math.min(...result.forecast.map((p) => p.price)).toLocaleString("en-IN")} on Day{" "}
                      {result.forecast.reduce((a, b) => (b.price < a.price ? b : a)).day} ·
                      Worst: ₹{Math.max(...result.forecast.map((p) => p.price)).toLocaleString("en-IN")} on Day{" "}
                      {result.forecast.reduce((a, b) => (b.price > a.price ? b : a)).day}
                    </div>
                    <PriceChart forecast={result.forecast} trend={result.trend} />
                  </div>

                  {/* Set Alert */}
                  <div className="chart-area">
                    <div className="chart-title">Set Price Alert</div>
                    <div className="chart-sub">Get notified when price drops to your target</div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <label className="field-label">Target price (₹)</label>
                        <input
                          className="inp"
                          type="number"
                          value={alertPrice}
                          onChange={(e) => setAlertPrice(e.target.value)}
                          placeholder={String(Math.round(result.predicted_price * 0.9))}
                        />
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={handleSetAlert}
                        disabled={alertSetting}
                        style={{ height: "40px", padding: "0 20px" }}
                      >
                        {alertSetting ? "Setting…" : "Set Alert"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Empty state */}
              {!result && !loading && !error && (
                <div style={{ padding: "48px 24px", textAlign: "center", border: "1px solid var(--grey1)", color: "var(--grey3)", fontFamily: "var(--fm)", fontSize: ".85rem" }}>
                  Enter an origin and destination above to get AI price insights.
                </div>
              )}
            </div>

            {/* ── Right: Alert panel ── */}
            <div className="rec-panel">
              <div className="rec-card">
                <div className="rec-header">
                  <span className="rec-label">Active Alerts</span>
                  {alerts.length > 0 && (
                    <span className="badge badge-red">{alerts.length}</span>
                  )}
                </div>
                <div className="rec-body">
                  {alerts.length === 0 ? (
                    <div style={{ fontSize: ".82rem", color: "var(--grey3)", textAlign: "center", padding: "20px 0" }}>
                      No alerts set yet.<br />Set an alert after predicting a route.
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="rec-stat"
                        style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px", padding: "10px 0" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                          <div style={{ fontFamily: "var(--fm)", fontSize: ".78rem", fontWeight: 700 }}>
                            {alert.origin} → {alert.destination}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {alert.triggered && (
                              <span className="badge badge-green" style={{ fontSize: ".6rem" }}>HIT</span>
                            )}
                            <button
                              onClick={() => removeAlert(alert.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--grey3)", fontSize: ".75rem", padding: "0 2px" }}
                              title="Remove alert"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: ".75rem", color: "var(--grey4)" }}>
                          Target: <strong>₹{alert.target_price.toLocaleString("en-IN")}</strong>
                          {alert.current_price !== undefined && (
                            <> · Now: <strong style={{ color: alert.triggered ? "#166534" : "var(--grey4)" }}>
                              ₹{alert.current_price.toLocaleString("en-IN")}
                            </strong></>
                          )}
                        </div>
                        {alert.triggered && (
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#166534" }}>
                            ✓ Target reached — book now!
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {lastChecked && (
                    <div style={{ fontSize: ".65rem", color: "var(--grey3)", marginTop: "12px", fontFamily: "var(--fm)", letterSpacing: ".04em" }}>
                      Last checked: {lastChecked.toLocaleTimeString("en-IN")}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick help */}
              <div className="rec-card" style={{ marginTop: "16px" }}>
                <div className="rec-header">
                  <span className="rec-label">How to read</span>
                </div>
                <div className="rec-body">
                  {[
                    { label: "BOOK NOW", desc: "Rising trend — buy today", color: "var(--red)" },
                    { label: "WAIT", desc: "Falling — prices dropping", color: "#166534" },
                    { label: "MONITOR", desc: "Stable or mixed signals", color: "#92400e" },
                  ].map((r) => (
                    <div key={r.label} className="rec-stat">
                      <span style={{ fontFamily: "var(--fm)", fontSize: ".7rem", fontWeight: 700, color: r.color }}>{r.label}</span>
                      <span style={{ fontSize: ".78rem", color: "var(--grey4)" }}>{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
