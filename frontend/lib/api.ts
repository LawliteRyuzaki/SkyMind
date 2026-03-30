// lib/api.ts — FULLY FIXED
// =====================================================================
// All exports present, typed correctly, deleteAlert exported
// City name support passed through to backend
// =====================================================================

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window === "undefined" ? "http://localhost:8000" : "http://localhost:8000");

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
  probability_increase: number;
  confidence: number;
  recommendation: Recommendation;
  reason: string;
  expected_change_percent: number;
}

export interface PredictRequest {
  origin: string;
  destination: string;
  departure_date?: string;
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
  user_id?: string;
  notify_email?: string;
  notify_phone?: string;
}

export interface CheckAlertsResponse {
  alerts: AlertRecord[];
  triggered: AlertRecord[];
  triggered_count: number;
}

export interface FlightSegment {
  flight_number: string;
  airline_code: string;
  airline_name: string;
  airline_logo: string;
  airline_logo_rect: string;
  aircraft: string;
  origin: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  duration: string;
  cabin: string;
  stops: number;
  terminal_departure?: string;
  terminal_arrival?: string;
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

export interface AiInsight {
  recommendation: string;
  reason: string;
  probability_increase: number;
  trend: string;
  predicted_price?: number;
}

export interface FlightOffer {
  id: string;
  source: string;
  price: FlightPrice;
  itineraries: FlightItinerary[];
  validating_airlines: string[];
  primary_airline: string;
  primary_airline_name: string;
  primary_airline_logo: string;
  traveler_pricings: unknown[];
  last_ticketing_date?: string;
  seats_available?: number;
  instant_ticketing?: boolean;
  ai_insight?: AiInsight;
}

export interface FlightSearchResponse {
  flights: FlightOffer[];
  count: number;
  origin_iata: string;
  destination_iata: string;
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

export interface AirportResult {
  iata: string;
  city: string;
  name: string;
  country: string;
  state?: string;
  logo_url?: string;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
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
// Airport search — searches backend which supports city names
// ---------------------------------------------------------------------------
export async function searchAirportsAPI(q: string): Promise<AirportResult[]> {
  try {
    const data = await apiFetch<{ airports: AirportResult[] }>(
      `/flights/airports?q=${encodeURIComponent(q)}`
    );
    return data.airports ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// City → IATA (client-side fallback map)
// ---------------------------------------------------------------------------
const CITY_TO_IATA: Record<string, string> = {
  "delhi": "DEL", "new delhi": "DEL",
  "mumbai": "BOM", "bombay": "BOM",
  "bangalore": "BLR", "bengaluru": "BLR",
  "hyderabad": "HYD",
  "chennai": "MAA", "madras": "MAA",
  "kolkata": "CCU", "calcutta": "CCU",
  "kochi": "COK", "cochin": "COK",
  "goa": "GOI",
  "ahmedabad": "AMD",
  "jaipur": "JAI",
  "lucknow": "LKO",
  "pune": "PNQ",
  "amritsar": "ATQ",
  "guwahati": "GAU",
  "varanasi": "VNS",
  "patna": "PAT",
  "dubai": "DXB",
  "london": "LHR",
  "singapore": "SIN",
  "doha": "DOH",
  "bangkok": "BKK",
};

export function resolveCityToIATA(input: string): string {
  const lower = input.trim().toLowerCase();
  return CITY_TO_IATA[lower] ?? input.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Prediction API
// ---------------------------------------------------------------------------
export async function predictPrice(req: PredictRequest): Promise<PredictionResult> {
  return apiFetch<PredictionResult>("/predict", {
    method: "POST",
    body: JSON.stringify({
      ...req,
      origin: resolveCityToIATA(req.origin),
      destination: resolveCityToIATA(req.destination),
    }),
  });
}

// ---------------------------------------------------------------------------
// Alert API — all three functions exported
// ---------------------------------------------------------------------------
export async function setAlert(
  req: SetAlertRequest
): Promise<{ success: boolean; alert_id: string; message: string }> {
  return apiFetch("/set-alert", {
    method: "POST",
    body: JSON.stringify({
      ...req,
      origin: resolveCityToIATA(req.origin),
      destination: resolveCityToIATA(req.destination),
    }),
  });
}

export async function checkAlerts(userId?: string): Promise<CheckAlertsResponse> {
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return apiFetch<CheckAlertsResponse>(`/check-alerts${qs}`);
}

// FIXED: deleteAlert was missing — now exported correctly
export async function deleteAlert(
  alertId: string
): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/alerts/${alertId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Flight search — passes city names, backend resolves to IATA
// ---------------------------------------------------------------------------
export async function searchFlights(
  params: FlightSearchParams
): Promise<FlightSearchResponse> {
  const qs = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    departure_date: params.departure_date,
    adults: String(params.adults ?? 1),
    cabin_class: params.cabin_class ?? "ECONOMY",
    currency: params.currency ?? "INR",
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

export function getAirlineLogo(iataCode: string): string {
  return `https://content.airhex.com/content/logos/airlines_${iataCode.toUpperCase()}_200_200_s.png`;
}

export function getAirlineLogoRect(iataCode: string): string {
  return `https://content.airhex.com/content/logos/airlines_${iataCode.toUpperCase()}_100_25_r.png`;
}
