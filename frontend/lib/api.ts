// lib/api.ts — FIXED & SYNCED WITH BACKEND ROUTERS
// =====================================================================
// Endpoint mapping corrected to match backend:
//   GET  /ai/price          → predictPrice
//   POST /alerts/subscribe  → setAlert
//   GET  /alerts/user/:id   → getUserAlerts
//   DEL  /alerts/:id        → deleteAlert
//   GET  /flights/search    → searchFlights
//   GET  /airports          → searchAirportsAPI (root endpoint)
//   POST /booking/create    → createBooking
//   POST /payment/create-order → createRazorpayOrder
//   POST /payment/verify    → verifyPayment
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
  // Fields expected by backend /alerts/subscribe
  email?: string;
  phone?: string;
  notify_sms?: boolean;
  notify_whatsapp?: boolean;
  cabin_class?: string;
  currency?: string;
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
  // Fields from backend enrichment
  ai_price?: number;
  recommendation?: string;
  trend?: string;
}

export interface FlightSearchResponse {
  flights: FlightOffer[];
  count: number;
  origin_iata: string;
  destination_iata: string;
  data_source?: string;
  search_params?: Record<string, unknown>;
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
  // Backend returns these field names from /airports
  label?: string;
  airport?: string;
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
// Airport search
// Backend exposes TWO airport endpoints:
//   GET /airports?q=...          (root, in main.py with fuzzy scoring)
//   GET /flights/airports?q=...  (in flights.py, static small list)
// We prefer /airports (root) as it queries the full Supabase airports table.
// ---------------------------------------------------------------------------
export async function searchAirportsAPI(q: string): Promise<AirportResult[]> {
  if (!q || q.length < 2) return [];
  try {
    // Root /airports returns: [{iata, label, city, airport, country}]
    const data = await apiFetch<Array<{
      iata: string;
      label: string;
      city: string;
      airport: string;
      country: string;
    }>>(`/airports?q=${encodeURIComponent(q)}`);

    // Normalize to AirportResult shape
    return (data || []).map((a) => ({
      iata: a.iata,
      city: a.city,
      name: a.airport,
      country: a.country,
      label: a.label,
      airport: a.airport,
    }));
  } catch {
    // Fallback to /flights/airports if root endpoint fails
    try {
      const data = await apiFetch<{ airports: AirportResult[] }>(
        `/flights/airports?q=${encodeURIComponent(q)}`
      );
      return data.airports ?? [];
    } catch {
      return [];
    }
  }
}

// Re-export alias used in some components
export const searchAirports = searchAirportsAPI;

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
  "bhubaneswar": "BBI",
  "ranchi": "IXR",
  "dubai": "DXB",
  "london": "LHR",
  "singapore": "SIN",
  "doha": "DOH",
  "bangkok": "BKK",
  "abu dhabi": "AUH",
  "kuala lumpur": "KUL",
};

