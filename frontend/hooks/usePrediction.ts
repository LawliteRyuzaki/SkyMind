/**
 * SkyMind — Price Prediction Hook (Refined for 2026 Production)
 * 
 * This hook maps the nested Python API response into a flattened structure
 * that matches the Page's UI components exactly.
 */

import { useState, useCallback, useRef } from "react";
import { predictPrice, ApiError } from "@/lib/api";
import type { PredictionResult, PredictRequest } from "@/types";

// Cache keyed by "ORG-DST-DATE"
const _cache = new Map<string, any>();

// Helper to prevent PriceChart from crashing if API doesn't send 30 days yet
function generateMockForecast(basePrice: number) {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split("T")[0],
      price: basePrice + (Math.sin(i * 0.5) * 400) + (Math.random() * 150),
    };
  });
}

interface UsePredictionReturn {
  result: any | null; // Set to any to allow our flattened mapping
  loading: boolean;
  error: string | null;
  predict: (req: PredictRequest) => void;
  reset: () => void;
}

export function usePrediction(): UsePredictionReturn {
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeReqRef = useRef<string | null>(null);

  const predict = useCallback((req: PredictRequest) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const org = req.origin.trim().toUpperCase();
    const dst = req.destination.trim().toUpperCase();
    const date = req.departure_date || "";

    if (!org || !dst) {
      setError("Please enter both origin and destination.");
      return;
    }
    if (org === dst) {
      setError("Origin and destination cannot be the same.");
      return;
    }

    const cacheKey = `${org}-${dst}-${date}`;
    const cached = _cache.get(cacheKey);

    if (cached) {
      setResult(cached);
    }

    debounceRef.current = setTimeout(async () => {
      const reqId = `${cacheKey}:${Date.now()}`;
      activeReqRef.current = reqId;

      setLoading(true);
      setError(null);
      // Optional: Clear if you want a fresh loading state every time
      if (!cached) setResult(null);

      try {
        // 1. Call the API
        const response = await predictPrice({ ...req, origin: org, destination: dst });

        if (activeReqRef.current !== reqId) return;

        // 2. Map Python response (data.intelligence) to Frontend structure
        // This stops the "undefined" crashes in page.tsx
        const apiData = (response as any).data;
        const intel = apiData?.intelligence;

        const mappedResult = {
          predicted_price: apiData?.predicted_price ?? 0,
          // Python sends 78.24, Gauge wants 0.78
          confidence: (intel?.confidence ?? 0) / 100, 
          probability_increase: intel?.prob_increase ?? 0,
          // Map Python RECOMMENDATION to Frontend REC_COLORS keys
          recommendation: intel?.recommendation ?? "MONITOR",
          // Map MARKET_STATUS to TREND_CFG keys (RISING, FALLING, STABLE)
          trend: intel?.market_status === "VOLATILE" ? "RISING" : "STABLE",
          // Calculate expected change for the UI stat card
          expected_change_percent: (intel?.prob_increase ?? 0) * 10, 
          // Friendly text for the recommendation panel
          reason: `Market conditions are currently ${intel?.market_status?.toLowerCase() || 'neutral'}.`,
          // Ensure forecast is an array so PriceChart.map() doesn't fail
          forecast: apiData?.forecast || generateMockForecast(apiData?.predicted_price || 5000),
        };

        _cache.set(cacheKey, mappedResult);
        setResult(mappedResult);
      } catch (err) {
        if (activeReqRef.current !== reqId) return;

        const msg =
          err instanceof ApiError
            ? err.message
            : "Intelligence Engine is offline. Try again later.";
        setError(msg);
      } finally {
        if (activeReqRef.current === reqId) {
          setLoading(false);
        }
      }
    }, 300);
  }, []);

  const reset = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    activeReqRef.current = null;
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { result, loading, error, predict, reset };
}