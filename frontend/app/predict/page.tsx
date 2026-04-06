"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import NavBar from "@/components/layout/NavBar";
import { usePrediction } from "@/hooks/usePrediction";
import { useAlerts } from "@/hooks/useAlerts";
import { searchAirports, resolveCityToIATA } from "@/lib/api";
import type { Trend } from "@/types";
import { toast } from "sonner";

const PriceChart = dynamic(
  () => import("@/components/charts/PriceChart").then((m) => m.PriceChart),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--grey-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading chart...
      </div>
    ),
  }
);

const todayISO = new Date().toISOString().split("T")[0];

// ── Trend/recommendation config (no emojis) ──────────────────────────
const TREND_CFG: Record<Trend, { bg: string; color: string; border: string; label: string; indicator: string }> = {
  RISING:  { bg: "rgba(225,29,72,0.07)",   color: "#E11D48", border: "rgba(225,29,72,0.2)",   label: "Rising",  indicator: "↑" },
  FALLING: { bg: "rgba(22,163,74,0.07)",   color: "#16A34A", border: "rgba(22,163,74,0.2)",   label: "Falling", indicator: "↓" },
  STABLE:  { bg: "rgba(37,99,235,0.07)",   color: "#2563EB", border: "rgba(37,99,235,0.2)",   label: "Stable",  indicator: "→" },
};

const REC_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  BUY_NOW: { bg: "rgba(225,29,72,0.08)", color: "#BE123C", border: "rgba(225,29,72,0.25)" },
  WAIT:    { bg: "rgba(234,179,8,0.08)", color: "#854D0E", border: "rgba(234,179,8,0.25)"  },
  "OPTIMIZED PRICE": { bg: "rgba(37,99,235,0.08)", color: "#1D4ED8", border: "rgba(37,99,235,0.25)" },
};

// ── Confidence gauge (SVG, no emoji) ─────────────────────────────────
function ConfidenceGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#16A34A" : pct >= 60 ? "#D97706" : "#E11D48";
  const r = 36, cx = 44, cy = 44;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div style={{ textAlign: "center", flexShrink: 0 }}>
      <div style={{ position: "relative", width: 88, height: 88 }}>
        <svg width={88} height={88} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--grey-0)" strokeWidth={8} />
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color} strokeWidth={8}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.35rem", color, lineHeight: 1 }}>{pct}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "var(--grey-3)", letterSpacing: ".08em" }}>%</span>
        </div>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--grey-3)", marginTop: 6, letterSpacing: ".08em", textTransform: "uppercase" }}>
        Confidence
      </div>
    </div>
  );
}

// ── Airport autocomplete ──────────────────────────────────────────────
interface AirportFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}

function AirportField({ label, value, onChange, placeholder, disabled }: AirportFieldProps) {
  const [results, setResults] = useState<{ iata: string; label: string; city?: string; airport?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = useCallback((q: string) => {
    onChange(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (q.length < 2) { setResults([]); setOpen(false); return; }
      try {
        const data = await searchAirports(q);
        setResults(data.slice(0, 8) as any);
        setOpen(data.length > 0);
      } catch {
        setOpen(false);
      }
    }, 280);
  }, [onChange]);

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: 12 }}>
      <label className="field-label">{label}</label>
      <input
        className="inp"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        style={{ textTransform: value.length === 3 && /^[A-Z]+$/.test(value) ? "uppercase" : "none" }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "#fff", border: "1.5px solid var(--red)",
          borderTop: "none", zIndex: 500, maxHeight: 240, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(19,18,16,.12)", borderRadius: "0 0 8px 8px",
        }}>
          {results.map((a) => (
            <div
              key={a.iata}
              onClick={() => { onChange(a.iata); setOpen(false); }}
              style={{
                padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--grey-0)",
                transition: "background 100ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--off-white)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--red)", fontSize: ".78rem", fontWeight: 700, minWidth: 32 }}>{a.iata}</span>
                <div>
                  <div style={{ fontSize: ".88rem", fontWeight: 600, color: "var(--charcoal)" }}>{(a as any).city || a.label}</div>
                  {(a as any).airport && <div style={{ fontSize: ".72rem", color: "var(--grey-3)" }}>{(a as any).airport}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Skeleton loading state ────────────────────────────────────────────
function PredictionSkeleton() {
  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "var(--grey-0)", border: "1.5px solid var(--grey-0)", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ background: "#fff", padding: 16 }}>
            <div className="skel" style={{ height: 10, width: "60%", marginBottom: 12 }} />
            <div className="skel" style={{ height: 28, width: "80%", marginBottom: 6 }} />
            <div className="skel" style={{ height: 10, width: "50%" }} />
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", border: "1.5px solid var(--grey-0)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
        <div className="skel" style={{ height: 14, width: "40%", marginBottom: 12 }} />
        <div className="skel" style={{ height: 200 }} />
      </div>
    </div>
  );
}

