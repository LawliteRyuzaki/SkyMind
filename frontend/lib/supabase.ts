import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create client - will work with empty strings but queries will fail gracefully
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

// ── Types matching our DB schema ─────────────────────────────────
export interface Airport {
  iata_code: string
  name: string
  city: string
  state: string | null
  region: string
  country: string
  country_code: string
  latitude: number
  longitude: number
  is_domestic: boolean
  is_international: boolean
  is_active: boolean
  aai_category: string | null
}

export interface Airline {
  iata_code: string
  name: string
  short_name: string
  country: string
  is_domestic: boolean
  is_lowcost: boolean
  hub_airport: string | null
  is_active: boolean
}

export interface Route {
  id: string
  origin_code: string
  destination_code: string
  distance_km: number
  avg_duration_min: number
  airlines: string[]
  min_price_inr: number
  avg_price_inr: number
  max_price_inr: number
  flights_per_day: number
  is_popular: boolean
}

export interface Booking {
  id: string
  booking_reference: string
  pnr: string | null
  status: string
  payment_status: string
  total_price: number
  base_fare: number
  taxes: number
  discount_amount: number
  currency: string
  cabin_class: string
  num_passengers: number
  contact_email: string
  contact_phone: string
  confirmation_sent: boolean
  checkin_notif_sent: boolean
  created_at: string
  cancelled_at: string | null
  refund_amount: number | null
  refund_status: string | null
  flight_offer_data: any
  origin_code?: string
  destination_code?: string
}

export interface PriceAlert {
  id: string
  origin_code: string
  destination_code: string
  departure_date: string
  cabin_class: string
  target_price: number
  is_active: boolean
  notify_email: boolean
  notify_sms: boolean
  last_price: number | null
  lowest_seen: number | null
  triggered_count: number
  is_triggered?: boolean
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  display_name: string | null
  phone: string | null
  skymind_points: number
  tier: string
  total_bookings: number
  total_spent: number
  notify_email: boolean
  notify_sms: boolean
  notify_whatsapp: boolean
  preferred_cabin: string
  meal_preference: string
}

// ── Airport search (from DB) ─────────────────────────────────────
export async function searchAirportsFromDB(query: string): Promise<Airport[]> {
  if (!query || query.length < 2) return []
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) return []

  const q = query.toUpperCase().trim()
  try {
    const { data, error } = await supabase
      .from('airports')
      .select('*')
      .eq('is_active', true)
      .or(
        `iata_code.ilike.${q}%,city.ilike.%${query}%,name.ilike.%${query}%,state.ilike.%${query}%`
      )
      .order('is_international', { ascending: false })
      .limit(10)
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

// ── Route min price helper ─────────────────────────────────────────
export async function getRouteMinPrice(
  origin: string,
  destination: string
): Promise<number | null> {
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) return null
  try {
    const { data } = await supabase
      .from('routes')
      .select('min_price_inr')
      .eq('origin_code', origin)
      .eq('destination_code', destination)
      .single()
    return data?.min_price_inr ?? null
  } catch {
    return null
  }
}
