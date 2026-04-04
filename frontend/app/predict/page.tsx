"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import NavBar from "@/components/layout/NavBar";
import { usePrediction } from "@/hooks/usePrediction";
import { useAlerts } from "@/hooks/useAlerts";
import { resolveCityToIATA, searchAirports } from "@/lib/api";
import type { Recommendation, Trend } from "@/lib/api";
import { toast } from "sonner";


const PriceChart = dynamic(
  () => import("@/components/charts/PriceChart").then((m) => m.PriceChart),
  { ssr: false }
);

const todayISO = new Date().toISOString().split("T")[0];

function PredictContent() {
  const searchParams = useSearchParams();

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originResults, setOriginResults] = useState<any[]>([]);
  const [destinationResults, setDestinationResults] = useState<any[]>([]);

  const [departureDate, setDepartureDate] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { result, loading, predict, reset } = usePrediction();
  const { addAlert } = useAlerts();

  const originRef = useRef<HTMLDivElement>(null);
  const destinationRef = useRef<HTMLDivElement>(null);

  // 🔥 debounce
  let debounceTimer: any;

  const handleSearch = (q: string, type: "origin" | "destination") => {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      if (q.length < 2) return;

      const data = await searchAirports(q);

      if (type === "origin") setOriginResults(data);
      else setDestinationResults(data);
    }, 300);
  };

  // 🔥 close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: any) => {
      if (!originRef.current?.contains(e.target)) setOriginResults([]);
      if (!destinationRef.current?.contains(e.target)) setDestinationResults([]);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const org = resolveCityToIATA(origin);
    const dst = resolveCityToIATA(destination);

    if (!org || !dst) {
      setValidationError("Enter valid airports");
      return;
    }

    reset();
    predict({ origin: org, destination: dst, departure_date: departureDate });
  }

  return (
    <div>
      <NavBar />
      <div style={{ paddingTop: "60px" }}>
        <div className="wrap">
          <div className="predict-grid">

            <div>

              {/* FORM */}
              <form onSubmit={handleSubmit}>

                {/* FROM */}
                <div ref={originRef} style={{ position: "relative" }}>
                  <input
                    className="inp"
                    value={origin}
                    onChange={(e) => {
                      setOrigin(e.target.value);
                      handleSearch(e.target.value, "origin");
                    }}
                    placeholder="From (Delhi / DEL)"
                  />

                  {originResults.length > 0 && (
                    <div style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      border: "1px solid #ddd",
                      zIndex: 10
                    }}>
                      {originResults.map((a) => (
                        <div
                          key={a.iata}
                          onClick={() => {
                            setOrigin(a.iata);
                            setOriginResults([]);
                          }}
                          style={{
                            padding: "8px",
                            cursor: "pointer",
                            borderBottom: "1px solid #eee"
                          }}
                        >
                          <strong>{a.label}</strong>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            {a.airport}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* TO */}
                <div ref={destinationRef} style={{ position: "relative" }}>
                  <input
                    className="inp"
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      handleSearch(e.target.value, "destination");
                    }}
                    placeholder="To (Mumbai / BOM)"
                  />

                  {destinationResults.length > 0 && (
                    <div style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      border: "1px solid #ddd",
                      zIndex: 10
                    }}>
                      {destinationResults.map((a) => (
                        <div
                          key={a.iata}
                          onClick={() => {
                            setDestination(a.iata);
                            setDestinationResults([]);
                          }}
                          style={{
                            padding: "8px",
                            cursor: "pointer",
                            borderBottom: "1px solid #eee"
                          }}
                        >
                          <strong>{a.label}</strong>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            {a.airport}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <input
                  type="date"
                  className="inp"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                />

                <button className="search-submit" type="submit">
                  {loading ? "Analyzing..." : "Predict Price"}
                </button>
              </form>

              {/* RESULT */}
              {result && (
                <div style={{ marginTop: 20 }}>
                  <h2>₹ {result.predicted_price}</h2>

                  <p>{result.recommendation}</p>
                  <p>Confidence: {Math.round(result.confidence * 100)}%</p>
                  <p>Trend: {result.trend}</p>

                  <h3>7-Day Forecast</h3>
                  {result.forecast.map((f: any) => (
                    <div key={f.date}>
                      {f.date} → ₹{f.price}
                    </div>
                  ))}

                  <PriceChart forecast={result.forecast} trend={result.trend} />
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function PredictPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PredictContent />
    </Suspense>
  );
}