export function resolveCityToIATA(input: string): string {
  if (!input) return "";
  const lower = input.trim().toLowerCase();
  return CITY_TO_IATA[lower] ?? input.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Prediction API
// Backend: GET /ai/price?origin=DEL&destination=BOM&departure_date=2026-05-01
// Returns: { status, data: { origin, destination, predicted_price, intelligence, meta } }
// We adapt the backend response into PredictionResult shape.
// ---------------------------------------------------------------------------
export async function predictPrice(req: PredictRequest): Promise<PredictionResult> {
  const origin = resolveCityToIATA(req.origin);
  const destination = resolveCityToIATA(req.destination);

  const params = new URLSearchParams({ origin, destination });
  if (req.departure_date) params.set("departure_date", req.departure_date);

  const raw = await apiFetch<{
    status: string;
    data: {
      origin: string;
      destination: string;
      predicted_price: number;
      intelligence: {
        confidence: string;       // e.g. "72%"
        recommendation: string;   // e.g. "BUY NOW 🔥 (Price Rising)"
        market_status: string;
        days_to_go: number;
      };
      meta: {
        peak_season: boolean;
        weekend: boolean;
        prediction_timestamp: string;
      };
    };
  }>(`/ai/price?${params}`);

  // Adapt to PredictionResult shape expected by the frontend
  const d = raw.data;
  const confidenceNum = parseFloat(d.intelligence.confidence) / 100; // "72%" → 0.72
  const rec = d.intelligence.recommendation.toUpperCase();
  const recommendation: Recommendation =
    rec.includes("BUY") ? "BOOK_NOW" :
    rec.includes("WAIT") ? "WAIT" : "MONITOR";

  const trend: Trend =
    rec.includes("RISING") || rec.includes("INCREASING") ? "RISING" :
    rec.includes("DROP") || rec.includes("DECREAS") ? "FALLING" : "STABLE";

  // Generate a simple 30-day synthetic forecast so PriceChart renders
  const basePrice = d.predicted_price;
  const direction = trend === "RISING" ? 1 : trend === "FALLING" ? -1 : 0;
  const today = new Date();
  const forecast: ForecastPoint[] = Array.from({ length: 30 }, (_, i) => {
    const dayOffset = direction * i * (basePrice * 0.003);
    const seasonal = Math.sin((i / 7) * Math.PI) * basePrice * 0.02;
    const price = Math.round(basePrice + dayOffset + seasonal);
    const variance = basePrice * 0.04;
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    return {
      day: i + 1,
      date: date.toISOString().split("T")[0],
      price,
      lower: Math.round(price - variance),
      upper: Math.round(price + variance),
    };
  });

  return {
    predicted_price: d.predicted_price,
    forecast,
    trend,
    probability_increase: trend === "RISING" ? confidenceNum : 1 - confidenceNum,
    confidence: confidenceNum,
    recommendation,
    reason: d.intelligence.recommendation,
    expected_change_percent: direction * confidenceNum * 10,
  };
}

// ---------------------------------------------------------------------------
// Alert API
// Backend router prefix: /alerts
//   POST /alerts/subscribe   → create alert
//   GET  /alerts/user/:id    → get user alerts
//   DELETE /alerts/:id       → delete alert
// ---------------------------------------------------------------------------
export async function setAlert(
  req: SetAlertRequest
): Promise<{ success: boolean; alert_id: string; message: string }> {
  const origin = resolveCityToIATA(req.origin);
  const destination = resolveCityToIATA(req.destination);

  // Backend AlertRequest model fields:
  // user_id, origin_code, destination_code, departure_date, target_price,
  // currency, cabin_class, email, phone, notify_email, notify_sms, notify_whatsapp
  const payload = {
    user_id: req.user_id || "anonymous",
    origin_code: origin,
    destination_code: destination,
    departure_date: req.departure_date || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    target_price: req.target_price,
    currency: req.currency || "INR",
    cabin_class: req.cabin_class || "ECONOMY",
    email: req.email || req.notify_email,
    phone: req.phone || req.notify_phone,
    notify_email: Boolean(req.email || req.notify_email),
    notify_sms: req.notify_sms ?? false,
    notify_whatsapp: req.notify_whatsapp ?? false,
  };

  const res = await apiFetch<{ success: boolean; alert_id: string; message: string }>(
    "/alerts/subscribe",
    { method: "POST", body: JSON.stringify(payload) }
  );
  return res;
}

export async function checkAlerts(userId?: string): Promise<CheckAlertsResponse> {
  // Backend: GET /alerts/user/{user_id}  → { alerts: [...], count: N }
  // If no userId provided, return empty (can't fetch without user context)
  if (!userId) {
    return { alerts: [], triggered: [], triggered_count: 0 };
  }

  const raw = await apiFetch<{ alerts: any[]; count: number }>(
    `/alerts/user/${encodeURIComponent(userId)}`
  );

  // Normalize backend alert shape to AlertRecord
  const alerts: AlertRecord[] = (raw.alerts || []).map((a) => ({
    id: a.id,
    origin: a.origin_code,
    destination: a.destination_code,
    target_price: a.target_price,
    departure_date: a.departure_date,
    created_at: a.created_at || new Date().toISOString(),
    triggered: a.status === "TRIGGERED" || (a.last_price && a.last_price <= a.target_price),
    current_price: a.last_price,
  }));

  const triggered = alerts.filter((a) => a.triggered);

  return {
    alerts,
    triggered,
    triggered_count: triggered.length,
  };
}

export async function deleteAlert(
  alertId: string
): Promise<{ success: boolean; message: string }> {
  // Backend: DELETE /alerts/{alert_id}  (soft-deletes by setting status=DELETED)
  return apiFetch(`/alerts/${alertId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Flight search
// Backend: GET /flights/search?origin=DEL&destination=BOM&departure_date=...
// Returns: { flights, count, origin_iata, destination_iata, data_source }
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
    ...(params.return_date ? { return_date: params.return_date } : {}),
  });
  return apiFetch<FlightSearchResponse>(`/flights/search?${qs}`);
}

// ---------------------------------------------------------------------------
// Booking
// Backend: POST /booking/create
// ---------------------------------------------------------------------------
export async function createBooking(req: CreateBookingRequest): Promise<unknown> {
  return apiFetch("/booking/create", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ---------------------------------------------------------------------------
// Payment
// Backend: POST /payment/create-order
//          POST /payment/verify
// ---------------------------------------------------------------------------
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
// Health check
// Backend: GET /health
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