// ── Main predict page ─────────────────────────────────────────────────
function PredictContent() {
  const searchParams = useSearchParams();

  const [origin, setOrigin] = useState(searchParams.get("origin") ?? "");
  const [destination, setDestination] = useState(searchParams.get("destination") ?? "");
  const [departureDate, setDepartureDate] = useState("");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  // Track what was last searched so we can show context
  const [searchedRoute, setSearchedRoute] = useState({ origin: "", destination: "" });

  const { result, loading, error, predict, reset } = usePrediction();
  const { addAlert, loading: alertLoading } = useAlerts();

  // When origin/destination change from search params initially, auto-search
  useEffect(() => {
    const org = searchParams.get("origin");
    const dst = searchParams.get("destination");
    if (org && dst) {
      const resolvedOrg = resolveCityToIATA(org);
      const resolvedDst = resolveCityToIATA(dst);
      setOrigin(resolvedOrg);
      setDestination(resolvedDst);
      setSearchedRoute({ origin: resolvedOrg, destination: resolvedDst });
      predict({ origin: resolvedOrg, destination: resolvedDst, departure_date: undefined });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const org = resolveCityToIATA(origin.trim());
    const dst = resolveCityToIATA(destination.trim());

    if (!org || !dst) { toast.error("Please enter origin and destination."); return; }
    if (org === dst) { toast.error("Origin and destination cannot be the same."); return; }
    if (departureDate && departureDate < todayISO) { toast.error("Please select a future departure date."); return; }

    // Always reset before a new search to clear old results
    reset();
    setSearchedRoute({ origin: org, destination: dst });
    predict({ origin: org, destination: dst, departure_date: departureDate || undefined });
  }, [origin, destination, departureDate, predict, reset]);

  const handleSetAlert = useCallback(async () => {
    if (!origin || !destination) { toast.error("Fill in route first."); return; }
    if (!alertPrice || Number(alertPrice) < 500) { toast.error("Enter a valid target price (min ₹500)."); return; }
    const res = await addAlert({
      origin: resolveCityToIATA(origin),
      destination: resolveCityToIATA(destination),
      target_price: Number(alertPrice),
      departure_date: departureDate || undefined,
      notify_email: alertEmail || undefined,
    });
    if (res.ok) { toast.success(res.message); setAlertPrice(""); setAlertEmail(""); }
    else toast.error(res.message);
  }, [origin, destination, alertPrice, alertEmail, departureDate, addAlert]);

  const trendCfg = result ? (TREND_CFG[result.trend] ?? TREND_CFG.STABLE) : null;
  const recColors = result ? (REC_COLORS[result.recommendation] ?? REC_COLORS.MONITOR) : null;
  const recLabel = result ? result.recommendation.replace(/_/g, " ") : "";

  const bestDay = result?.forecast?.reduce((best, p) => (!best || p.price < best.price ? p : best), null as typeof result.forecast[0] | null);
  const worstDay = result?.forecast?.reduce((worst, p) => (!worst || p.price > worst.price ? p : worst), null as typeof result.forecast[0] | null);

  return (
    <div>
      <NavBar />
      <div style={{ paddingTop: 60 }}>

        {/* Hero */}
        <div className="predict-hero">
          <div className="wrap">
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", marginBottom: 12 }}>
                  AI Price Intelligence · 30-Day Forecast
                </div>
                <h1 className="predict-title">
                  PRICE<br />PREDICT<em>ion.</em>
                </h1>
              </div>
              <div style={{ color: "rgba(255,255,255,.35)", fontFamily: "var(--font-mono)", fontSize: ".65rem", maxWidth: 200, textAlign: "right", lineHeight: 1.7 }}>
                XGBoost ML · Real-time inference<br />
                Confidence intervals · Live market data
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="wrap">
          <div className="predict-grid">

            {/* Left — Form + Results */}
            <div>
              {/* Search form */}
              <form
                onSubmit={handleSubmit}
                style={{ border: "1.5px solid var(--grey-0)", padding: 20, marginBottom: 16, background: "var(--white)", borderRadius: 16 }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--grey-3)", marginBottom: 16 }}>
                  Route & Date
                </div>
                <AirportField label="From" value={origin} onChange={setOrigin} placeholder="Delhi / DEL" disabled={loading} />
                <AirportField label="To" value={destination} onChange={setDestination} placeholder="Mumbai / BOM" disabled={loading} />
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label">Departure Date <span style={{ color: "var(--grey-2)", fontWeight: 400 }}>(optional)</span></label>
                  <input
                    type="date" className="inp"
                    value={departureDate} min={todayISO}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <button type="submit" className="search-submit" disabled={loading}>
                  {loading ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                      Analysing fares...
                    </span>
                  ) : "Predict Price →"}
                </button>
                {error && (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(225,29,72,.07)", border: "1px solid var(--red)", color: "var(--red)", fontSize: ".82rem", borderRadius: 8 }}>
                    {error}
                  </div>
                )}
              </form>

              {/* Loading skeleton */}
              {loading && <PredictionSkeleton />}

              {/* Results */}
              {result && !loading && (
                <div style={{ animation: "fadeUp 0.4s ease" }}>
                  {/* Stat trio */}
                  <div className="stat-trio" style={{ marginBottom: 16 }}>
                    <div className="stat-trio-item">
                      <div className="sti-label">Predicted Price</div>
                      <div className="sti-val" style={{ color: "var(--charcoal)" }}>
                        ₹{result.predicted_price.toLocaleString("en-IN")}
                      </div>
                      <div className="sti-sub">AI estimate</div>
                    </div>
                    <div className="stat-trio-item">
                      <div className="sti-label">Confidence</div>
                      <div className="sti-val" style={{ color: result.confidence >= 0.8 ? "#16A34A" : result.confidence >= 0.6 ? "#D97706" : "#E11D48" }}>
                        {Math.round(result.confidence * 100)}%
                      </div>
                      <div className="sti-sub">Model certainty</div>
                    </div>
                    <div className="stat-trio-item">
                      <div className="sti-label">30-Day Change</div>
                      <div className="sti-val" style={{ color: result.expected_change_percent >= 0 ? "var(--red)" : "#16A34A" }}>
                        {result.expected_change_percent >= 0 ? "+" : ""}{result.expected_change_percent.toFixed(2)}%
                      </div>
                      <div className="sti-sub">Expected shift</div>
                    </div>
                  </div>

                  {/* Best/worst booking window */}
                  {bestDay && worstDay && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                      <div style={{ padding: "14px 16px", background: "rgba(22,163,74,.05)", border: "1px solid rgba(22,163,74,.2)", borderRadius: 12 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#16A34A", marginBottom: 6 }}>
                          Best Day to Book
                        </div>
                        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.15rem", color: "#16A34A" }}>
                          {new Date(bestDay.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: ".72rem", color: "#16A34A", marginTop: 2 }}>
                          ₹{Math.round(bestDay.price).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div style={{ padding: "14px 16px", background: "rgba(225,29,72,.05)", border: "1px solid rgba(225,29,72,.2)", borderRadius: 12 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--red)", marginBottom: 6 }}>
                          Peak Price Day
                        </div>
                        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.15rem", color: "var(--red)" }}>
                          {new Date(worstDay.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: ".72rem", color: "var(--red)", marginTop: 2 }}>
                          ₹{Math.round(worstDay.price).toLocaleString("en-IN")}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chart */}
                  <div className="chart-area">
                    <div className="chart-title">30-Day Price Forecast</div>
                    <div className="chart-sub">
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: ".7rem", color: "var(--grey-4)", letterSpacing: ".04em" }}>
                        {searchedRoute.origin} → {searchedRoute.destination}
                      </span>
                      {trendCfg && (
                        <span style={{
                          padding: "2px 8px",
                          background: trendCfg.bg, color: trendCfg.color,
                          border: `1px solid ${trendCfg.border}`,
                          fontFamily: "var(--font-mono)", fontSize: ".65rem", fontWeight: 700, letterSpacing: ".06em",
                          borderRadius: 4,
                        }}>
                          {trendCfg.indicator} {trendCfg.label.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <PriceChart forecast={result.forecast} trend={result.trend} />
                  </div>

                  {/* Price Alert form */}
                  <div style={{ border: "1.5px solid var(--grey-0)", padding: 20, background: "var(--off-white)", marginTop: 16, borderRadius: 16 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--grey-3)", marginBottom: 14 }}>
                      Set Price Alert
                    </div>
                    <div className="form-2">
                      <div>
                        <label className="field-label">Target Price (₹)</label>
                        <input
                          className="inp" type="number" min="500"
                          value={alertPrice}
                          onChange={(e) => setAlertPrice(e.target.value)}
                          placeholder={result ? `e.g. ${Math.round(result.predicted_price * 0.9).toLocaleString("en-IN")}` : "e.g. 4500"}
                        />
                      </div>
                      <div>
                        <label className="field-label">Email <span style={{ color: "var(--grey-2)" }}>(optional)</span></label>
                        <input
                          className="inp" type="email"
                          value={alertEmail}
                          onChange={(e) => setAlertEmail(e.target.value)}
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleSetAlert}
                      disabled={alertLoading}
                      className="btn btn-primary"
                      style={{ width: "100%", justifyContent: "center", marginTop: 4, opacity: alertLoading ? 0.7 : 1 }}
                    >
                      {alertLoading ? "Setting alert..." : "Set Price Alert →"}
                    </button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!result && !loading && (
                <div style={{ border: "1.5px solid var(--grey-0)", padding: "52px 24px", textAlign: "center", background: "var(--white)", borderRadius: 16 }}>
                  <div style={{ width: 56, height: 56, background: "var(--off-white)", border: "1px solid var(--grey-0)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--grey-2)" strokeWidth={1.5}>
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "1.1rem", color: "var(--charcoal)", marginBottom: 8, letterSpacing: "-0.02em" }}>
                    No prediction yet
                  </div>
                  <div style={{ fontSize: ".82rem", color: "var(--grey-3)", lineHeight: 1.7, fontFamily: "var(--font-mono)" }}>
                    Enter a route and press Predict Price<br />to see the 30-day AI forecast
                  </div>
                </div>
              )}
            </div>

            {/* Right — Recommendation panel */}
            <div className="rec-panel">
              {result && !loading ? (
                <div className="rec-card" style={{ animation: "fadeUp 0.4s ease" }}>
                  {/* Header */}
                  <div className="rec-header">
                    <span className="rec-label">AI Recommendation</span>
                    {trendCfg && (
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: ".65rem", fontWeight: 700,
                        color: trendCfg.color, background: trendCfg.bg,
                        padding: "2px 8px", border: `1px solid ${trendCfg.border}`, borderRadius: 4,
                      }}>
                        {trendCfg.indicator} {trendCfg.label.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="rec-body">
                    {/* Confidence gauge + recommendation */}
                    <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 16, borderBottom: "1px solid var(--grey-0)", marginBottom: 16 }}>
                      <ConfidenceGauge value={result.confidence} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {recColors && (
                          <div style={{
                            padding: "10px 14px", background: recColors.bg,
                            border: `1px solid ${recColors.border}`, borderRadius: 8, marginBottom: 8,
                          }}>
                            <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: "1.15rem", color: recColors.color, lineHeight: 1, letterSpacing: "-0.02em" }}>
                              {recLabel}
                            </div>
                          </div>
                        )}
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", color: "var(--grey-4)", lineHeight: 1.6 }}>
                          {result.reason}
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="rec-stat">
                      <span className="rec-stat-label">Prob. of price increase</span>
                      <span className="rec-stat-val" style={{ color: result.probability_increase > 0.6 ? "var(--red)" : "#16A34A" }}>
                        {Math.round(result.probability_increase * 100)}%
                      </span>
                    </div>
                    <div className="rec-stat">
                      <span className="rec-stat-label">Model confidence</span>
                      <span className="rec-stat-val">{Math.round(result.confidence * 100)}%</span>
                    </div>
                    <div className="rec-stat">
                      <span className="rec-stat-label">30-day forecast</span>
                      <span className="rec-stat-val" style={{ color: result.expected_change_percent >= 0 ? "var(--red)" : "#16A34A" }}>
                        {result.expected_change_percent >= 0 ? "+" : ""}{result.expected_change_percent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="rec-stat">
                      <span className="rec-stat-label">Current AI price</span>
                      <span className="rec-stat-val">₹{result.predicted_price.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="rec-stat" style={{ borderBottom: "none" }}>
                      <span className="rec-stat-label">Trend</span>
                      <span className="rec-stat-val" style={{ color: trendCfg?.color }}>
                        {trendCfg?.indicator} {result.trend}
                      </span>
                    </div>

                    {/* Market signals */}
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                      {result.probability_increase > 0.65 && (
                        <div style={{ padding: "10px 12px", background: "rgba(225,29,72,.05)", border: "1px solid rgba(225,29,72,.2)", fontSize: ".75rem", color: "#BE123C", display: "flex", gap: 8, borderRadius: 8, alignItems: "flex-start" }}>
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}>
                            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                          </svg>
                          <span>High probability of price rise — consider booking now to lock in a lower fare.</span>
                        </div>
                      )}
                      {result.confidence >= 0.85 && (
                        <div style={{ padding: "10px 12px", background: "rgba(22,163,74,.05)", border: "1px solid rgba(22,163,74,.2)", fontSize: ".75rem", color: "#15803D", display: "flex", gap: 8, borderRadius: 8, alignItems: "flex-start" }}>
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>High confidence prediction — strong market signal from the XGBoost model.</span>
                        </div>
                      )}
                    </div>

                    {/* Search flights CTA */}
                    {origin && destination && (
                      <a
                        href={`/flights?origin=${resolveCityToIATA(origin)}&destination=${resolveCityToIATA(destination)}&departure_date=${departureDate || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]}&adults=1&cabin_class=ECONOMY`}
                        className="btn btn-primary"
                        style={{ width: "100%", justifyContent: "center", marginTop: 16, textDecoration: "none" }}
                      >
                        Search Flights →
                      </a>
                    )}
                  </div>
                </div>
              ) : loading ? (
                <div style={{ border: "1.5px solid var(--grey-0)", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ background: "var(--charcoal)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,.3)", animation: "livePulse 1.2s ease infinite" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "rgba(255,255,255,.4)", letterSpacing: ".1em", textTransform: "uppercase" }}>Analysing...</span>
                  </div>
                  <div style={{ padding: 20 }}>
                    {[80, 60, 70, 55, 75].map((w, i) => (
                      <div key={i} className="skel" style={{ height: 12, width: `${w}%`, marginBottom: 14 }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ border: "1.5px solid var(--grey-0)", padding: "32px 20px", textAlign: "center", color: "var(--grey-3)", fontFamily: "var(--font-mono)", fontSize: ".75rem", lineHeight: 1.7, background: "var(--white)", borderRadius: 16 }}>
                  <div style={{ width: 44, height: 44, background: "var(--off-white)", border: "1px solid var(--grey-0)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--grey-2)" strokeWidth={1.5}>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  Enter a route and click<br />
                  <strong style={{ color: "var(--charcoal)", fontWeight: 700 }}>Predict Price</strong><br />
                  to see the AI forecast &amp; recommendation.
                </div>
              )}

              {/* How it works */}
              <div style={{ border: "1.5px solid var(--grey-0)", padding: "16px 18px", marginTop: 16, background: "var(--white)", borderRadius: 16 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--grey-3)", marginBottom: 14 }}>
                  How it works
                </div>
                {[
                  { n: "01", t: "XGBoost ML Model", d: "Trained on real fare data. 2026 live weighting prioritises recent market signals." },
                  { n: "02", t: "Route-Seeded Forecast", d: "Deterministic 30-day projection with statistical confidence intervals." },
                  { n: "03", t: "Smart Recommendation", d: "Book Now, Wait, or Monitor — derived from trend direction and probability score." },
                ].map((s, idx, arr) => (
                  <div key={s.n} style={{ display: "flex", gap: 12, paddingBottom: idx < arr.length - 1 ? 12 : 0, marginBottom: idx < arr.length - 1 ? 12 : 0, borderBottom: idx < arr.length - 1 ? "1px solid var(--grey-0)" : "none" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", color: "var(--red)", fontWeight: 700, flexShrink: 0, paddingTop: 2 }}>{s.n}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: ".82rem", color: "var(--charcoal)", marginBottom: 2 }}>{s.t}</div>
                      <div style={{ fontSize: ".72rem", color: "var(--grey-4)", lineHeight: 1.6 }}>{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

export default function PredictPage() {
  return (
    <Suspense fallback={
      <div style={{ paddingTop: 120, textAlign: "center", color: "var(--grey-3)", fontFamily: "var(--font-mono)", fontSize: ".8rem" }}>
        Loading...
      </div>
    }>
      <PredictContent />
    </Suspense>
  );
}
