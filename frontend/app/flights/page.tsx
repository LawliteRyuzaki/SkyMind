"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/layout/NavBar";
import { searchFlights, formatDuration, resolveCityToIATA } from "@/lib/api";
import type { FlightOffer } from "@/types";
import { format, addDays } from "date-fns";

// ── Passenger Dropdown Component ────────────────────────────────────
function PassengerDropdown({ adults, children, infants, onChange }: {
  adults: number; children: number; infants: number;
  onChange: (a: number, c: number, i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = adults + children + infants;
  const label = `${total} Passenger${total !== 1 ? "s" : ""}`;

  const update = (type: "adults" | "children" | "infants", delta: number) => {
    const next = { adults, children, infants };
    next[type] = Math.max(type === "adults" ? 1 : 0, Math.min(9, next[type] + delta));
    onChange(next.adults, next.children, next.infants);
  };

  const rows = [
    { key: "adults" as const, label: "Adults", sub: "Age 12+", val: adults, min: 1 },
    { key: "children" as const, label: "Children", sub: "Age 2–11", val: children, min: 0 },
    { key: "infants" as const, label: "Infants", sub: "Under 2", val: infants, min: 0 },
  ];

  return (
    <div className="pax-dropdown">
      <label className="field-label">Passengers</label>
      <button type="button" className={`pax-trigger${open ? " open" : ""}`} onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>
          <path d="M1 1L5 5L9 1" stroke="#9b9890" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="pax-panel">
          {rows.map(r => (
            <div key={r.key} className="pax-row">
              <div>
                <div className="pax-label">{r.label}</div>
                <div className="pax-sub">{r.sub}</div>
              </div>
              <div className="pax-counter">
                <button type="button" className="pax-btn" disabled={r.val <= r.min} onClick={() => update(r.key, -1)}>−</button>
                <span className="pax-num">{r.val}</span>
                <button type="button" className="pax-btn" disabled={total >= 9} onClick={() => update(r.key, 1)}>+</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", marginTop: 10, padding: "8px", background: "var(--black)", color: "#fff", border: "none", cursor: "pointer", font: "700 .78rem var(--fb)", letterSpacing: ".04em" }}>Done</button>
        </div>
      )}
    </div>
  );
}

// ── AI Insight Bar ──────────────────────────────────────────────────
function AIInsightBar({ origin, destination, flights }: { origin: string; destination: string; flights: FlightOffer[] }) {
  if (!flights.length) return null;
  const bestFlight = flights[0];
  const trend = (bestFlight.trend || "STABLE").toUpperCase();
  const trendClass = trend === "INCREASING" || trend === "RISING" ? "rising" : trend === "DECREASING" || trend === "FALLING" ? "falling" : "stable";
  const trendLabel = trendClass === "rising" ? "RISING" : trendClass === "falling" ? "FALLING" : "STABLE";
  const trendIcon = trendClass === "rising" ? "↑" : trendClass === "falling" ? "↓" : "→";
  const advice = bestFlight.advice || "Prices are within normal range for this route.";
  const rec = (bestFlight.recommendation || "").toUpperCase();

  return (
    <div className="ai-insight-bar">
      <div>
        <div className="ai-insight-route">{origin} → {destination}</div>
        <div style={{ fontSize: ".65rem", color: "var(--grey3)", fontFamily: "var(--fm)", marginTop: 2 }}>AI Price Intelligence</div>
      </div>
      <div className={`ai-insight-trend ${trendClass}`}>
        {trendIcon} {trendLabel}
      </div>
      {bestFlight.ai_price && (
        <div className="ai-insight-conf">
          AI estimate: <strong style={{ color: "var(--black)" }}>₹{Math.round(bestFlight.ai_price).toLocaleString("en-IN")}</strong>
        </div>
      )}
      <div className="ai-insight-text">{advice}</div>
      <div className="ai-insight-ctas">
        {rec.includes("BOOK") && (
          <button onClick={() => { const el = document.querySelector(".flight-card"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}
            style={{ padding: "7px 14px", background: "var(--red)", color: "#fff", border: "none", cursor: "pointer", font: "700 .72rem var(--fm)", letterSpacing: ".06em", textTransform: "uppercase" }}>
            Book Now
          </button>
        )}
        <Link href={`/predict?origin=${origin}&destination=${destination}`}
          style={{ padding: "7px 14px", background: "transparent", color: "var(--black)", border: "1px solid var(--grey2)", font: "600 .72rem var(--fb)", letterSpacing: ".02em", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Set Alert
        </Link>
      </div>
    </div>
  );
}

// ── Filter Bar ───────────────────────────────────────────────────────
function FilterBar({ active, onChange }: { active: string; onChange: (f: string) => void }) {
  const filters = [
    { id: "all", label: "All Flights" },
    { id: "nonstop", label: "Non-stop" },
    { id: "cheapest", label: "Cheapest" },
    { id: "fastest", label: "Fastest" },
    { id: "morning", label: "Morning" },
    { id: "evening", label: "Evening" },
  ];
  return (
    <div className="filter-bar">
      {filters.map(f => (
        <button key={f.id} className={`filter-btn${active === f.id ? " active" : ""}`} onClick={() => onChange(f.id)}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ── Recommendation Badge ─────────────────────────────────────────────
function RecommendationBadge({ rec }: { rec?: string }) {
  if (!rec) return null;
  const r = rec.toUpperCase();
  if (r.includes("BOOK NOW") || r.includes("BOOK_NOW")) return <span className="badge badge-red">Book Now</span>;
  if (r.includes("WAIT")) return <span className="badge badge-amber">Wait</span>;
  if (r.includes("FAIR") || r.includes("STABLE")) return <span className="badge badge-green">Fair Price</span>;
  return <span className="badge badge-off">Monitor</span>;
}

// ── Skeleton Card ────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="flight-card" style={{ animation: "fadeIn .3s ease both", cursor: "default" }}>
      <div className="flight-top">
        <div style={{ padding: "20px 18px", borderRight: "1px solid var(--grey1)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="skel" style={{ width: 48, height: 48, borderRadius: 4 }} />
            <div>
              <div className="skel" style={{ height: 13, width: 90, marginBottom: 7 }} />
              <div className="skel" style={{ height: 10, width: 60 }} />
            </div>
          </div>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
          <div>
            <div className="skel" style={{ height: 32, width: 70, marginBottom: 6 }} />
            <div className="skel" style={{ height: 10, width: 30 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="skel" style={{ height: 1, width: "100%", margin: "16px 0" }} />
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="skel" style={{ height: 32, width: 70, marginBottom: 6 }} />
            <div className="skel" style={{ height: 10, width: 30 }} />
          </div>
        </div>
        <div style={{ padding: "20px 18px", borderLeft: "1px solid var(--grey1)", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div className="skel" style={{ height: 32, width: 80 }} />
          <div className="skel" style={{ height: 10, width: 55 }} />
          <div className="skel" style={{ height: 36, width: 90 }} />
        </div>
      </div>
      <div style={{ padding: "10px 18px", background: "var(--off)", borderTop: "1px solid var(--grey1)", display: "flex", gap: 10 }}>
        <div className="skel" style={{ height: 20, width: 80 }} />
        <div className="skel" style={{ height: 20, width: 160 }} />
      </div>
    </div>
  );
}

// ── Main Content ─────────────────────────────────────────────────────
function FlightsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const defaultDate = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const [form, setForm] = useState({
    origin:         params.get("origin") || "DEL",
    destination:    params.get("destination") || "BOM",
    departure_date: params.get("departure_date") || defaultDate,
    adults:         parseInt(params.get("adults") || "1"),
    children:       0,
    infants:        0,
    cabin_class:    params.get("cabin_class") || "ECONOMY",
  });
  const [swapping, setSwapping] = useState(false);
  const [flights, setFlights]   = useState<FlightOffer[]>([]);
  const [allFlights, setAllFlights] = useState<FlightOffer[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [sort, setSort]         = useState("Price");
  const [activeFilter, setActiveFilter] = useState("all");
  const [searched, setSearched] = useState(false);
  const [dataSource, setDataSource] = useState("");

  const swap = () => {
    setSwapping(true);
    setTimeout(() => setSwapping(false), 300);
    setForm(f => ({ ...f, origin: f.destination, destination: f.origin }));
  };

  const sortAndFilterFlights = useCallback((list: FlightOffer[], s: string, filter: string): FlightOffer[] => {
    let arr = [...list];

    // Filter
    if (filter === "nonstop") arr = arr.filter(f => (f.itineraries[0]?.segments?.length ?? 1) === 1);
    else if (filter === "cheapest") arr = [...arr].sort((a, b) => a.price.total - b.price.total);
    else if (filter === "fastest") arr = [...arr].sort((a, b) => (a.itineraries[0]?.duration || "").localeCompare(b.itineraries[0]?.duration || ""));
    else if (filter === "morning") arr = arr.filter(f => {
      const dep = f.itineraries[0]?.segments[0]?.departure_time;
      if (!dep) return false;
      const h = new Date(dep).getHours();
      return h >= 5 && h < 12;
    });
    else if (filter === "evening") arr = arr.filter(f => {
      const dep = f.itineraries[0]?.segments[0]?.departure_time;
      if (!dep) return false;
      const h = new Date(dep).getHours();
      return h >= 17 && h < 23;
    });

    // Sort
    if (s === "Price") arr.sort((a, b) => a.price.total - b.price.total);
    else if (s === "Duration") arr.sort((a, b) => (a.itineraries[0]?.duration || "").localeCompare(b.itineraries[0]?.duration || ""));
    else if (s === "Departure") arr.sort((a, b) => (a.itineraries[0]?.segments[0]?.departure_time || "").localeCompare(b.itineraries[0]?.segments[0]?.departure_time || ""));

    return arr;
  }, []);

  const doSearch = useCallback(async (f = form) => {
    const org = resolveCityToIATA(f.origin.trim());
    const dst = resolveCityToIATA(f.destination.trim());
    if (!org || !dst) { setError("Enter origin and destination."); return; }
    if (org === dst) { setError("Origin and destination cannot be the same."); return; }
    if (f.departure_date < tomorrow) { setError("Please select a future date."); return; }
    setLoading(true); setError(""); setSearched(true); setActiveFilter("all");
    try {
      const res = await searchFlights({ origin: org, destination: dst, departure_date: f.departure_date, adults: f.adults, cabin_class: f.cabin_class as any, max_results: 20 });
      const sorted = sortAndFilterFlights(res.flights || [], sort, "all");
      setAllFlights(res.flights || []);
      setFlights(sorted);
      setDataSource((res as any).data_source || "");
    } catch (e: any) {
      setError(e.message || "Search failed.");
      setFlights([]); setAllFlights([]);
    }
    setLoading(false);
  }, [form, sort, tomorrow, sortAndFilterFlights]);

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    setFlights(sortAndFilterFlights(allFlights, sort, filter));
  };

  const handleSortChange = (s: string) => {
    setSort(s);
    setFlights(sortAndFilterFlights(allFlights, s, activeFilter));
  };

  useEffect(() => { if (params.get("origin")) doSearch(); }, []);

  const totalPax = form.adults + form.children + form.infants;
  const paxLabel = `${totalPax} Passenger${totalPax !== 1 ? "s" : ""}`;

  return (
    <div style={{ paddingTop: 60 }}>
      {/* Search strip */}
      <div className="search-strip">
        <div className="wrap">
          {/* Origin / Swap / Destination row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label className="field-label">From</label>
              <input className="inp" value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value.toUpperCase() }))} placeholder="DEL" style={{ fontFamily: "var(--fm)", fontWeight: 700 }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="button" className={`swap-btn${swapping ? " swapping" : ""}`} onClick={swap} title="Swap airports"
                style={{ transform: swapping ? "rotate(180deg)" : "none", transition: "transform .3s ease" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
              </button>
            </div>
            <div>
              <label className="field-label">To</label>
              <input className="inp" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value.toUpperCase() }))} placeholder="BOM" style={{ fontFamily: "var(--fm)", fontWeight: 700 }} />
            </div>
          </div>

          {/* Date / Passengers / Class / Search */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <label className="field-label">Date</label>
              <input type="date" className="inp" value={form.departure_date} min={tomorrow} onChange={e => setForm(f => ({ ...f, departure_date: e.target.value }))} />
            </div>
            <PassengerDropdown adults={form.adults} children={form.children} infants={form.infants}
              onChange={(a, c, i) => setForm(f => ({ ...f, adults: a, children: c, infants: i }))} />
            <div>
              <label className="field-label">Class</label>
              <select className="inp" value={form.cabin_class} onChange={e => setForm(f => ({ ...f, cabin_class: e.target.value }))}>
                <option value="ECONOMY">Economy</option>
                <option value="PREMIUM_ECONOMY">Prem Economy</option>
                <option value="BUSINESS">Business</option>
                <option value="FIRST">First Class</option>
              </select>
            </div>
            <button className="search-submit" onClick={() => doSearch()} disabled={loading}
              style={{ height: 44, padding: "0 24px", width: "auto", fontSize: ".8rem", gap: 6, whiteSpace: "nowrap" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </div>
      </div>

      {/* Results area */}
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>

        {/* Error */}
        {error && (
          <div className="error-state" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "var(--red)", marginBottom: 6, fontFamily: "var(--fm)", fontSize: ".78rem" }}>SEARCH FAILED</div>
            <div style={{ fontSize: ".85rem", color: "var(--grey4)", marginBottom: 10 }}>{error}</div>
            <button className="btn-primary" onClick={() => doSearch()} style={{ fontSize: ".78rem", padding: "8px 16px" }}>Try again</button>
          </div>
        )}

        {/* Results bar */}
        {(searched || loading) && (
          <div className="results-bar">
            <div>
              <div className="results-title">
                <span style={{ fontFamily: "var(--fm)", fontWeight: 700 }}>{form.origin}</span>
                <span style={{ color: "var(--grey3)" }}> → </span>
                <span style={{ fontFamily: "var(--fm)", fontWeight: 700 }}>{form.destination}</span>
                <span className="badge badge-black" style={{ marginLeft: 8, fontSize: "9px" }}>{form.departure_date}</span>
              </div>
              <div className="results-count">
                {loading ? "Searching live fares…" : `${flights.length} flight${flights.length !== 1 ? "s" : ""} found`}
                {dataSource && !loading && (
                  <span style={{ marginLeft: 8 }}>· {dataSource === "AMADEUS" ? "Live GDS" : "Synthetic"}</span>
                )}
                {!loading && form.adults + form.children + form.infants > 1 && (
                  <span style={{ marginLeft: 8 }}>· {paxLabel}</span>
                )}
              </div>
            </div>
            <div className="sort-strip">
              {["Price", "Duration", "Departure"].map(s => (
                <button key={s} className={`sort-btn${sort === s ? " active" : ""}`} onClick={() => handleSortChange(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* AI Insight Bar */}
        {!loading && flights.length > 0 && (
          <AIInsightBar origin={form.origin} destination={form.destination} flights={flights} />
        )}

        {/* Filter Bar */}
        {!loading && flights.length > 0 && (
          <FilterBar active={activeFilter} onChange={handleFilterChange} />
        )}

        {/* Skeleton loaders */}
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ animation: `fadeUp .35s ${i * 0.06}s ease both` }}>
            <SkeletonCard />
          </div>
        ))}

        {/* Empty state */}
        {!loading && searched && flights.length === 0 && !error && (
          <div className="empty-state">
            <div style={{ width: 52, height: 52, background: "var(--off)", border: "1px solid var(--grey1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "var(--grey3)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5S18 2 16.5 3.5L13 7 4.8 6.2c-.5-.1-.9.1-1.1.5L2 8.9c-.2.4-.1.9.2 1.2l4.6 4.1-1.5 6.4 2.8 2.8 5.3-3.2 4.1 4.6c.3.4.8.5 1.2.2l1.1-1.2c.4-.2.6-.6.5-1.1z" /></svg>
            </div>
            <div style={{ fontFamily: "var(--fd)", fontSize: "1.8rem", letterSpacing: ".04em", color: "var(--black)", marginBottom: 8 }}>NO FLIGHTS FOUND</div>
            <div style={{ fontSize: ".85rem", color: "var(--grey4)", marginBottom: 20, fontFamily: "var(--fm)" }}>
              {activeFilter !== "all" ? "Try removing filters" : "Try: DEL→BOM · BOM→BLR · DEL→BLR"}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {activeFilter !== "all" && <button className="btn-outline" onClick={() => handleFilterChange("all")} style={{ fontSize: ".82rem" }}>Clear Filters</button>}
              <button className="btn-primary" onClick={() => doSearch()} style={{ fontSize: ".82rem" }}>Search Again</button>
            </div>
          </div>
        )}

        {/* No search yet */}
        {!searched && !loading && (
          <div className="empty-state">
            <div style={{ width: 52, height: 52, background: "var(--off)", border: "1px solid var(--grey1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "var(--grey3)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
            <div style={{ fontFamily: "var(--fd)", fontSize: "1.8rem", letterSpacing: ".04em", color: "var(--black)", marginBottom: 8 }}>SEARCH FLIGHTS</div>
            <div style={{ fontSize: ".85rem", color: "var(--grey4)", fontFamily: "var(--fm)", lineHeight: 1.7 }}>Enter your route above to see AI-powered<br />flight results and price predictions</div>
          </div>
        )}

        {/* Flight cards */}
        {flights.map((f, i) => {
          const itin = f.itineraries[0];
          const seg = itin?.segments[0];
          const lastSeg = itin?.segments[itin.segments.length - 1];
          const stops = (itin?.segments.length || 1) - 1;
          const dep = seg?.departure_time
            ? new Date(seg.departure_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
            : "--:--";
          const arr = lastSeg?.arrival_time
            ? new Date(lastSeg.arrival_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
            : "--:--";
          const dur = formatDuration(itin?.duration || "");
          const airlineCode = f.primary_airline || seg?.airline_code || "AI";
          const airlineName = f.primary_airline_name || seg?.airline_name || airlineCode;
          const price = Math.round(f.price.total);
          const aiPrice = f.ai_price ? Math.round(f.ai_price) : null;
          const isFirst = i === 0;

          return (
            <div key={f.id} className={`flight-card${isFirst ? " best-card" : ""}`}
              style={{ animation: `cardIn 0.4s ${Math.min(i * 0.06, 0.4)}s ease both` }}
              onClick={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("selected_flight", JSON.stringify(f));
                  sessionStorage.setItem("search_params", JSON.stringify(form));
                }
                router.push("/booking");
              }}>

              {isFirst && <div className="best-tag">Best value</div>}

              <div className="flight-top" style={{ borderTop: isFirst ? "2px solid var(--red)" : undefined }}>

                {/* Airline info */}
                <div className="flight-airline">
                  <div className="airline-logo-box">
                    <img src={`https://content.airhex.com/content/logos/airlines_${airlineCode}_200_200_s.png`}
                      alt={airlineName}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    {airlineCode}
                  </div>
                  <div>
                    <div className="airline-name-txt">{airlineName}</div>
                    <div className="airline-num-txt">{seg?.flight_number || "--"}</div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="flight-timeline">
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div className="t-time">{dep}</div>
                    <div className="t-iata">{seg?.origin || form.origin}</div>
                  </div>
                  <div className="t-mid">
                    <div className="t-dur">{dur}</div>
                    <div className="fline" style={{ width: "100%", marginTop: 4, marginBottom: 4 }}>
                      <div className="fline-dot" />
                      <div className="fline-track" style={{ flex: 1 }}>
                        <div className="fline-plane">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--red)"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5S18 2 16.5 3.5L13 7 4.8 6.2c-.5-.1-.9.1-1.1.5L2 8.9c-.2.4-.1.9.2 1.2l4.6 4.1-1.5 6.4 2.8 2.8 5.3-3.2 4.1 4.6c.3.4.8.5 1.2.2l1.1-1.2c.4-.2.6-.6.5-1.1z" /></svg>
                        </div>
                      </div>
                      <div className="fline-dot" />
                    </div>
                    <div className={`t-stop${stops === 0 ? " direct" : " one-stop"}`}>
                      {stops === 0 ? "Non-stop" : `${stops} stop${stops > 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div className="t-time">{arr}</div>
                    <div className="t-iata">{lastSeg?.destination || form.destination}</div>
                  </div>
                </div>

                {/* Price */}
                <div className="flight-price-col">
                  <div style={{ textAlign: "right" }}>
                    <div className="f-price">₹{price.toLocaleString("en-IN")}</div>
                    <div className="f-price-per">per person</div>
                    {f.seats_available && f.seats_available <= 5 && (
                      <div className="f-seats">{f.seats_available} left</div>
                    )}
                    {aiPrice && Math.abs(aiPrice - price) > 200 && (
                      <div className="f-ai-badge" style={{ marginTop: 4 }}>
                        AI: ₹{aiPrice.toLocaleString("en-IN")}
                      </div>
                    )}
                  </div>
                  <button className="btn-select"
                    onClick={e => {
                      e.stopPropagation();
                      if (typeof window !== "undefined") {
                        sessionStorage.setItem("selected_flight", JSON.stringify(f));
                        sessionStorage.setItem("search_params", JSON.stringify(form));
                      }
                      router.push("/booking");
                    }}>
                    Select Flight →
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="flight-bottom">
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <RecommendationBadge rec={f.recommendation} />
                  {f.advice && (
                    <span style={{ fontSize: ".75rem", color: "var(--grey3)", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.advice}
                    </span>
                  )}
                  <Link href={`/predict?origin=${form.origin}&destination=${form.destination}`}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: ".72rem", color: "var(--red)", textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap", fontFamily: "var(--fm)" }}>
                    30-day forecast →
                  </Link>
                </div>
                <span style={{ fontSize: ".68rem", color: "var(--grey3)", fontFamily: "var(--fm)" }}>
                  {form.cabin_class === "ECONOMY" ? "Economy" : form.cabin_class}
                  {f.instant_ticketing && " · Instant ticket"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes cardIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @media(max-width:640px) {
          .form-strip-grid { grid-template-columns: 1fr 1fr !important; }
          .search-col-auto { grid-column: span 2; }
        }
      `}</style>
    </div>
  );
}

export default function FlightsPage() {
  return (
    <>
      <NavBar />
      <Suspense fallback={
        <div style={{ paddingTop: 120, textAlign: "center", color: "var(--grey3)", fontFamily: "var(--fm)", fontSize: ".8rem" }}>
          Loading…
        </div>
      }>
        <FlightsContent />
      </Suspense>
    </>
  );
}
