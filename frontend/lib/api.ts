// lib/api.ts (FIXED)
// =====================================================================
// Fixes:
//   1. Typed request/response interfaces match backend exactly
//   2. Proper error propagation (throws ApiError with message)
//   3. Alert API: setAlert, checkAlerts, deleteAlert
//   4. formatDuration helper exported
//   5. All flight search helpers retained
// =====================================================================

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window === "undefined"
    ? "http://localhost:8000"
    : "");

// ---------------------------------------------------------------------------
// Shared types
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
  departure_date?: string;
}

// Alert types
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

// Flight types
export interface FlightSegment {
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
}

export interface FlightItinerary {
  duration: string;
  segments: FlightSegment[];
}

export interface FlightPrice {
  total: number;
  base: number;
  currency: string;
  fees: unknown[];
  grand_total: number;
}

export interface FlightOffer {
  id: string;
  source: string;
  price: FlightPrice;
  itineraries: FlightItinerary[];
  validating_airlines: string[];
  traveler_pricings: unknown[];
  last_ticketing_date?: string;
  seats_available?: number;
  ai_insight?: {
    recommendation: string;
    reason: string;
    probability_increase: number;
    trend: string;
  };
}

export interface FlightSearchResponse {
  flights: FlightOffer[];
  count: number;
  search_params: Record<string, unknown>;
}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  adults?: number;
  cabin_class?: string;
  currency?: string;
}

// Booking types
export interface PassengerData {
  type: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  passport_number?: string;
  meal_preference?: string;
  baggage_allowance?: number;
}

export interface CreateBookingRequest {
  flight_offer_id: string;
  flight_data: FlightOffer;
  passengers: PassengerData[];
  contact_email: string;
  contact_phone: string;
  cabin_class?: string;
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
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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
      // non-JSON body
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Prediction API
// ---------------------------------------------------------------------------
export async function predictPrice(req: PredictRequest): Promise<PredictionResult> {
  return apiFetch<PredictionResult>("/predict", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ---------------------------------------------------------------------------
// Alert API
// ---------------------------------------------------------------------------
export async function setAlert(req: SetAlertRequest): Promise<{ success: boolean; alert_id: string; message: string }> {
  return apiFetch("/set-alert", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function checkAlerts(): Promise<CheckAlertsResponse> {
  return apiFetch<CheckAlertsResponse>("/check-alerts");
}

export async function deleteAlert(alertId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/alerts/${alertId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Flight search
// ---------------------------------------------------------------------------
export async function searchFlights(params: FlightSearchParams): Promise<FlightSearchResponse> {
  const qs = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    departure_date: params.departure_date,
    adults: String(params.adults ?? 1),
    cabin_class: params.cabin_class ?? "ECONOMY",
    ...(params.return_date ? { return_date: params.return_date } : {}),
  });
  return apiFetch<FlightSearchResponse>(`/flights/search?${qs}`);
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
export async function createBooking(req: CreateBookingRequest): Promise<unknown> {
  return apiFetch("/booking/create", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function createRazorpayOrder(params: {
  amount: number;
  booking_id: string;
  booking_reference: string;
}): Promise<unknown> {
  return apiFetch("/payment/create-order", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function verifyPayment(params: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  booking_id: string;
}): Promise<unknown> {
  return apiFetch("/payment/verify", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export async function healthCheck(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export function formatDuration(iso: string): string {
  if (!iso) return "--";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}h` : "";
  const m = match[2] ? `${match[2]}m` : "";
  return [h, m].filter(Boolean).join(" ") || iso;
}