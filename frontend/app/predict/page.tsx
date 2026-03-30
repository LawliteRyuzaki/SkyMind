'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import NavBar from '@/components/layout/NavBar'
import { format, addDays } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────
interface ForecastDay {
  date:             string
  price:            number
  confidence_low:   number
  confidence_high:  number
  recommendation:   string
}
interface Analysis {
  predicted_price:          number
  forecast:                 ForecastDay[]
  trend:                    string
  price_trend:              string
  probability_increase:     number
  confidence:               number
  recommendation:           string
  reason:                   string
  expected_change_percent:  number
  best_day:                 ForecastDay
  worst_day:                ForecastDay
}
interface Alert {
  id:           string
  origin:       string
  destination:  string
  target_price: number
  label:        string
  triggered?:   boolean
  current_price?: number
  recommendation?: string
  reason?:      string
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Price chart (SVG) ──────────────────────────────────────────────────
function PriceChart({ forecast, origin, destination }: {
  forecast: ForecastDay[]; origin: string; destination: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !forecast.length) return
    const W=680,H=220,pl=56,pr=20,pt=20,pb=36
    const prices = forecast.map(d=>d.price)
    const lo     = forecast.map(d=>d.confidence_low)
    const hi     = forecast.map(d=>d.confidence_high)
    const n=prices.length, cw=W-pl-pr, ch=H-pt-pb
    const mn=Math.min(...lo)*0.95, mx=Math.max(...hi)*1.05
    const sx=(i:number)=>pl+(i/(n-1))*cw
    const sy=(v:number)=>pt+ch-((v-mn)/(mx-mn))*ch
    const lp=prices.map((p,i)=>`${i?'L':'M'}${sx(i).toFixed(1)},${sy(p).toFixed(1)}`).join('')
    const lo2=lo.map((p,i)=>`${i?'L':'M'}${sx(i).toFixed(1)},${sy(p).toFixed(1)}`).join('')
    const hi2=hi.map((p,i)=>`${i?'L':'M'}${sx(i).toFixed(1)},${sy(p).toFixed(1)}`).join('')
    const band=hi.map((p,i)=>`${i?'L':'M'}${sx(i).toFixed(1)},${sy(p).toFixed(1)}`).join('')
          +lo.slice().reverse().map((p,i)=>`L${sx(n-1-i).toFixed(1)},${sy(p).toFixed(1)}`).join('')+'Z'
    const area=lp+`L${sx(n-1).toFixed(1)},${(pt+ch).toFixed(1)}L${pl.toFixed(1)},${(pt+ch).toFixed(1)}Z`
    const bestIdx=prices.indexOf(Math.min(...prices))
    // Grid
    const steps=5
    const gl=Array.from({length:steps},(_,k)=>{
      const v=mn+(mx-mn)*k/(steps-1); const y=sy(v)
      return `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W-pr}" y2="${y.toFixed(1)}" stroke="#efefed" stroke-width="1"/>
              <text x="${pl-8}" y="${(y+4).toFixed(1)}" text-anchor="end" fill="#9b9890" font-size="9.5" font-family="Martian Mono,monospace">₹${(v/1000).toFixed(0)}k</text>`
    }).join('')
    const step=Math.floor(n/4)
    const dl=[0,step,step*2,step*3,n-1].map(i=>
      `<text x="${sx(i).toFixed(1)}" y="${H-6}" text-anchor="middle" fill="#9b9890" font-size="9" font-family="Martian Mono,monospace">${forecast[i]?.date?.slice(5)||''}</text>`
    ).join('')
    const bpx=sy(prices[bestIdx]), bx=sx(bestIdx)
    const bLabel=`₹${(prices[bestIdx]/1000).toFixed(1)}k`
    const rectX=Math.min(Math.max(bx-22, pl), W-pr-44)
    ref.current.innerHTML=`${gl}${dl}
      <path d="${band}" fill="rgba(232,25,26,.05)"/>
      <path d="${lo2}" stroke="#fcc" stroke-width="1" fill="none" stroke-dasharray="4,4"/>
      <path d="${hi2}" stroke="#fcc" stroke-width="1" fill="none" stroke-dasharray="4,4"/>
      <path d="${area}" fill="rgba(232,25,26,.04)"/>
      <path d="${lp}" stroke="#131210" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="${bx}" y1="${pt}" x2="${bx}" y2="${pt+ch}" stroke="rgba(22,163,74,.25)" stroke-width="1" stroke-dasharray="4,3"/>
      <circle cx="${bx}" cy="${bpx}" r="7" fill="#22c55e" stroke="white" stroke-width="2.5"/>
      <rect x="${rectX}" y="${(bpx-30).toFixed(0)}" width="44" height="19" fill="#131210" rx="2"/>
      <text x="${bx}" y="${(bpx-16).toFixed(0)}" text-anchor="middle" fill="white" font-size="8.5" font-family="Martian Mono,monospace" font-weight="700">${bLabel}</text>
      ${prices.map((p,i)=>`<circle cx="${sx(i).toFixed(1)}" cy="${sy(p).toFixed(1)}" r="${i===bestIdx?0:2.5}" fill="#131210" opacity=".4"/>`).join('')}`
  }, [forecast])
  return <svg ref={ref} width="100%" height="220" viewBox="0 0 680 220" preserveAspectRatio="xMidYMid meet"/>
}

