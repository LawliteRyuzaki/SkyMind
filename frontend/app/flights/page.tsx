'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import NavBar from '@/components/layout/NavBar'
import { searchFlights, formatDuration, getAirlineLogo } from '@/lib/api'
import type { FlightOffer } from '@/lib/api'
import { format, addDays } from 'date-fns'

// Inline airline logo with fallback
function AirlineLogo({ code, name }: { code: string; name: string }) {
  const [imgError, setImgError] = useState(false)
  const logoUrl = `https://content.airhex.com/content/logos/airlines_${code}_200_200_s.png`

  if (imgError) {
    return (
      <div className="airline-logo-box" style={{ background: '#131210', color: '#fff' }}>
        {code}
      </div>
    )
  }

  return (
    <div className="airline-logo-box" style={{ overflow: 'hidden', padding: 0, background: '#f8f8f8' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
        onError={() => setImgError(true)}
      />
    </div>
  )
}

function FlightsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const defaultDate = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    origin: params.get('origin') || 'DEL',
    destination: params.get('destination') || 'BOM',
    departure_date: params.get('departure_date') || defaultDate,
    adults: params.get('adults') || '1',
    cabin_class: params.get('cabin_class') || 'ECONOMY',
  })

  const [flights, setFlights] = useState<FlightOffer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sort, setSort] = useState('Price')
  const [searched, setSearched] = useState(false)

  const doSearch = async (currentForm = form, currentSort = sort) => {
    if (!currentForm.origin || !currentForm.destination) {
      setError('Please enter origin and destination.')
      return
    }
    if (currentForm.origin.toUpperCase() === currentForm.destination.toUpperCase()) {
      setError('Origin and destination cannot be the same.')
      return
    }
    setLoading(true); setError(''); setSearched(true)
    try {
      const res = await searchFlights({
        origin: currentForm.origin,
        destination: currentForm.destination,
        departure_date: currentForm.departure_date,
        adults: Number(currentForm.adults),
        cabin_class: currentForm.cabin_class,
      })
      let sorted = [...(res.flights || [])]
      if (currentSort === 'Price') sorted.sort((a, b) => a.price.total - b.price.total)
      if (currentSort === 'Duration') sorted.sort((a, b) => (a.itineraries[0]?.duration || '').localeCompare(b.itineraries[0]?.duration || ''))
      if (currentSort === 'Departure') sorted.sort((a, b) =>
        (a.itineraries[0]?.segments[0]?.departure_time || '').localeCompare(b.itineraries[0]?.segments[0]?.departure_time || ''))
      setFlights(sorted)
    } catch (e: any) {
      const msg = e.message || ''
      if (msg.includes('fetch') || msg.includes('network') || msg.toLowerCase().includes('failed to fetch') || msg.includes('connect')) {
        setError('Cannot connect to backend. Make sure the API server is running at ' + (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'))
      } else {
        setError(msg || 'Search failed. Try DEL→BOM with a date at least 7 days ahead.')
      }
      setFlights([])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (params.get('origin')) doSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSort = (s: string) => {
    setSort(s)
    const sorted = [...flights]
    if (s === 'Price') sorted.sort((a, b) => a.price.total - b.price.total)
    if (s === 'Duration') sorted.sort((a, b) => (a.itineraries[0]?.duration || '').localeCompare(b.itineraries[0]?.duration || ''))
    if (s === 'Departure') sorted.sort((a, b) =>
      (a.itineraries[0]?.segments[0]?.departure_time || '').localeCompare(b.itineraries[0]?.segments[0]?.departure_time || ''))
    setFlights(sorted)
  }

  const recBadge = (rec?: string) => {
    if (rec === 'BOOK_NOW') return { cls: 'badge-red', label: 'BOOK NOW' }
    if (rec === 'BOOK_SOON') return { cls: 'badge-black', label: 'BOOK SOON' }
    if (rec === 'WAIT') return { cls: 'badge-off', label: 'WAIT' }
    if (rec === 'LAST_MINUTE') return { cls: 'badge-off', label: 'LAST MIN' }
    return null
  }

  return (
    <div>
      <NavBar />
      <div style={{ paddingTop: '60px' }}>

        {/* Search strip */}
        <div className="search-strip">
          <div className="wrap">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label className="field-label">From (city or IATA)</label>
                <input className="inp" value={form.origin}
                  onChange={e => setForm(f => ({ ...f, origin: e.target.value.toUpperCase() }))}
                  placeholder="DEL or Delhi"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label className="field-label">To (city or IATA)</label>
                <input className="inp" value={form.destination}
                  onChange={e => setForm(f => ({ ...f, destination: e.target.value.toUpperCase() }))}
                  placeholder="BOM or Mumbai"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
              <div>
                <label className="field-label">Date</label>
                <input type="date" className="inp" value={form.departure_date} min={tomorrow}
                  onChange={e => setForm(f => ({ ...f, departure_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Passengers</label>
                <select className="inp" value={form.adults} onChange={e => setForm(f => ({ ...f, adults: e.target.value }))}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'Adult' : 'Adults'}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Class</label>
                <select className="inp" value={form.cabin_class} onChange={e => setForm(f => ({ ...f, cabin_class: e.target.value }))}>
                  <option value="ECONOMY">Economy</option>
                  <option value="BUSINESS">Business</option>
                  <option value="FIRST">First</option>
                </select>
              </div>
              <button className="btn btn-red-full" onClick={() => doSearch()} disabled={loading}>
                {loading ? '...' : 'Search'}
              </button>
            </div>
          </div>
        </div>

        <div className="wrap" style={{ paddingTop: '24px', paddingBottom: '60px' }}>
          {/* Results bar */}
          <div className="results-bar">
            <div>
              <div className="results-title">
                <span style={{ fontFamily: 'var(--fm)', fontWeight: 700 }}>{form.origin}</span>
                <span style={{ color: 'var(--grey3)', fontFamily: 'var(--fm)' }}> — </span>
                <span style={{ fontFamily: 'var(--fm)', fontWeight: 700 }}>{form.destination}</span>
                <span className="badge badge-black" style={{ marginLeft: '8px', fontSize: '.6rem' }}>{form.departure_date}</span>
              </div>
              <div className="results-count">
                {loading ? 'Searching live fares from Amadeus...'
                  : searched ? `${flights.length} flight${flights.length !== 1 ? 's' : ''} found · AI-scored`
                    : 'Enter your route and search'}
              </div>
            </div>
            <div className="sort-strip">
              {['Price', 'Duration', 'Departure'].map(s => (
                <button key={s} className={`sort-btn${sort === s ? ' active' : ''}`} onClick={() => handleSort(s)}>{s}</button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ border: '1px solid var(--red)', padding: '20px 24px', background: 'rgba(232,25,26,.04)', marginBottom: '16px', borderLeft: '4px solid var(--red)' }}>
              <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: '6px', fontFamily: 'var(--fd)', fontSize: '1.1rem', letterSpacing: '.04em' }}>SEARCH FAILED</div>
              <div style={{ fontSize: '.875rem', color: 'var(--grey4)', marginBottom: '8px' }}>{error}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--grey3)', marginBottom: '12px' }}>
                💡 Try popular routes: DEL→BOM, BOM→BLR, DEL→BLR with a date 7+ days ahead.
              </div>
              <button className="btn btn-primary" onClick={() => doSearch()} style={{ fontSize: '.78rem', padding: '8px 16px' }}>
                Try again
              </button>
            </div>
          )}

          {/* Loading skeletons */}
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flight-card" style={{ overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 140px' }}>
                <div style={{ padding: '20px', borderRight: '1px solid var(--grey1)' }}>
                  <div className="skel" style={{ height: '42px', width: '42px', marginBottom: '10px', borderRadius: '4px' }} />
                  <div className="skel" style={{ height: '12px', width: '80%', marginBottom: '6px' }} />
                  <div className="skel" style={{ height: '10px', width: '60%' }} />
                </div>
                <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div className="skel" style={{ height: '28px', width: '70px' }} />
                  <div className="skel" style={{ height: '1px', flex: 1 }} />
                  <div className="skel" style={{ height: '28px', width: '70px' }} />
                </div>
                <div style={{ padding: '20px', borderLeft: '1px solid var(--grey1)' }}>
                  <div className="skel" style={{ height: '28px', width: '90%', marginBottom: '8px' }} />
                  <div className="skel" style={{ height: '32px', width: '100%' }} />
                </div>
              </div>
              <div className="skel" style={{ height: '36px' }} />
            </div>
          ))}

          {/* No results */}
          {!loading && searched && flights.length === 0 && !error && (
            <div style={{ border: '1px solid var(--grey1)', padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--fd)', fontSize: '2rem', color: 'var(--black)', marginBottom: '8px', letterSpacing: '.04em' }}>NO FLIGHTS FOUND</div>
              <div style={{ fontSize: '.875rem', color: 'var(--grey4)', marginBottom: '4px' }}>
                Amadeus sandbox API has limited coverage.
              </div>
              <div style={{ fontSize: '.82rem', color: 'var(--grey3)', marginBottom: '20px', fontFamily: 'var(--fm)' }}>
                Try DEL→BOM, BOM→BLR, or DEL→BLR with a date 7+ days away.
              </div>
              <button className="btn btn-primary" onClick={() => doSearch()}>Search again</button>
            </div>
          )}

          {/* Flight cards */}
          {flights.map((f, i) => {
            const itin = f.itineraries[0]
            const seg = itin?.segments[0]
            const lastSeg = itin?.segments[itin.segments.length - 1]
            const stops = (itin?.segments.length || 1) - 1

            const dep = seg?.departure_time
              ? new Date(seg.departure_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
              : '--:--'
            const arr = lastSeg?.arrival_time
              ? new Date(lastSeg.arrival_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
              : '--:--'
            const dur = formatDuration(itin?.duration || '')
            const rec = recBadge(f.ai_insight?.recommendation)
            const isFirst = i === 0

            // Use primary airline info (FIXED — no longer just Air India)
            const airlineCode = f.primary_airline || seg?.airline_code || 'AI'
            const airlineName = f.primary_airline_name || seg?.airline_name || airlineCode

            return (
              <div
                key={f.id}
                className="flight-card"
                style={{ borderColor: isFirst ? 'var(--black)' : undefined, animation: `fadeUp .35s ${Math.min(i * .05, .3)}s ease both` }}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('selected_flight', JSON.stringify(f))
                    sessionStorage.setItem('search_params', JSON.stringify(form))
                  }
                  router.push('/booking')
                }}
              >
                {isFirst && <div className="best-tag">Best value</div>}
                <div className="flight-top" style={{ borderTop: isFirst ? '2px solid var(--red)' : undefined }}>

                  {/* Airline — with LOGO */}
                  <div className="flight-airline">
                    <AirlineLogo code={airlineCode} name={airlineName} />
                    <div style={{ minWidth: 0 }}>
                      <div className="airline-name-txt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {airlineName}
                      </div>
                      <div className="airline-num-txt">{seg?.flight_number || '--'}</div>
                      {stops > 0 && (
                        <div style={{ fontSize: '.65rem', color: 'var(--grey3)', fontFamily: 'var(--fm)', marginTop: '2px' }}>
                          via {itin?.segments.slice(0, -1).map(s => s.destination).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="flight-timeline">
                    <div style={{ flexShrink: 0 }}>
                      <div className="t-time">{dep}</div>
                      <div className="t-iata">{seg?.origin || form.origin}</div>
                      {seg?.terminal_departure && (
                        <div style={{ fontSize: '.62rem', color: 'var(--grey3)', fontFamily: 'var(--fm)' }}>T{seg.terminal_departure}</div>
                      )}
                    </div>
                    <div className="t-mid">
                      <div className="t-dur">{dur}</div>
                      <div style={{ height: '1px', width: '100%', background: 'var(--grey2)', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', padding: '0 4px', color: 'var(--red)' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5S18 2 16.5 3.5L13 7 4.8 6.2c-.5-.1-.9.1-1.1.5L2 8.9c-.2.4-.1.9.2 1.2l4.6 4.1-1.5 6.4 2.8 2.8 5.3-3.2 4.1 4.6c.3.4.8.5 1.2.2l1.1-1.2c.4-.2.6-.6.5-1.1z" />
                          </svg>
                        </div>
                      </div>
                      <div className={`t-stop ${stops === 0 ? 'direct' : 'one-stop'}`}>
                        {stops === 0 ? 'Non-stop' : `${stops} stop${stops > 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div className="t-time">{arr}</div>
                      <div className="t-iata">{lastSeg?.destination || form.destination}</div>
                      {lastSeg?.terminal_arrival && (
                        <div style={{ fontSize: '.62rem', color: 'var(--grey3)', fontFamily: 'var(--fm)' }}>T{lastSeg.terminal_arrival}</div>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="flight-price-col">
                    <div>
                      <div className="f-price">₹{Math.round(f.price.total).toLocaleString('en-IN')}</div>
                      <div className="f-price-per">per person</div>
                      {f.seats_available && f.seats_available < 5 && (
                        <div className="f-seats">{f.seats_available} left!</div>
                      )}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '.75rem', padding: '8px 14px' }}
                      onClick={e => {
                        e.stopPropagation()
                        if (typeof window !== 'undefined') {
                          sessionStorage.setItem('selected_flight', JSON.stringify(f))
                          sessionStorage.setItem('search_params', JSON.stringify(form))
                        }
                        router.push('/booking')
                      }}
                    >
                      Select →
                    </button>
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="flight-bottom">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {rec && <span className={`badge ${rec.cls}`}>{rec.label}</span>}
                    {f.ai_insight?.reason && (
                      <span style={{ fontSize: '.75rem', color: 'var(--grey4)', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.ai_insight.reason}
                      </span>
                    )}
                    <Link
                      href={`/predict?origin=${form.origin}&destination=${form.destination}`}
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '.75rem', color: 'var(--red)', textDecoration: 'underline', textUnderlineOffset: '2px', whiteSpace: 'nowrap' }}
                    >
                      30-day forecast →
                    </Link>
                  </div>
                  <span style={{ fontSize: '.7rem', color: 'var(--grey3)', fontFamily: 'var(--fm)', whiteSpace: 'nowrap' }}>
                    {form.cabin_class === 'ECONOMY' ? 'Economy' : form.cabin_class} · {f.instant_ticketing ? '⚡ Instant' : 'GDS'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function FlightsPage() {
  return (
    <Suspense fallback={
      <div style={{ paddingTop: '120px', textAlign: 'center', color: 'var(--grey3)', fontFamily: 'var(--fm)', fontSize: '.85rem' }}>
        Loading...
      </div>
    }>
      <FlightsContent />
    </Suspense>
  )
}
