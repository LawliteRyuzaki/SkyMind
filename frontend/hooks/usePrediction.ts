// hooks/usePrediction.ts (FIXED)
// =====================================================================
// Fixes:
//   1. Debounce (300ms) to prevent duplicate API calls
//   2. Loading + error state management
//   3. In-memory cache keyed by origin+destination
//   4. Returns typed PredictionResult — no hardcoded fallbacks
// =====================================================================

import { useState, useCallback, useRef } from "react";
import { predictPrice, PredictionResult, PredictRequest, ApiError } from "@/lib/api";

const cache = new Map<string, PredictionResult>();

interface UsePredictionReturn {
  result: PredictionResult | null;
  loading: boolean;
  error: string | null;
  predict: (req: PredictRequest) => void;
  reset: () => void;
}

export function usePrediction(): UsePredictionReturn {
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeReqRef = useRef<string | null>(null);

  const predict = useCallback((req: PredictRequest) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const org = req.origin.trim().toUpperCase();
    const dst = req.destination.trim().toUpperCase();

    if (!org || !dst) {
      setError("Please enter both origin and destination.");
      return;
    }
    if (org === dst) {
      setError("Origin and destination cannot be the same.");
      return;
    }

    const cacheKey = `${org}-${dst}`;
    if (cache.has(cacheKey)) {
      setResult(cache.get(cacheKey)!);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const reqId = cacheKey + Date.now();
      activeReqRef.current = reqId;

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const data = await predictPrice({ ...req, origin: org, destination: dst });
        if (activeReqRef.current !== reqId) return;
        cache.set(cacheKey, data);
        setResult(data);
      } catch (err) {
        if (activeReqRef.current !== reqId) return;
        setError(err instanceof ApiError ? err.message : "An unexpected error occurred. Please try again.");
      } finally {
        if (activeReqRef.current === reqId) setLoading(false);
      }
    }, 300);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { result, loading, error, predict, reset };
}