// ── Alert notification banner ─────────────────────────────────────────
function AlertBanner({ alerts, onDismiss }: { alerts: Alert[]; onDismiss: (id:string)=>void }) {
  if (!alerts.length) return null
  return (
    <div style={{ position:'fixed', top:'68px', right:'16px', zIndex:300, display:'flex', flexDirection:'column', gap:'8px', maxWidth:'360px' }}>
      {alerts.map(a => (
        <div key={a.id} style={{ background:'#131210', border:'2px solid #e8191a', padding:'14px 16px', boxShadow:'0 8px 24px rgba(19,18,16,.3)', animation:'fadeUp .3s ease' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'10px' }}>
            <div>
              <div style={{ fontFamily:"'Martian Mono',monospace", fontSize:'.65rem', fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#e8191a', marginBottom:'6px' }}>
                🔥 AI Alert Triggered!
              </div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.3rem', letterSpacing:'.04em', color:'#fff', marginBottom:'4px' }}>
                {a.origin} → {a.destination}
              </div>
              <div style={{ fontSize:'.82rem', color:'rgba(255,255,255,.7)', marginBottom:'4px' }}>
                Price dropped to <strong style={{color:'#22c55e'}}>₹{Math.round(a.current_price||0).toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ fontSize:'.75rem', color:'rgba(255,255,255,.5)' }}>
                Recommendation: <strong style={{color:'#e8191a'}}>{(a.recommendation||'').replace(/_/g,' ')}</strong>
              </div>
            </div>
            <button onClick={()=>onDismiss(a.id)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:'1rem', flexShrink:0, padding:'2px' }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
function PredictContent() {
  const router  = useRouter()
  const params  = useSearchParams()

  const [origin,      setOrigin]      = useState(params.get('origin')      || 'DEL')
  const [destination, setDestination] = useState(params.get('destination') || 'DXB')
  const [analysis,    setAnalysis]    = useState<Analysis|null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  // Alert state
  const [alertTarget,    setAlertTarget]    = useState('')
  const [alertLabel,     setAlertLabel]     = useState('')
  const [alertSetting,   setAlertSetting]   = useState(false)
  const [alertSuccess,   setAlertSuccess]   = useState('')
  const [triggeredAlerts,setTriggeredAlerts]= useState<Alert[]>([])
  const [dismissedIds,   setDismissedIds]   = useState<Set<string>>(new Set())

  // ── Fetch analysis ──────────────────────────────────────────────────
  const load = useCallback(async (org=origin, dest=destination) => {
    const o = org.trim().toUpperCase()
    const d = dest.trim().toUpperCase()
    if (o.length!==3 || d.length!==3) {
      setError('Enter valid 3-letter IATA codes (e.g. DEL, BOM, DXB)')
      return
    }
    if (o === d) {
      setError('Origin and destination cannot be the same.')
      return
    }
    setLoading(true); setError(''); setAnalysis(null)
    try {
      const basePrice = analysis?.predicted_price || 8000
      const res = await fetch(`${API}/prediction/forecast?origin=${o}&destination=${d}&base_price=${basePrice}`)
      if (!res.ok) {
        const err = await res.json().catch(()=>({detail:'Server error'}))
        throw new Error(err.detail || `Error ${res.status}`)
      }
      const data: Analysis = await res.json()
      setAnalysis(data)
      // Pre-fill alert target with predicted price
      setAlertTarget(String(Math.round(data.predicted_price * 0.92)))
    } catch(e:any) {
      const msg = e.message || ''
      setError(msg.includes('fetch') || msg.includes('Failed')
        ? 'Cannot reach backend. Make sure Render is running.'
        : msg)
    }
    setLoading(false)
  }, [origin, destination, analysis])

  // Auto-load on mount
  useEffect(() => { load() }, [])

  // ── Poll alerts every 10 seconds ────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API}/prediction/check-alerts`)
        if (!res.ok) return
        const data = await res.json()
        const newTriggered = (data.triggered || []).filter((a:Alert) => !dismissedIds.has(a.id))
        if (newTriggered.length > 0) setTriggeredAlerts(newTriggered)
      } catch {}
    }
    const id = setInterval(poll, 10000)
    return () => clearInterval(id)
  }, [dismissedIds])

  const dismissAlert = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]))
    setTriggeredAlerts(prev => prev.filter(a => a.id !== id))
  }

  // ── Set alert ───────────────────────────────────────────────────────
  const setAlert = async () => {
    const target = parseFloat(alertTarget)
    if (!target || target <= 0) { setError('Enter a valid target price'); return }
    setAlertSetting(true)
    try {
      const res = await fetch(`${API}/prediction/set-alert`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          origin:       origin.toUpperCase(),
          destination:  destination.toUpperCase(),
          target_price: target,
          label:        alertLabel || `${origin.toUpperCase()}→${destination.toUpperCase()}`,
        }),
      })
      const data = await res.json()
      setAlertSuccess(data.message || 'Alert set successfully!')
      setTimeout(() => setAlertSuccess(''), 4000)
    } catch {
      setError('Failed to set alert. Is the backend running?')
    }
    setAlertSetting(false)
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  const fmtRec = (r?:string) => (r||'').replace(/_/g,' ')
  const recColor = (r?:string) => {
    if (r==='BOOK_NOW')    return '#e8191a'
    if (r==='BOOK_SOON')   return '#854d0e'
    if (r==='LAST_MINUTE') return '#e8191a'
    return 'var(--grey4)'
  }
  const trendIcon = (t?:string) => {
    if (!t) return ''
    if (t.includes('RISING')) return '↑'
    if (t.includes('FALLING'))return '↓'
    return '→'
  }

  return (
    <div>
      <NavBar />
      <AlertBanner alerts={triggeredAlerts} onDismiss={dismissAlert} />

      <div style={{ paddingTop:'60px' }}>
        {/* Hero */}
        <div className="predict-hero">
          <div className="wrap">
            <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'20px' }}>
              <span style={{ fontFamily:'var(--fm)', fontSize:'.65rem', fontWeight:500, letterSpacing:'.14em', textTransform:'uppercase', color:'rgba(255,255,255,.3)' }}>SkyMind AI</span>
              <div style={{ height:'1px', width:'32px', background:'rgba(255,255,255,.15)' }}/>
              <span className="badge badge-red">Prophet ML + Gradient Boost</span>
            </div>
            <div className="predict-title">PRICE<br/>FORECAST<em>& AI Prediction</em></div>
            <p style={{ color:'rgba(255,255,255,.5)', fontSize:'.9rem', marginTop:'16px', maxWidth:'480px', lineHeight:'1.7' }}>
              Data-driven 30-day price forecast. Real probability, real confidence — no guessing.
            </p>
          </div>
        </div>

        <div className="wrap">
          {/* Error */}
          {error && (
            <div style={{ border:'1px solid var(--red)', borderLeft:'4px solid var(--red)', padding:'12px 20px', margin:'20px 0', background:'rgba(232,25,26,.04)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px' }}>
              <span style={{ fontSize:'.875rem', color:'var(--grey4)' }}>{error}</span>
              <button onClick={()=>setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--grey3)', fontSize:'1rem' }}>✕</button>
            </div>
          )}

          {/* Alert success */}
          {alertSuccess && (
            <div style={{ border:'1px solid #bbf7d0', borderLeft:'4px solid #22c55e', padding:'12px 20px', margin:'12px 0 0', background:'#dcfce7', fontSize:'.875rem', color:'#166534' }}>
              ✓ {alertSuccess}
            </div>
          )}

          <div className="predict-grid">
            {/* ── Sidebar ── */}
            <div className="rec-panel">
              {/* Route input */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:'10px', alignItems:'end', marginBottom:'12px' }}>
                <div>
                  <label className="field-label">From</label>
                  <input className="inp" value={origin} maxLength={3} placeholder="DEL"
                    onChange={e=>setOrigin(e.target.value.toUpperCase().slice(0,3))}
                    style={{ fontFamily:'var(--fm)', fontWeight:700, textAlign:'center', fontSize:'1.1rem', letterSpacing:'.08em' }}
                  />
                </div>
                <div style={{ paddingBottom:'10px', color:'var(--grey3)', textAlign:'center', fontSize:'1.1rem' }}>→</div>
                <div>
                  <label className="field-label">To</label>
                  <input className="inp" value={destination} maxLength={3} placeholder="DXB"
                    onChange={e=>setDestination(e.target.value.toUpperCase().slice(0,3))}
                    style={{ fontFamily:'var(--fm)', fontWeight:700, textAlign:'center', fontSize:'1.1rem', letterSpacing:'.08em' }}
                  />
                </div>
              </div>

              <button className="btn btn-primary"
                style={{ width:'100%', justifyContent:'center', marginBottom:'16px', padding:'13px', opacity:loading?0.7:1 }}
                onClick={()=>load(origin,destination)} disabled={loading}
              >
                {loading ? (
                  <span style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <span style={{ width:'14px', height:'14px', border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }}/>
                    Analyzing fares with AI...
                  </span>
                ) : 'Get AI Prediction'}
              </button>

              {/* Recommendation card */}
              <div className="rec-card">
                <div className="rec-header">
                  <div className="rec-label">AI Recommendation</div>
                  <span className="badge badge-red" style={{ fontSize:'.55rem' }}>Live ML</span>
                </div>
                <div className="rec-body">
                  {loading ? (
                    <div style={{ padding:'12px 0' }}>
                      {[60,100,80,90,70].map((w,i)=>(
                        <div key={i} className="skel" style={{ height:'14px', width:`${w}%`, marginBottom:'10px', borderRadius:'2px' }}/>
                      ))}
                    </div>
                  ) : analysis ? (
                    <>
                      <div className="rec-rec" style={{ color:recColor(analysis.recommendation) }}>
                        {fmtRec(analysis.recommendation)}
                      </div>
                      <div className="rec-reason">{analysis.reason}</div>
                      {[
                        { label:'Predicted price',   val:`₹${Math.round(analysis.predicted_price).toLocaleString('en-IN')}` },
                        { label:'Rise probability',  val:`${Math.round(analysis.probability_increase*100)}%`, red:analysis.probability_increase>.6 },
                        { label:'Price trend',       val:`${trendIcon(analysis.trend)} ${(analysis.trend||'').replace(/_/g,' ')}`, red:(analysis.trend||'').includes('RISING') },
                        { label:'Expected change',   val:`${analysis.expected_change_percent>0?'+':''}${analysis.expected_change_percent}%`, red:analysis.expected_change_percent>0 },
                        { label:'AI confidence',     val:`${Math.round(analysis.confidence*100)}%` },
                      ].map(s=>(
                        <div key={s.label} className="rec-stat">
                          <span className="rec-stat-label">{s.label}</span>
                          <span className="rec-stat-val" style={{ color:s.red?'var(--red)':undefined }}>{s.val}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ padding:'24px 0', textAlign:'center', color:'var(--grey3)', fontSize:'.875rem', lineHeight:1.7 }}>
                      Enter a route and click<br/><strong style={{color:'var(--black)'}}>Get AI Prediction</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Set Price Alert ── */}
              {analysis && (
                <div style={{ border:'1px solid var(--grey1)', marginTop:'16px', background:'var(--white)' }}>
                  <div style={{ background:'var(--off)', padding:'12px 16px', borderBottom:'1px solid var(--grey1)', display:'flex', alignItems:'center', gap:'8px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                    <span style={{ fontWeight:700, fontSize:'.875rem', color:'var(--black)' }}>Set Price Alert</span>
                  </div>
                  <div style={{ padding:'16px' }}>
                    <div style={{ fontSize:'.78rem', color:'var(--grey4)', marginBottom:'12px', lineHeight:1.5 }}>
                      Get notified when {origin}→{destination} drops below your target. Checked every 10 seconds.
                    </div>
                    <div style={{ marginBottom:'10px' }}>
                      <label className="field-label">Target price (₹)</label>
                      <input className="inp" type="number" value={alertTarget} placeholder="e.g. 22000"
                        onChange={e=>setAlertTarget(e.target.value)}
                        style={{ fontFamily:'var(--fm)', fontWeight:600 }}
                      />
                    </div>
                    <div style={{ marginBottom:'12px' }}>
                      <label className="field-label">Label (optional)</label>
                      <input className="inp" value={alertLabel} placeholder="e.g. Dubai trip May"
                        onChange={e=>setAlertLabel(e.target.value)}
                      />
                    </div>
                    <button className="btn btn-red-full"
                      style={{ width:'100%', justifyContent:'center', padding:'11px', fontSize:'.82rem' }}
                      onClick={setAlert} disabled={alertSetting}
                    >
                      {alertSetting ? 'Setting...' : '+ Set Alert'}
                    </button>
                    <div style={{ fontSize:'.7rem', color:'var(--grey3)', marginTop:'8px', fontFamily:'var(--fm)', textAlign:'center' }}>
                      Current: ₹{Math.round(analysis.predicted_price).toLocaleString('en-IN')} · Target saves {Math.round(((analysis.predicted_price - parseFloat(alertTarget||'0')) / analysis.predicted_price)*100)}%
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Main area ── */}
            <div>
              {/* Stat trio */}
              <div className="stat-trio">
                {loading ? [0,1,2].map(i=>(
                  <div key={i} className="stat-trio-item">
                    <div className="skel" style={{ height:'11px', width:'55%', marginBottom:'10px', borderRadius:'2px' }}/>
                    <div className="skel" style={{ height:'24px', width:'40%', marginBottom:'6px', borderRadius:'2px' }}/>
                    <div className="skel" style={{ height:'10px', width:'50%', borderRadius:'2px' }}/>
                  </div>
                )) : analysis ? [
                  { label:'Best day to fly',  val:`₹${Math.round(analysis.best_day?.price||0).toLocaleString('en-IN')}`,  color:'#166534',   sub:analysis.best_day?.date||'' },
                  { label:'Most expensive',   val:`₹${Math.round(analysis.worst_day?.price||0).toLocaleString('en-IN')}`, color:'var(--red)', sub:analysis.worst_day?.date||'' },
                  { label:'Potential savings',val:`₹${Math.round((analysis.worst_day?.price||0)-(analysis.best_day?.price||0)).toLocaleString('en-IN')}`, color:'var(--black)', sub:'Best vs worst', subRed:true },
                ].map(s=>(
                  <div key={s.label} className="stat-trio-item">
                    <div className="sti-label">{s.label}</div>
                    <div className="sti-val" style={{ color:s.color }}>{s.val}</div>
                    <div className="sti-sub" style={{ color:(s as any).subRed?'var(--red)':undefined }}>{s.sub}</div>
                  </div>
                )) : [
                  { label:'Best day to fly', val:'--', sub:'Run prediction' },
                  { label:'Most expensive',  val:'--', sub:'Run prediction' },
                  { label:'Savings',         val:'--', sub:'Run prediction' },
                ].map(s=>(
                  <div key={s.label} className="stat-trio-item">
                    <div className="sti-label">{s.label}</div>
                    <div className="sti-val" style={{ color:'var(--grey2)' }}>{s.val}</div>
                    <div className="sti-sub">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="chart-area">
                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', flexWrap:'wrap', gap:'8px', marginBottom:'4px' }}>
                  <div className="chart-title">30-DAY PRICE FORECAST</div>
                  {analysis && (
                    <span style={{ fontFamily:'var(--fm)', fontSize:'.65rem', color:'var(--grey3)' }}>
                      Trend: {trendIcon(analysis.trend)} {(analysis.trend||'NEUTRAL').replace(/_/g,' ')} · Confidence: {Math.round(analysis.confidence*100)}%
                    </span>
                  )}
                </div>
                <div className="chart-sub">
                  {origin.toUpperCase()} → {destination.toUpperCase()} · Gradient Boost + deterministic forecast · CI ±1.5σ
                </div>
                {loading && <div className="skel" style={{ height:'220px', borderRadius:'2px' }}/>}
                {!loading && analysis?.forecast?.length && (
                  <PriceChart forecast={analysis.forecast} origin={origin} destination={destination} />
                )}
                {!loading && !analysis && (
                  <div style={{ height:'180px', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'10px' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--grey2)" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    <span style={{ fontSize:'.85rem', color:'var(--grey3)' }}>Run a prediction to see the 30-day chart</span>
                  </div>
                )}
              </div>

              {/* Hidden routes */}
              <div className="hidden-section">
                <div className="hidden-header">
                  <div>
                    <div style={{ fontWeight:700, fontSize:'.9rem', color:'var(--black)' }}>HIDDEN ROUTES</div>
                    <div style={{ fontSize:'.75rem', color:'var(--grey3)', marginTop:'2px', fontFamily:'var(--fm)' }}>
                      Dijkstra's algorithm — cheaper via-hub alternatives
                    </div>
                  </div>
                  {analysis && (
                    <button className="btn btn-outline" style={{ fontSize:'.72rem', padding:'6px 14px' }}
                      onClick={async()=>{
                        if (!analysis) return
                        try {
                          const res = await fetch(`${API}/prediction/hidden-routes?origin=${origin}&destination=${destination}&departure_date=${format(addDays(new Date(),30),'yyyy-MM-dd')}&direct_price=${analysis.predicted_price}`)
                          const data = await res.json()
                          if (data.hidden_routes?.length===0) alert('No cheaper routes found via common hubs.')
                        } catch {}
                      }}
                    >
                      Find routes
                    </button>
                  )}
                </div>
                <HiddenRoutesSection
                  origin={origin} destination={destination}
                  directPrice={analysis?.predicted_price}
                  loading={loading}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Hidden routes sub-component ───────────────────────────────────────
function HiddenRoutesSection({ origin, destination, directPrice, loading }: {
  origin:string; destination:string; directPrice?:number; loading:boolean
}) {
  const router = useRouter()
  const [routes,   setRoutes]   = useState<any[]>([])
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!directPrice || directPrice<=0 || loading) return
    setFetching(true)
    const dep = format(addDays(new Date(), 30), 'yyyy-MM-dd')
    fetch(`${API}/prediction/hidden-routes?origin=${origin}&destination=${destination}&departure_date=${dep}&direct_price=${directPrice}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d) setRoutes(d.hidden_routes||[]) })
      .catch(()=>{})
      .finally(()=>setFetching(false))
  }, [origin, destination, directPrice])

  if (loading || fetching) return <div className="skel" style={{ height:'60px', margin:'8px' }}/>
  if (!routes.length) return (
    <div style={{ padding:'24px', fontSize:'.85rem', color:'var(--grey3)', textAlign:'center' }}>
      {directPrice ? 'No cheaper via-hub routes found for this route.' : 'Run prediction to discover hidden routes.'}
    </div>
  )
  return (
    <>
      {routes.map((r,i)=>(
        <div key={i} className="hr-item"
          style={{ borderBottom:i<routes.length-1?'1px solid var(--grey1)':'none' }}
          onClick={()=>router.push(`/flights?origin=${origin}&destination=${destination}&departure_date=${format(addDays(new Date(),30),'yyyy-MM-dd')}`)}
        >
          <div style={{ minWidth:0 }}>
            <div className="hr-path">
              {(r.path||[origin,r.via||'HUB',destination]).map((p:string,j:number,arr:string[])=>[
                <span key={p}>{p}</span>,
                j<arr.length-1&&<span key={`a${j}`} style={{color:'var(--grey3)'}}>→</span>
              ])}
            </div>
            <div className="hr-via">1 stop · via {r.via||'hub'}</div>
          </div>
          <div style={{ flexShrink:0, textAlign:'right' }}>
            <div className="hr-price">₹{Math.round(r.total_price||0).toLocaleString('en-IN')}</div>
            <div className="hr-save">Save ₹{Math.round(r.savings_vs_direct||0).toLocaleString('en-IN')} ({(r.savings_percent||0).toFixed(1)}%)</div>
          </div>
        </div>
      ))}
    </>
  )
}

export default function PredictPage() {
  return (
    <Suspense fallback={<div style={{paddingTop:'120px',textAlign:'center',color:'var(--grey3)'}}>Loading...</div>}>
      <PredictContent />
    </Suspense>
  )
}
