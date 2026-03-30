// lib/api.ts  (FIXED)
// =====================================================================
// Fixes:
//   1. Typed request/response interfaces match backend schema exactly
//   2. Proper error propagation (throws ApiError with message)
//   3. Base URL from env variable with fallback
//   4. No hardcoded values – all data comes from the API
// =====================================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ForecastPoint {
  day: number;
  date: string;
  price: number;
  lower: number;
  upper: number;
}

export type Trend = "RISING" | "FALLING" | "STABLE";
export type Recommendation = "BOOK_NOW" | "WAIT" | "MONITOR";

export interface PredictionResult {
  predicted_price: number;
  forecast: ForecastPoint[];
  trend: Trend;
  probability_increase: number; // 0.0 – 1.0
  confidence: number;           // 0.0 – 1.0
  recommendation: Recommendation;
  reason: string;
  expected_change_percent: number;
}

export interface PredictRequest {
  origin: string;
  destination: string;
  departure_date?: string; // ISO date string, optional
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const errBody = await res.json();
      message = errBody?.detail ?? message;
    } catch {
      // response body not JSON – keep default message
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------
export async function predictPrice(
  req: PredictRequest,
): Promise<PredictionResult> {
  return apiFetch<PredictionResult>("/predict", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function healthCheck(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
}
