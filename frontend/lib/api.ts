// lib/api.ts  (FIXED)
// =====================================================================
// Fixes:
//   1. Typed request/response interfaces match backend schema exactly
//   2. Proper error propagation (throws ApiError with message)
//   3. Base URL from env variable with fallback
//   4. No hardcoded values — all data comes from the API
//   5. Alert types added
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

export interface AlertRecord {
  id: string;
  origin: string;
  destination: string;
  target_price: number;
  departure_date?: string;
  user_label?: string;
  created_at: string;
  triggered: boolean;
  current_price?: number;
  savings?: number;
  trend?: Trend;
  recommendation?: Recommendation;
}

export interface SetAlertRequest {
  origin: string;
  destination: string;
  target_price: number;
  departure_date?: string;
  user_label?: string;
}

export interface CheckAlertsResponse {
  alerts: AlertRecord[];
  triggered: AlertRecord[];
  triggered_count: number;
}

export interface FlightOffer {
  id: string;
  source: string;
  price: {
    total: number;
    base: number;
    currency: string;
    fees?: any[];
    grand_total: number;
  };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      flight_number: string;
      airline_code: string;
      airline_name: string;
      aircraft: string;
      origin: string;
      destination: string;
      departure_time: string;
      arrival_time: string;
      duration: string;
      cabin: string;
      stops: number;
    }>;
  }>;
  validating_airlines: string[];
  traveler_pricings: any[];
  last_ticketing_date?: string;
  seats_available?: number;
  ai_insight?: {
    recommendation: string;
    reason: string;
    probability_increase: number;
    trend: string;
  };
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
      // response body not JSON — keep default message
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

export async function setAlert(
  req: SetAlertRequest,
): Promise<{ success: boolean; alert_id: string; message: string }> {
  return apiFetch("/set-alert", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function checkAlerts(): Promise<CheckAlertsResponse> {
  return apiFetch<CheckAlertsResponse>("/check-alerts");
}

export async function deleteAlert(
  alertId: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/alerts/${alertId}`, { method: "DELETE" });
}

export async function healthCheck(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
}

// ---------------------------------------------------------------------------
// Flight search
// ---------------------------------------------------------------------------
export interface FlightSearchParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  adults?: number;
  cabin_class?: string;
  currency?: string;
  max_results?: number;
}

export async function searchFlights(params: FlightSearchParams): Promise<{ flights: FlightOffer[]; count: number; search_params: any }> {
  const query = new URLSearchParams();
  query.set("origin", params.origin);
  query.set("destination", params.destination);
  query.set("departure_date", params.departure_date);
  if (params.return_date) query.set("return_date", params.return_date);
  if (params.adults) query.set("adults", String(params.adults));
  if (params.cabin_class) query.set("cabin_class", params.cabin_class);
  if (params.currency) query.set("currency", params.currency);
  if (params.max_results) query.set("max_results", String(params.max_results));

  return apiFetch(`/flights/search?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
export interface CreateBookingParams {
  flight_offer_id: string;
  flight_data: FlightOffer;
  passengers: Array<{
    type: string;
    first_name: string;
    last_name: string;
    date_of_birth?: string;
    passport_number?: string;
    meal_preference?: string;
    baggage_allowance?: number;
  }>;
  contact_email: string;
  contact_phone: string;
  cabin_class?: string;
  currency?: string;
}

export async function createBooking(params: CreateBookingParams): Promise<any> {
  return apiFetch("/booking/create", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------
export interface CreateOrderParams {
  amount: number;
  booking_id: string;
  booking_reference: string;
}

export async function createRazorpayOrder(params: CreateOrderParams): Promise<any> {
  return apiFetch("/payment/create-order", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface VerifyPaymentParams {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  booking_id: string;
}

export async function verifyPayment(params: VerifyPaymentParams): Promise<any> {
  return apiFetch("/payment/verify", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export function formatDuration(iso: string): string {
  if (!iso) return "";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  return h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}`.trim() : `${m}m`;
}
