"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import NavBar from "@/components/layout/NavBar";
import FlightSearchForm from "@/components/flights/FlightSearchForm";
import PopularDestinations from "@/components/flights/PopularDestinations";

// ── Counter animation ────────────────────────────────────────────────
function Counter({ to, suf }: { to: number; suf: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let v = 0;
        const step = to / 55;
        const t = setInterval(() => {
          v = Math.min(v + step, to);
          setVal(Math.round(v));
          if (v >= to) clearInterval(t);
        }, 18);
      }
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);
  return <div ref={ref}>{val}<span style={{ color: "var(--red)" }}>{suf}</span></div>;
}

const TICKER = [
  "GET /ai/price", "XGBoost ML", "Live Inference", "Amadeus GDS",
  "90+ Indian Airports", "FastAPI Backend", "Supabase", "Razorpay PCI-DSS",
  "Real-time Predictions", "Vercel Edge", "APScheduler", "Price Intelligence",
];

const ArrowRight = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const TrendingUpIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);
const BarChartIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const BellIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const CreditCardIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

// ── Price Insight Card — replaces the route graph ────────────────────
function PriceInsightCard({ route, origin, dest, price, change, trend }: {
  route: string; origin: string; dest: string; price: string; change: string; trend: "up" | "down" | "stable";
}) {
  const trendColor = trend === "up" ? "#E11D48" : trend === "down" ? "#16A34A" : "#2563EB";
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return (
    <div style={{ background: "var(--white)", borderRadius: 12, padding: "16px 18px", border: "1px solid var(--grey-0)", transition: "all .2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--grey-3)", marginBottom: 5 }}>{route}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--charcoal)", letterSpacing: ".04em" }}>
            {origin} <span style={{ color: "var(--grey-3)" }}>→</span> {dest}
          </div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: trendColor, background: `${trendColor}10`, border: `1px solid ${trendColor}30`, padding: "2px 8px", borderRadius: "var(--r-full)" }}>
          {trendIcon} {change}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: "1.5rem", letterSpacing: "-0.04em", color: "var(--charcoal)" }}>{price}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--grey-3)", marginTop: 3 }}>AI predicted price</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div>
      <NavBar />

      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-left a1">
          <div className="hero-issue">Vol. 1 — AI Flight Intelligence Platform</div>
          <h1 className="hero-title">
            FLY<br />SMARTER
            <span className="serif-line">with artificial<br />intelligence.</span>
          </h1>
          <p className="hero-desc">
            XGBoost ML predicts the exact moment to book across 90+ Indian airports.
            Live Amadeus GDS fares, 30-day price forecasts, and smart alerts.
          </p>
          <div className="hero-ctas">
            <Link href="/flights" className="btn btn-primary">Search flights <ArrowRight /></Link>
            <Link href="/predict" className="btn btn-outline">AI forecast</Link>
          </div>
          <div className="hero-stats">
            {[
              { to: 2,  suf: "M+", label: "Fares analysed" },
              { to: 38, suf: "%",  label: "Avg savings"    },
              { to: 94, suf: "%",  label: "AI accuracy"    },
            ].map(s => (
              <div key={s.label} className="hero-stat">
                <div className="hero-stat-num"><Counter to={s.to} suf={s.suf} /></div>
                <div className="hero-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-right a2">
          <div className="hero-right-title">FIND YOUR FLIGHT</div>
          <div className="hero-right-sub">Powered by Amadeus GDS + SkyMind AI</div>
          <FlightSearchForm />
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ height: 1, flex: 1, background: "var(--grey-0)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--grey-2)", letterSpacing: ".1em", textTransform: "uppercase" }}>
              GET /ai/price · XGBoost ML
            </span>
            <div style={{ height: 1, flex: 1, background: "var(--grey-0)" }} />
          </div>
        </div>
      </div>

      {/* ── TICKER ── */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {[...TICKER, ...TICKER, ...TICKER].map((t, i) => (
            <div key={i} className="ticker-item">{t}</div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS — price insight cards replace route graph ── */}
      <div className="how-section">
        <div className="wrap">
          <div className="section-eyebrow" style={{ marginBottom: 40 }}>
            <span className="label">How SkyMind works</span>
            <div className="section-eyebrow-line" />
            <span className="label-red">03 systems</span>
          </div>

          <div className="how-grid">
            {/* Left: copy */}
            <div className="how-left">
              <h2 style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: "clamp(2.5rem,5vw,4rem)", letterSpacing: "-0.04em", lineHeight: 0.92, color: "var(--charcoal)", marginBottom: 20 }}>
                NOT JUST<br />SEARCH.
                <span style={{ display: "block", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--red)", fontSize: "clamp(1.4rem,3.2vw,2.8rem)", marginTop: 6, fontWeight: 400, lineHeight: 1.2 }}>
                  Intelligence.
                </span>
              </h2>
              <p style={{ fontSize: 14, color: "var(--grey-4)", lineHeight: 1.75, marginBottom: 32, maxWidth: 400 }}>
                SkyMind layers the GET /ai/price endpoint — our most accurate inference model —
                on top of live Amadeus fare data to surface deals before prices move.
              </p>
              {[
                { n: "01", title: "Live fare ingestion",    text: "Amadeus GDS feeds pulled on demand across 90+ Indian airports and key international hubs." },
                { n: "02", title: "GET /ai/price inference", text: "XGBoost model scored with live weighting. Confidence, recommendation, and market status — fresh every call." },
                { n: "03", title: "30-Day price forecast",  text: "POST /predict generates a deterministic route-seeded trajectory. See the price window before you book." },
              ].map(s => (
                <div key={s.n} className="how-step">
                  <span className="how-step-num">{s.n}</span>
                  <div className="how-step-text">
                    <span className="how-step-title">{s.title}</span>
                    {s.text}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
                <Link href="/flights" className="btn btn-primary">Search flights <ArrowRight /></Link>
                <Link href="/predict" className="btn btn-outline">See AI forecast</Link>
              </div>
            </div>

            {/* Right: price insight cards — replacing route graph */}
            <div className="how-right">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--grey-3)", marginBottom: 14 }}>
                  Sample predictions · GET /ai/price
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <PriceInsightCard route="Popular · Domestic" origin="DEL" dest="BOM" price="₹4,850" change="+12%" trend="up"     />
                  <PriceInsightCard route="Trending · Beach"   origin="BOM" dest="GOI" price="₹3,290" change="-5%"  trend="down"   />
                  <PriceInsightCard route="Stable · Business"  origin="DEL" dest="BLR" price="₹5,100" change="±2%"  trend="stable" />
                </div>
              </div>

              {/* Mini stats */}
              <div className="insight-grid">
                {[
                  { label: "Avg savings vs. direct booking", val: "₹1,200",  color: "#16A34A"         },
                  { label: "Model confidence (avg)",         val: "87%",      color: "var(--charcoal)" },
                  { label: "Routes monitored daily",         val: "240+",     color: "var(--charcoal)" },
                ].map(c => (
                  <div key={c.label} className="insight-card">
                    <div className="insight-label">{c.label}</div>
                    <div className="insight-val" style={{ color: c.color }}>{c.val}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--grey-2)", letterSpacing: ".1em", textTransform: "uppercase" }}>
                  Direct flights only · No connecting routes
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <div className="feat-section">
        <div className="wrap">
          <div className="section-eyebrow" style={{ marginBottom: 32 }}>
            <span className="label">Core capabilities</span>
            <div className="section-eyebrow-line" />
            <span className="label-red">04 systems</span>
          </div>
          <div className="feat-grid">
            {[
              { num: "01 / INTELLIGENCE", title: "ML Price Intelligence",   desc: "XGBoost trained on millions of fare datapoints. GET /ai/price gives you confidence score, recommendation, and market status — live.", icon: <TrendingUpIcon size={18} /> },
              { num: "02 / FORECAST",     title: "30-Day Price Forecast",   desc: "POST /predict generates a full trajectory with confidence bands. See the best and worst booking windows before you commit.", icon: <BarChartIcon size={18} /> },
              { num: "03 / ALERTS",       title: "Smart Price Alerts",      desc: "Set a target price. Our scheduler monitors 24/7 and notifies via Email + SMS the moment it's reached.", icon: <BellIcon size={18} /> },
              { num: "04 / BOOKING",      title: "Seamless Booking",        desc: "Full Razorpay integration — UPI, cards, netbanking. Instant confirmation with email notifications.", icon: <CreditCardIcon size={18} /> },
            ].map(f => (
              <div key={f.num} className="feat-card">
                <div className="feat-num">{f.num}</div>
                <div className="feat-icon">{f.icon}</div>
                <div className="feat-title">{f.title}</div>
                <div className="feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── POPULAR DESTINATIONS ── */}
      <div className="dest-section">
        <div className="wrap">
          <div className="dest-header">
            <div>
              <div className="section-eyebrow" style={{ marginBottom: 8 }}>
                <span className="label">Trending now</span>
                <div className="section-eyebrow-line" style={{ maxWidth: 60 }} />
              </div>
              <h2 style={{ fontWeight: 800, fontSize: "clamp(1.8rem,4vw,3rem)", letterSpacing: "-0.04em", color: "var(--charcoal)" }}>
                POPULAR ROUTES
              </h2>
            </div>
            <Link href="/flights" className="btn btn-outline" style={{ fontSize: 13 }}>
              All routes <ArrowRight size={13} />
            </Link>
          </div>
          <PopularDestinations />
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="cta-band">
        <div className="cta-inner">
          <div>
            <div className="cta-eyebrow">SkyMind — AI Flight Platform</div>
            <div className="cta-title">
              READY TO FLY
              <em>smarter than ever?</em>
            </div>
          </div>
          <div className="cta-btns">
            <Link href="/flights" className="btn-white">Search flights</Link>
            <Link href="/predict" className="btn-white-outline">View predictions</Link>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer>
        <div className="footer-inner">
          <div className="footer-logo">SKY<em>MIND</em></div>
          <span className="footer-copy">© 2026 SkyMind · AI Flight Intelligence · India</span>
          <div className="footer-links">
            <Link href="/flights"    className="footer-link">Search</Link>
            <Link href="/predict"    className="footer-link">Predict</Link>
            <Link href="/dashboard"  className="footer-link">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
