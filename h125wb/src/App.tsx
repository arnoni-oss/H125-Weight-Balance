import { useState, useEffect, useRef } from 'react'
import './index.css'

// ─── DATA ─────────────────────────────────────────────────────────────────────

const HELICOPTERS = [
  { id: 'BMK', emptyWeight: 1605.6, longArm: 3.54, latArm:  0.007 },
  { id: 'BML', emptyWeight: 1609.5, longArm: 3.50, latArm: -0.010 },
  { id: 'BMM', emptyWeight: 1610.8, longArm: 3.52, latArm: -0.010 },
  { id: 'BMN', emptyWeight: 1613.1, longArm: 3.52, latArm: -0.010 },
]

const CONFIGS = [
  { id: '01', name: 'POLICE + 1',       seats: 1 },
  { id: '02', name: 'POLICE + 2',       seats: 2 },
  { id: '03', name: 'POLICE + 3',       seats: 3 },
  { id: '04', name: 'TRANSPORT + 3',    seats: 3 },
  { id: '05', name: 'TRANSPORT + 4',    seats: 4 },
  { id: '06', name: 'FIRE - NO SEATS',  seats: 0 },
  { id: '07', name: 'FIRE + 1',         seats: 1 },
  { id: '08', name: 'FIRE + 2',         seats: 2 },
  { id: '09', name: 'FIRE + 3',         seats: 3 },
  { id: '10', name: 'POLICE/FIRE + 1',  seats: 1 },
  { id: '11', name: 'POLICE/FIRE + 2',  seats: 2 },
  { id: '12', name: 'POLICE/FIRE + 3',  seats: 3 },
  { id: '13', name: 'CUSTOM',           seats: 4 },
]

const SEAT_ARMS: Record<string, [number, number][]> = {
  '01': [[2.54, -0.62]],
  '02': [[2.54, -0.62], [2.54,  0.62]],
  '03': [[2.54, -0.62], [2.54,  0.62], [2.54,  0.00]],
  '04': [[2.54, -0.62], [2.54,  0.62], [2.54,  0.00]],
  '05': [[2.54, -0.62], [2.54,  0.62], [2.54, -0.38], [2.54, 0.38]],
  '06': [],
  '07': [[2.54, -0.62]],
  '08': [[2.54, -0.62], [2.54,  0.62]],
  '09': [[2.54, -0.62], [2.54,  0.62], [2.54,  0.00]],
  '10': [[2.54, -0.62]],
  '11': [[2.54, -0.62], [2.54,  0.62]],
  '12': [[2.54, -0.62], [2.54,  0.62], [2.54,  0.00]],
  '13': [[2.54, -0.62], [2.54,  0.62], [2.54,  0.00], [2.54, 0.38]],
}

const FUEL_ARM   = 3.48
const CG_FWD     = 3.269
const CG_AFT     = 3.4358
const CG_VIS_MIN = 3.15
const CG_VIS_MAX = 3.55
const MIN_FUEL         = 40
const FUEL_BURN_RATE   = 2.8
const FUEL_LANDING_MIN = 60

// ── BAMBI ── יש לאמת את הנפח עם AFM ──
const BAMBI_CAPACITY_L   = 680   // ליטר = ק"ג מים
const BAMBI_EMPTY_WEIGHT = 40    // ק"ג — מיכל + ציוד ריק
const BAMBI_ARM          = 3.38  // מ'

// מגבלות משקל:
// ללא מטען על הוו  → משקל כולל מקסימום 2370
// עם מטען על הוו   → משקל פנימי מקסימום 2250, משקל כולל (כולל מטען) מקסימום 2800
const MTOW_NO_HOOK    = 2370
const MAX_INTERNAL    = 2250
const MTOW_WITH_HOOK  = 2800

// ─── מעטפות מרכז כובד ────────────────────────────────────────────────────────
// נקודות: [זרוע_אורכי_או_רוחבי, משקל]

const STD_LONG_ENV: [number, number][] = [
  [3.17, 1300], [3.17, 2000], [3.23, 2370],
  [3.408, 2370], [3.49, 1750], [3.49, 1300],
]
const STD_LAT_ENV: [number, number][] = [
  [-0.18, 1200], [-0.18, 2250], [-0.08, 2370],
  [0.08, 2370], [0.14, 2370], [0.14, 1300],
]
function getExtLongEnv(lim: number): [number, number][] {
  return [[3.17,1300],[3.17,2000],[3.26,lim],[3.438,lim],[3.49,1300]]
}
function getExtLatEnv(lim: number): [number, number][] {
  return [[-0.18,1200],[-0.18,2250],[-0.08,lim],[0.08,lim],[0.14,2370],[0.14,1300]]
}

const OGE_TABLE: Record<number, Record<number, number>> = {
  0:    { 10:2800,15:2800,20:2800,25:2785,30:2775,35:2765,40:2750 },
  500:  { 10:2800,15:2800,20:2790,25:2775,30:2765,35:2750,40:2740 },
  1000: { 10:2800,15:2800,20:2775,25:2765,30:2750,35:2725,40:2690 },
  1500: { 10:2790,15:2775,20:2760,25:2745,30:2735,35:2690,40:2640 },
  2000: { 10:2780,15:2760,20:2740,25:2730,30:2720,35:2660,40:2590 },
  2500: { 10:2760,15:2740,20:2730,25:2715,30:2680,35:2615,40:2530 },
  3000: { 10:2740,15:2725,20:2710,25:2675,30:2640,35:2560,40:2485 },
  3500: { 10:2725,15:2715,20:2700,25:2640,30:2580,35:2510,40:2430 },
  4000: { 10:2715,15:2680,20:2650,25:2585,30:2540,35:2460,40:2390 },
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function isInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersect = ((yi > py) !== (yj > py)) &&
      px < (xj - xi) * (py - yi) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function getOGE(alt: number, tmp: number) {
  const alts = [0,500,1000,1500,2000,2500,3000,3500,4000]
  const tmps = [10,15,20,25,30,35,40]
  const a = alts.reduce((a,b) => Math.abs(b-alt)<Math.abs(a-alt)?b:a)
  const t = tmps.reduce((a,b) => Math.abs(b-tmp)<Math.abs(a-tmp)?b:a)
  return OGE_TABLE[a][t]
}

type StationGroup = 'מסוק' | 'מערכות' | 'אנשים' | 'דלק' | 'אחר'
interface Station { name: string; weight: number; longArm: number; latArm: number; group: StationGroup }
interface CustomStation { name: string; weight: number; longArm: number }

function buildStations(s: AppState, fuelOverride?: number): Station[] {
  const heli = HELICOPTERS.find(h => h.id === s.helicopter)!
  const fuel = fuelOverride ?? s.fuel
  const st: Station[] = []

  const add = (name: string, weight: number, longArm: number, latArm: number, group: StationGroup) =>
    st.push({ name, weight, longArm, latArm, group })

  add(`מסוק ריק (${s.helicopter})`, heli.emptyWeight, heli.longArm, heli.latArm, 'מסוק')
  if (s.system === 'SHAPO')  add('מצלמה SHAPO',  18.0, 1.03, -0.53, 'מערכות')
  if (s.system === 'DSP-HD') add('מצלמה DSP-HD', 31.3, 1.03, -0.53, 'מערכות')
  if (s.xp)        add('פנס Nightsun XP', 33.0, 4.83, 0.00, 'מערכות')
  if (s.cargoHook) {
    add('וו חיצוני', 13.6, 3.38, 0.00, 'מערכות')
    add('מראות וו',   1.7, 0.28, 0.65, 'מערכות')
  }
  if (s.bambiFill > 0) {
    add('BAMBI (מיכל ריק)', BAMBI_EMPTY_WEIGHT, BAMBI_ARM, 0, 'מערכות')
    if (s.bambiMode === 'hook') {
      const bambiW = Math.round(BAMBI_CAPACITY_L * s.bambiFill / 100)
      if (bambiW > 0) add(`מים BAMBI ${s.bambiFill}%`, bambiW, BAMBI_ARM, 0, 'אחר')
    }
  }

  add('טייס ימין',  s.pilotR, 1.55,  0.35, 'אנשים')
  add('טייס שמאל', s.pilotL, 1.55, -0.35, 'אנשים')

  const arms = SEAT_ARMS[s.config] ?? []
  s.passengers.forEach((w, i) => {
    if (w > 0) {
      const [la, lat] = arms[i] ?? [2.54, 0]
      add(`נוסע ${i + 1}`, w, la, lat, 'אנשים')
    }
  })

  s.customStations.forEach(cs => {
    if (cs.weight > 0)
      add(cs.name || 'תחנה נוספת', cs.weight, cs.longArm, 0, 'אחר')
  })

  if (s.externalLoad > 0) add('משקל על הוו', s.externalLoad, 3.38, 0, 'אחר')
  if (fuel > 0)           add('דלק', fuel, FUEL_ARM, 0, 'דלק')

  return st
}

function calcCG(stations: Station[]) {
  const W = stations.reduce((s, st) => s + st.weight, 0)
  if (W === 0) return { weight: 0, longCG: 0, latCG: 0 }
  return {
    weight: W,
    longCG: stations.reduce((s, st) => s + st.weight * st.longArm, 0) / W,
    latCG:  stations.reduce((s, st) => s + st.weight * st.latArm,  0) / W,
  }
}

function equipWeight(system: string, xp: boolean, cargoHook: boolean, bambiFill: number) {
  let w = 0
  if (system === 'SHAPO')  w += 18
  if (system === 'DSP-HD') w += 31.3
  if (xp)          w += 33
  if (cargoHook)   w += 15.3
  if (bambiFill > 0) w += BAMBI_EMPTY_WEIGHT
  return w
}

// ─── STATE ────────────────────────────────────────────────────────────────────

interface AppState {
  helicopter: string; config: string; system: string
  xp: boolean; cargoHook: boolean; bambiFill: number; bambiMode: 'hook' | 'belly'
  pilotR: number; pilotL: number; passengers: number[]
  externalLoad: number; fuel: number
  altitude: number; temperature: number; ogeReserve80: boolean
  customStations: CustomStation[]
}

const DEF: AppState = {
  helicopter: 'BMK', config: '11', system: 'SHAPO',
  xp: true, cargoHook: true, bambiFill: 0, bambiMode: 'hook',
  pilotR: 80, pilotL: 80, passengers: [0, 0],
  externalLoad: 0, fuel: 400,
  altitude: 2000, temperature: 20, ogeReserve80: true,
  customStations: [],
}

interface Toast { id: number; msg: string; error: boolean }

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [s, setS] = useState<AppState>(DEF)
  const [tab, setTab] = useState<'main'|'tech'>('main')
  const [showConfigDetail, setShowConfigDetail] = useState(false)
  const [showCharts, setShowCharts] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const dismissToast = (id: number) => setToasts(t => t.filter(x => x.id !== id))
  const prevV = useRef({ mtow: false, internal: false, total: false, oge: false, cgFwd: false, cgAft: false, cgLat: false })
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = <K extends keyof AppState>(k: K, v: AppState[K]) => setS(p => ({ ...p, [k]: v }))

  // ── חישובים ──
  const heli      = HELICOPTERS.find(h => h.id === s.helicopter)!
  const equipW    = equipWeight(s.system, s.xp, s.cargoHook, s.bambiFill)
  const emptyW    = heli.emptyWeight
  const customW   = s.customStations.reduce((a, cs) => a + (cs.weight || 0), 0)
  const dryW      = emptyW + equipW
  const crewW     = s.pilotR + s.pilotL
  const paxW      = s.passengers.reduce((a, b) => a + b, 0)
  // בטן = מיכל ריק בלבד (ללא מים) — המשקל כבר נכלל ב-dryW דרך equipW
  const bambiWater = (s.bambiFill > 0 && s.bambiMode === 'hook') ? Math.round(BAMBI_CAPACITY_L * s.bambiFill / 100) : 0
  const extW       = s.externalLoad + bambiWater
  const fuelW      = s.fuel
  const takeoffW   = dryW + crewW + paxW + customW + extW + fuelW
  const internalW  = takeoffW - extW
  const ogeRaw     = getOGE(s.altitude, s.temperature)
  const effectiveOgeReserve80 = (s.bambiFill > 0 && s.bambiMode === 'hook') ? true : s.ogeReserve80
  const ogeLimit   = effectiveOgeReserve80 ? ogeRaw - 80 : ogeRaw
  const hasHook    = extW > 0
  const baseIntNoBambi = dryW + crewW + paxW + customW  // ללא דלק, ללא מים BAMBI, ללא מטען חיצוני

  // מקסימום דלק לפי המגבלה המחמירה מבין: פיזי / MTOW / פנימי / OGE
  const weightNoFuel   = takeoffW - fuelW
  const maxFuelByOGE   = Math.floor(ogeLimit - weightNoFuel)
  const maxFuelByMTOW  = Math.floor((!hasHook ? MTOW_NO_HOOK : MTOW_WITH_HOOK) - weightNoFuel)
  const maxFuelByInt   = hasHook ? Math.floor(MAX_INTERNAL - weightNoFuel + extW) : 426
  const maxFuelAllowed = Math.max(MIN_FUEL, Math.min(426, maxFuelByOGE, maxFuelByMTOW, maxFuelByInt))

  const stations = buildStations(s)
  const { longCG, latCG } = calcCG(stations)

  // ── מגבלות משקל ──
  // ללא מטען על הוו: כולל ≤ 2370
  // עם מטען על הוו: פנימי ≤ 2250 וכולל ≤ 2800
  const overMTOW     = !hasHook && takeoffW  > MTOW_NO_HOOK
  const overInternal =  hasHook && internalW > MAX_INTERNAL
  const overTotal    =  hasHook && takeoffW  > MTOW_WITH_HOOK
  const overOGE      = takeoffW > ogeLimit

  const extLongEnv = getExtLongEnv(MTOW_WITH_HOOK)
  const extLatEnv  = getExtLatEnv(MTOW_WITH_HOOK)
  const longEnv    = hasHook ? extLongEnv : STD_LONG_ENV
  const latEnv     = hasHook ? extLatEnv  : STD_LAT_ENV
  const cgLongOK   = takeoffW < 1100 || isInPolygon(longCG, takeoffW, longEnv)
  const cgLatOK    = takeoffW < 1100 || isInPolygon(latCG,  takeoffW, latEnv)
  const cgFwdViol  = !cgLongOK && longCG < 3.304
  const cgAftViol  = !cgLongOK && longCG >= 3.304
  const cgLatViol  = !cgLatOK
  const ok = !overMTOW && !overInternal && !overTotal && !overOGE && cgLongOK && cgLatOK

  const fuelLanding = Math.max(MIN_FUEL, Math.round(s.fuel * 0.1))
  const fuelMid     = Math.round((s.fuel + fuelLanding) / 2)
  const cgTakeoff   = calcCG(buildStations(s, s.fuel))
  const cgMid       = calcCG(buildStations(s, fuelMid))
  const cgLanding   = calcCG(buildStations(s, fuelLanding))

  const longDots = [
    { x: cgTakeoff.longCG, y: cgTakeoff.weight },
    { x: cgMid.longCG,     y: cgMid.weight },
    { x: cgLanding.longCG, y: cgLanding.weight },
  ]
  const latDots = [
    { x: cgTakeoff.latCG, y: cgTakeoff.weight },
    { x: cgMid.latCG,     y: cgMid.weight },
    { x: cgLanding.latCG, y: cgLanding.weight },
  ]

  // ── טוסטים ──
  useEffect(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      const checks: [boolean, keyof typeof prevV.current, string, boolean][] = [
        [overMTOW,     'mtow',     `⛔ חריגה ממשקל מקס' (${MTOW_NO_HOOK} ק"ג)`,      true ],
        [overInternal, 'internal', `⛔ חריגה ממשקל פנימי מקס' (${MAX_INTERNAL} ק"ג)`, true ],
        [overTotal,    'total',    `⛔ חריגה ממשקל כולל מקס' (${MTOW_WITH_HOOK} ק"ג)`, true ],
        [overOGE,      'oge',      '⛔ חריגה ממגבלת מנוע לריחוף מה"ק',                  true ],
        [cgFwdViol,    'cgFwd',    '⛔ מרכז כובד אורכי קדמי מחוץ למעטפת',               true ],
        [cgAftViol,    'cgAft',    '⛔ מרכז כובד אורכי אחורי מחוץ למעטפת',              true ],
        [cgLatViol,    'cgLat',    '⛔ מרכז כובד רוחבי מחוץ למעטפת',                    true ],
      ]
      const newToasts: Toast[] = []
      checks.forEach(([active, key, msg, error]) => {
        if (active && !prevV.current[key]) newToasts.push({ id: ++toastId.current, msg, error })
        prevV.current[key] = active
      })
      if (newToasts.length === 0) return
      setToasts(t => [...t, ...newToasts])
    }, 1500)
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }
  }, [overMTOW, overInternal, overTotal, overOGE, cgFwdViol, cgAftViol, cgLatViol])

  const configName  = CONFIGS.find(c => c.id === s.config)?.name ?? ''
  const configSeats = CONFIGS.find(c => c.id === s.config)?.seats ?? 0

  function handleBambiEnable() {
    setS(p => {
      const heli      = HELICOPTERS.find(h => h.id === p.helicopter)!
      const bambiW    = Math.round(BAMBI_CAPACITY_L * 70 / 100)
      const newEquipW = equipWeight(p.system, p.xp, p.cargoHook, 70)
      const newPaxW   = p.passengers.reduce((a, b) => a + b, 0)
      const newCustomW = p.customStations.reduce((a, cs) => a + (cs.weight || 0), 0)
      const newExtW   = p.externalLoad + bambiW
      const noFuelW   = heli.emptyWeight + newEquipW + 80 + 80 + newPaxW + newCustomW + newExtW
      const ogeLimit  = getOGE(p.altitude, p.temperature) - 80
      const safeFuel  = Math.max(MIN_FUEL, Math.min(426,
        Math.floor(ogeLimit       - noFuelW),
        Math.floor(MTOW_WITH_HOOK - noFuelW),
        Math.floor(MAX_INTERNAL   - noFuelW + newExtW),
      ))
      return { ...p, bambiFill: 70, bambiMode: 'hook', pilotR: 80, pilotL: 80, fuel: Math.min(p.fuel, safeFuel) }
    })
  }

  function addCustomStation() {
    set('customStations', [...s.customStations, { name: '', weight: 0, longArm: 2.54 }])
  }
  function removeCustomStation(i: number) {
    set('customStations', s.customStations.filter((_, idx) => idx !== i))
  }
  function updateCustomStation(i: number, field: keyof CustomStation, val: string | number) {
    const arr = s.customStations.map((cs, idx) => idx === i ? { ...cs, [field]: val } : cs)
    set('customStations', arr)
  }

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">

      {/* טוסטים */}
      <div className="fixed top-4 inset-x-3 z-50 space-y-2 pointer-events-none max-w-sm mx-auto">
        {toasts.map(t => (
          <div key={t.id}
            className={`rounded-xl px-4 py-3 text-white text-sm font-bold shadow-xl pointer-events-auto
              flex items-center justify-between gap-3
              ${t.error ? 'bg-red-600' : 'bg-orange-500'}`}>
            <span>{t.msg}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="flex-shrink-0 bg-black/25 hover:bg-black/40 active:bg-black/50
                rounded-lg px-3 py-1 text-xs font-bold transition-colors">
              אישור
            </button>
          </div>
        ))}
      </div>

      <header className="bg-blue-900 text-white px-4 py-3 sticky top-0 z-10 shadow">
        <div className="text-base font-bold">משקל ואיזון — H125</div>
        <div className="text-blue-300 text-xs">חישוב משקל ואיזון</div>
      </header>

      <div className="flex bg-blue-800 text-white text-sm sticky top-[52px] z-10">
        <button onClick={() => setTab('main')}
          className={`flex-1 py-2 font-medium transition-colors ${tab==='main' ? 'bg-blue-600' : 'hover:bg-blue-700'}`}>
          ראשי
        </button>
        <button onClick={() => setTab('tech')}
          className={`flex-1 py-2 font-medium transition-colors ${tab==='tech' ? 'bg-blue-600' : 'hover:bg-blue-700'}`}>
          תחנות ומומנטים
        </button>
      </div>

      {tab === 'main' ? (
        <div className="max-w-lg mx-auto p-3 space-y-3 pb-36">

          {/* מסוק */}
          <Card title="מסוק">
            <div className="grid grid-cols-2 gap-3">
              <Field label="זנב">
                <Sel value={s.helicopter} onChange={v => set('helicopter', v)}
                  opts={HELICOPTERS.map(h => h.id)} />
              </Field>
              <Field label="תצורה">
                <Sel value={s.config}
                  onChange={v => {
                    const seats = CONFIGS.find(c => c.id === v)?.seats ?? 0
                    setS(p => ({ ...p, config: v, passengers: Array(seats).fill(0) }))
                  }}
                  opts={CONFIGS.map(c => c.id)}
                  labels={CONFIGS.map(c => c.name)} />
              </Field>
            </div>
          </Card>

          {/* ציוד */}
          <Card title="ציוד">
            <Field label="מערכת תצפית">
              <Sel value={s.system} onChange={v => set('system', v)}
                opts={['ללא','SHAPO','DSP-HD']} />
            </Field>
            <Tog label="פנס Nightsun XP"   value={s.xp}        onChange={v => set('xp', v)} />
            <Tog label="וו חיצוני + מראות" value={s.cargoHook} onChange={v => set('cargoHook', v)} />
            {/* BAMBI — טוגל + בחירת אחוז מילוי + טבלה */}
            <div className="py-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-700">BAMBI</span>
                <button onClick={() => s.bambiFill > 0 ? set('bambiFill', 0) : handleBambiEnable()}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0
                    ${s.bambiFill > 0 ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
                    ${s.bambiFill > 0 ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              {s.bambiFill > 0 && (
                <div className="mt-2 rounded-xl overflow-hidden border border-slate-200">
                  {/* בחירת מצב חיבור */}
                  <div className="flex gap-1 p-2 bg-slate-50 border-b border-slate-100">
                    {(['hook', 'belly'] as const).map(mode => (
                      <button key={mode} onClick={() => set('bambiMode', mode)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                          ${s.bambiMode === mode
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
                        {mode === 'hook' ? 'וו חיצוני' : 'בטן'}
                      </button>
                    ))}
                  </div>

                  {s.bambiMode === 'hook' ? (<>
                    {/* בחירת % מילוי — רק במצב וו */}
                    <div className="flex gap-1 p-2 bg-white border-b border-slate-100">
                      {[70, 80, 90, 100].map(pct => (
                        <button key={pct} onClick={() => set('bambiFill', pct)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                            ${s.bambiFill === pct
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                          {pct}%
                        </button>
                      ))}
                    </div>

                    {/* טבלת עזר */}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                          <th className="py-1.5 font-medium text-center">מילוי</th>
                          <th className="py-1.5 font-medium text-center">מים ק"ג</th>
                          <th className="py-1.5 font-medium text-center">BAMBI כולל</th>
                          <th className="py-1.5 font-medium text-center">דלק מקס'</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[70, 80, 90, 100].map(pct => {
                          const water  = Math.round(BAMBI_CAPACITY_L * pct / 100)
                          const total  = BAMBI_EMPTY_WEIGHT + water
                          const intAtP = baseIntNoBambi
                          const extAtP = s.externalLoad + water
                          const maxF   = Math.max(0, Math.min(426,
                            Math.floor(MTOW_WITH_HOOK - intAtP - extAtP),
                            Math.floor(ogeLimit       - intAtP - extAtP),
                            Math.floor(MAX_INTERNAL   - intAtP)
                          ))
                          const sel = s.bambiFill === pct
                          return (
                            <tr key={pct} onClick={() => set('bambiFill', pct)}
                              className={`cursor-pointer border-b border-slate-50 last:border-0 transition-colors
                                ${sel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                              <td className={`py-1.5 text-center ${sel ? 'font-bold text-blue-700' : 'text-slate-600'}`}>
                                {pct}%
                              </td>
                              <td className={`py-1.5 text-center ${sel ? 'font-bold text-blue-700' : ''}`}>{water}</td>
                              <td className={`py-1.5 text-center ${sel ? 'font-bold text-blue-700' : ''}`}>{total}</td>
                              <td className={`py-1.5 text-center font-bold
                                ${maxF < 80 ? 'text-red-600' : maxF < 200 ? 'text-orange-500' : 'text-green-700'}`}>
                                {maxF > 0 ? `${maxF}` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </>) : (
                    /* מצב בטן — מיכל ריק בלבד */
                    <div className="px-3 py-3 bg-white text-xs text-slate-600 space-y-0.5">
                      <div className="font-bold text-slate-700">מיכל ריק — {BAMBI_EMPTY_WEIGHT} ק"ג</div>
                      <div className="text-slate-400">נחשב למשקל פנימי · מגבלות רגילות (ללא הוו)</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* פירוט תצורה */}
          <Card title="">
            <button onClick={() => setShowConfigDetail(v => !v)}
              className="w-full flex justify-between items-center text-sm font-bold text-slate-700">
              <span>פירוט תצורה</span>
              <span className="text-slate-400">{showConfigDetail ? '▲' : '▼'}</span>
            </button>
            {showConfigDetail && (
              <div className="mt-3 pt-3 border-t text-sm space-y-1">
                <R2 l="תצורה"      v={configName} />
                <R2 l="מושבים"     v={`${configSeats} מושבי נוסעים`} />
                <R2 l="מערכת"      v={s.system === 'ללא' ? 'ללא' : s.system} />
                <R2 l="פנס XP"     v={s.xp ? 'מותקן' : 'לא מותקן'} />
                <R2 l="וו חיצוני"  v={s.cargoHook ? 'מותקן' : 'לא מותקן'} />
                {s.bambiFill > 0 && (
                  <R2 l="BAMBI" v={s.bambiMode === 'hook' ? 'מחובר' : 'בטן'} />
                )}
              </div>
            )}
          </Card>

          {/* צוות ונוסעים */}
          <Card title="צוות ונוסעים">
            <div className="grid grid-cols-2 gap-3">
              <Field label='טייס ימין (ק"ג)'><Num value={s.pilotR} onChange={v => set('pilotR', v)} /></Field>
              <Field label='טייס שמאל (ק"ג)'><Num value={s.pilotL} onChange={v => set('pilotL', v)} /></Field>
              {Array.from({ length: configSeats }).map((_, i) => (
                <Field key={i} label={`נוסע ${i + 1} (ק"ג)`}>
                  <Num value={s.passengers[i] ?? 0}
                    onChange={v => { const arr = [...s.passengers]; arr[i] = v; set('passengers', arr) }} />
                </Field>
              ))}
            </div>
          </Card>

          {/* דלק ומשקל על הוו */}
          <Card title="דלק ומשקל על הוו">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`דלק (ק"ג) · מקס' ${maxFuelAllowed}`}>
                <Num value={s.fuel} onChange={v => set('fuel', v)} step={5} max={maxFuelAllowed} />
              </Field>
              <Field label='משקל על הוו (ק"ג)'>
                <Num value={s.externalLoad} onChange={v => set('externalLoad', v)} step={5} />
              </Field>
            </div>
            {hasHook && (
              <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mt-1">
                משקל פנימי מקס' 2250 ק"ג · משקל כולל מקס' 2800 ק"ג
              </div>
            )}
          </Card>

          {/* תחנות נוספות */}
          <Card title="משקל נוסף (תחנה ידנית)">
            {s.customStations.length === 0 && (
              <p className="text-xs text-slate-400 mb-2">להוספת ציוד או מטען שאינו ברשימה</p>
            )}
            {s.customStations.map((cs, i) => (
              <div key={i} className="flex gap-2 mb-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-0.5">שם</label>
                  <input value={cs.name} onChange={e => updateCustomStation(i, 'name', e.target.value)}
                    placeholder="תיאור"
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white" />
                </div>
                <div className="w-20">
                  <label className="block text-xs text-slate-500 mb-0.5">משקל</label>
                  <Num value={cs.weight} onChange={v => updateCustomStation(i, 'weight', v)} />
                </div>
                <div className="w-20">
                  <label className="block text-xs text-slate-500 mb-0.5">זרוע (מ')</label>
                  <input
                    type="number" inputMode="decimal" step="0.01"
                    value={cs.longArm}
                    onChange={e => updateCustomStation(i, 'longArm', Number(e.target.value))}
                    onFocus={e => e.target.select()}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-center" />
                </div>
                <button onClick={() => removeCustomStation(i)}
                  className="mb-0.5 text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
              </div>
            ))}
            <button onClick={addCustomStation}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              + הוסף תחנה
            </button>
          </Card>

          {/* תנאי סביבה */}
          <Card title="תנאי סביבה">
            <div className="grid grid-cols-2 gap-3">
              <Field label="גובה (רגל)">
                <Sel value={String(s.altitude)} onChange={v => set('altitude', Number(v))}
                  opts={['0','500','1000','1500','2000','2500','3000','3500','4000']} />
              </Field>
              <Field label="טמפרטורה (°C)">
                <Sel value={String(s.temperature)} onChange={v => set('temperature', Number(v))}
                  opts={['10','15','20','25','30','35','40']} />
              </Field>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              מגבלת מנוע לריחוף מה"ק — {s.altitude} רגל / {s.temperature}°C —
              ערך גולמי: {ogeRaw} ק"ג
            </div>
          </Card>

          {/* תוצאות */}
          <Card title="תוצאות חישוב">

            <div className="space-y-0.5 text-sm mb-3">
              <WR l="מסוק ריק"        v={emptyW} />
              <WR l="ציוד והתקנות"    v={equipW} />
              <WR l="צוות"            v={crewW}  />
              {paxW  > 0 && <WR l="נוסעים"         v={paxW}  />}
              {customW > 0 && <WR l="תחנות נוספות" v={customW} />}
              {extW   > 0 && <WR l="משקל על הוו"   v={extW}   />}
              <div className="border-b border-slate-50 pb-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">דלק</span>
                  <span className="font-medium text-slate-700">
                    {fuelW.toFixed(0)} ק"ג{' '}
                    <span className="font-bold">
                      ({Math.max(0, Math.floor((fuelW - FUEL_LANDING_MIN) / FUEL_BURN_RATE))} דק' טיסה)
                    </span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 text-left">
                  לפי {FUEL_LANDING_MIN} ק"ג לנחיתה ו-{FUEL_BURN_RATE} ק"ג/דקה
                </div>
              </div>
              <div className="flex justify-between border-t-2 border-slate-300 pt-1 font-bold">
                <span>משקל המראה</span>
                <span>{takeoffW.toFixed(0)} ק"ג</span>
              </div>
            </div>

            {/* פסי מגבלות — לפי מצב הוו */}
            <div className="space-y-2 mb-4">
              {!hasHook ? (
                <LimitBar label={`מגבלת מבנה (${MTOW_NO_HOOK} ק"ג)`}
                  actual={takeoffW} max={MTOW_NO_HOOK} over={overMTOW} />
              ) : (<>
                <LimitBar label={`מגבלת מבנה פנימי (${MAX_INTERNAL} ק"ג)`}
                  actual={internalW} max={MAX_INTERNAL} over={overInternal} />
                <LimitBar label={`מגבלת מבנה כולל (${MTOW_WITH_HOOK} ק"ג)`}
                  actual={takeoffW} max={MTOW_WITH_HOOK} over={overTotal} />
              </>)}
              <LimitBar
                label={`מגבלת מנוע לריחוף מה"ק${effectiveOgeReserve80 ? ' מינוס 80' : ''} (${ogeLimit} ק"ג)`}
                actual={takeoffW} max={ogeLimit} over={overOGE} />
            </div>

            {/* OGE toggle */}
            <div className="mb-3 border-t pt-2">
              <Tog label='מינוס 80 ק"ג ממגבלת מנוע לריחוף מה"ק'
                value={effectiveOgeReserve80}
                onChange={v => set('ogeReserve80', v)}
                disabled={s.bambiFill > 0 && s.bambiMode === 'hook'} />
              {s.bambiFill > 0 && s.bambiMode === 'hook' && (
                <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-0.5">
                  🔒 BAMBI על הוו — מינוס 80 ק"ג נדרש תמיד
                </div>
              )}
            </div>

            {/* גרפי מעטפת מרכז כובד */}
            <div className="mb-3">
              <button onClick={() => setShowCharts(v => !v)}
                className="w-full flex justify-between items-center text-sm font-bold py-2 px-3
                  rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100 transition-colors border border-blue-200">
                <span>גרפי מעטפת מרכז כובד</span>
                <span>{showCharts ? '▲' : '▼'}</span>
              </button>
              {showCharts && (
                <div className="mt-2 space-y-1">
                  <CGChart2D
                    title="מעטפת אורכית"
                    stdPoly={STD_LONG_ENV}
                    extPoly={extLongEnv}
                    hasHook={hasHook}
                    dots={longDots}
                    xMin={3.10} xMax={3.60}
                    xTicks={[3.15, 3.25, 3.35, 3.45, 3.55]}
                  />
                  <CGChart2D
                    title="מעטפת רוחבית"
                    stdPoly={STD_LAT_ENV}
                    extPoly={extLatEnv}
                    hasHook={hasHook}
                    dots={latDots}
                    xMin={-0.26} xMax={0.22}
                    xTicks={[-0.20, -0.10, 0.00, 0.10, 0.20]}
                  />
                </div>
              )}
            </div>

            <CGLongBar cgTake={cgTakeoff.longCG} cgLand={cgLanding.longCG} />
            <CGLatBar cg={latCG} ok={cgLatOK} />

          </Card>

        </div>
      ) : (

        /* לשונית תחנות ומומנטים */
        <div className="max-w-lg mx-auto p-3 pb-36">
          <Card title="תחנות ומומנטים">
            <p className="text-xs text-slate-400 mb-3">
              זרוע = מרחק מנקודת ייחוס (מ') · מומנט = משקל × זרוע
            </p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-slate-500 bg-slate-50">
                    <th className="pb-1.5 pt-1 font-medium pr-1 text-right">תחנה</th>
                    <th className="pb-1.5 pt-1 font-medium text-left">משקל</th>
                    <th className="pb-1.5 pt-1 font-medium text-left">זרוע אורכי</th>
                    <th className="pb-1.5 pt-1 font-medium text-left">מומנט אורכי</th>
                    <th className="pb-1.5 pt-1 font-medium text-left">זרוע רוחבי</th>
                    <th className="pb-1.5 pt-1 font-medium text-left">מומנט רוחבי</th>
                  </tr>
                </thead>
                <tbody>
                  {(['מסוק','מערכות','אנשים','דלק','אחר'] as StationGroup[]).map(group => {
                    const rows = stations.filter(st => st.group === group)
                    if (rows.length === 0) return null
                    const gW   = rows.reduce((a, st) => a + st.weight, 0)
                    const gLM  = rows.reduce((a, st) => a + st.weight * st.longArm, 0)
                    const gLatM = rows.reduce((a, st) => a + st.weight * st.latArm, 0)
                    return (
                      <>
                        <tr key={`hdr-${group}`} className="bg-blue-50">
                          <td colSpan={6} className="py-1 pr-1 font-bold text-blue-800 text-xs">{group}</td>
                        </tr>
                        {rows.map((st, i) => (
                          <tr key={`${group}-${i}`} className="border-b border-slate-50">
                            <td className="py-1 pr-1 text-slate-700 pr-3">{st.name}</td>
                            <td className="py-1 text-left">{st.weight.toFixed(1)}</td>
                            <td className="py-1 text-left text-slate-500">{st.longArm.toFixed(3)}</td>
                            <td className="py-1 text-left font-medium">{(st.weight * st.longArm).toFixed(1)}</td>
                            <td className="py-1 text-left text-slate-500">{st.latArm.toFixed(3)}</td>
                            <td className="py-1 text-left font-medium">{(st.weight * st.latArm).toFixed(1)}</td>
                          </tr>
                        ))}
                        <tr key={`sub-${group}`} className="bg-slate-50 text-slate-500 font-medium">
                          <td className="py-1 pr-3 text-left text-slate-400">סכום</td>
                          <td className="py-1 text-left">{gW.toFixed(1)}</td>
                          <td className="py-1 text-left">—</td>
                          <td className="py-1 text-left">{gLM.toFixed(1)}</td>
                          <td className="py-1 text-left">—</td>
                          <td className="py-1 text-left">{gLatM.toFixed(1)}</td>
                        </tr>
                      </>
                    )
                  })}
                  <tr className="font-bold bg-blue-900 text-white border-t-2 border-slate-300">
                    <td className="py-1.5 pr-1">סה"כ</td>
                    <td className="py-1.5 text-left">{takeoffW.toFixed(1)}</td>
                    <td className="py-1.5 text-left">{longCG.toFixed(2)}</td>
                    <td className="py-1.5 text-left">{(takeoffW * longCG).toFixed(1)}</td>
                    <td className="py-1.5 text-left">{latCG.toFixed(2)}</td>
                    <td className="py-1.5 text-left">{(takeoffW * latCG).toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-3 border-t text-xs space-y-1 text-slate-600">
              <div>
                מרכז כובד אורכי: <span className="font-bold text-slate-800">{longCG.toFixed(2)} מ'</span>
                <span className={`mr-2 font-medium ${cgLongOK ? 'text-green-700' : 'text-red-600'}`}>
                  {cgLongOK ? '✅ בתחום' : '⛔ מחוץ למעטפת'}
                </span>
              </div>
              <div>
                מרכז כובד רוחבי: <span className="font-bold text-slate-800">{latCG.toFixed(2)} מ'</span>
                <span className={`mr-2 font-medium ${cgLatOK ? 'text-green-700' : 'text-red-600'}`}>
                  {cgLatOK ? '✅ בתחום' : '⛔ מחוץ למעטפת'}
                </span>
              </div>
              <div className="text-slate-400">מעטפת: {hasHook ? 'מטען חיצוני (אדום)' : 'סטנדרט (כחול)'}</div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── באנר מרחף תחתון ─── */}
      <div className="fixed bottom-0 inset-x-0 z-20 shadow-[0_-3px_16px_rgba(0,0,0,0.25)]">
        <div className={`text-white transition-colors duration-300 ${
          ok
            ? 'bg-green-800'
            : (overMTOW || overInternal || overTotal)
              ? 'bg-red-700'
              : 'bg-orange-600'
        }`}>
          <div className="max-w-lg mx-auto px-3 pt-2 pb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">
                {ok ? '✅ מאושר לטיסה' : '⛔ לא מאושר לטיסה'}
              </span>
              <div>
                <span className="text-2xl font-bold leading-none">{takeoffW.toFixed(0)}</span>
                <span className="text-xs opacity-70 font-normal">
                  {' '}/ {!hasHook ? MTOW_NO_HOOK : MTOW_WITH_HOOK} ק"ג
                </span>
              </div>
            </div>
            <div className={`grid gap-1.5 ${
              !cgLongOK && !cgLatOK ? 'grid-cols-3' :
              !cgLongOK || !cgLatOK ? 'grid-cols-2' :
              'grid-cols-1'
            }`}>
              <BannerCell
                label='מנוע מה"ק'
                value={`${takeoffW.toFixed(0)}/${ogeLimit}`}
                ok={!overOGE}
              />
              {!cgLongOK && (
                <BannerCell
                  label="מ.כ. אורכי"
                  value={`${longCG.toFixed(2)} מ'`}
                  ok={false}
                />
              )}
              {!cgLatOK && (
                <BannerCell
                  label="מ.כ. רוחבי"
                  value={`${latCG.toFixed(2)} מ'`}
                  ok={false}
                />
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

// ─── רכיבים ───────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm p-4">
      {title && <h2 className="font-bold text-slate-800 text-sm mb-3 border-b pb-1">{title}</h2>}
      {children}
    </section>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
      {children}
    </div>
  )
}
function Sel({ value, onChange, opts, labels }: { value: string; onChange: (v: string) => void; opts: string[]; labels?: string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white">
      {opts.map((o, i) => <option key={o} value={o}>{labels?.[i] ?? o}</option>)}
    </select>
  )
}
function Num({ value, onChange, step = 1, min = 0, max }: {
  value: number; onChange: (v: number) => void
  step?: number; min?: number; max?: number
}) {
  const handleDec = () => onChange(Math.max(min, +(value - step).toFixed(10)))
  const handleInc = () => {
    const next = +(value + step).toFixed(10)
    onChange(max !== undefined ? Math.min(max, next) : next)
  }
  return (
    <div className="flex items-stretch border border-slate-200 rounded-lg overflow-hidden bg-white">
      <button type="button" onClick={handleDec}
        className="w-9 flex items-center justify-center text-xl font-bold text-slate-400
          hover:bg-slate-100 active:bg-slate-200 select-none touch-manipulation flex-shrink-0">
        −
      </button>
      <input
        type="number" inputMode="numeric"
        value={value}
        onChange={e => {
          const v = e.target.value === '' ? min : Number(e.target.value)
          if (!isNaN(v)) onChange(max !== undefined ? Math.min(max, Math.max(min, v)) : Math.max(min, v))
        }}
        onFocus={e => e.target.select()}
        className="flex-1 min-w-0 text-center text-sm font-medium py-2 bg-transparent border-none outline-none" />
      <button type="button" onClick={handleInc}
        className="w-9 flex items-center justify-center text-xl font-bold text-slate-400
          hover:bg-slate-100 active:bg-slate-200 select-none touch-manipulation flex-shrink-0">
        +
      </button>
    </div>
  )
}
function Tog({ label, value, onChange, disabled }: {
  label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className={`text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>{label}</span>
      <button onClick={() => { if (!disabled) onChange(!value) }}
        disabled={disabled}
        className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0
          ${value ? 'bg-blue-600' : 'bg-slate-300'}
          ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
          ${value ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  )
}
function WR({ l, v }: { l: string; v: number }) {
  return (
    <div className="flex justify-between border-b border-slate-50 pb-0.5">
      <span className="text-slate-500">{l}</span>
      <span className="font-medium text-slate-700">{v.toFixed(0)} ק"ג</span>
    </div>
  )
}
function R2({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{l}</span>
      <span className="font-medium text-slate-700">{v}</span>
    </div>
  )
}
function LimitBar({ label, actual, max, over }: { label: string; actual: number; max: number; over: boolean }) {
  const pct = Math.min((actual / max) * 100, 100)
  return (
    <div className={`rounded-lg p-2 ${over ? 'bg-red-50' : 'bg-slate-50'}`}>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={`font-bold ${over ? 'text-red-700' : 'text-slate-600'}`}>
          {actual.toFixed(0)} / {max} ק"ג
        </span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300
          ${over ? 'bg-red-500' : pct > 92 ? 'bg-orange-400' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
function CGChart2D({
  title, stdPoly, extPoly, hasHook, dots, xMin, xMax, xTicks
}: {
  title: string
  stdPoly: [number, number][]
  extPoly: [number, number][]
  hasHook: boolean
  dots: { x: number; y: number }[]
  xMin: number; xMax: number
  xTicks: number[]
}) {
  const W = 300, H = 215
  const padL = 38, padR = 10, padT = 12, padB = 28
  const pw = W - padL - padR, ph = H - padT - padB
  const yMin = 900, yMax = 3100
  const yTicks = [1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000]

  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * pw
  const sy = (y: number) => padT + ph * (1 - (y - yMin) / (yMax - yMin))
  const ptsStr = (poly: [number, number][]) =>
    poly.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')

  return (
    <div className="mb-3">
      <div className="text-xs font-bold text-slate-600 mb-1 text-center">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto border border-slate-200 rounded-lg bg-white">
        <rect x={padL} y={padT} width={pw} height={ph} fill="#f8fafc" />
        {yTicks.map(y => (
          <line key={y} x1={padL} y1={sy(y)} x2={padL + pw} y2={sy(y)}
            stroke="#e2e8f0" strokeWidth="0.5" />
        ))}
        {/* red (external) behind blue (standard) */}
        <polygon points={ptsStr(extPoly)}
          fill="rgba(239,68,68,0.13)" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" />
        <polygon points={ptsStr(stdPoly)}
          fill="rgba(59,130,246,0.13)" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
        {/* sortie track */}
        {dots.length > 1 && (
          <polyline
            points={dots.map(d => `${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join(' ')}
            fill="none" stroke="#475569" strokeWidth="1.5"
            strokeDasharray="5,3" strokeLinecap="round" />
        )}
        {/* dots */}
        {dots.map((d, i) => {
          const inEnv = hasHook
            ? isInPolygon(d.x, d.y, extPoly)
            : isInPolygon(d.x, d.y, stdPoly)
          const c = inEnv ? '#16a34a' : '#dc2626'
          return <circle key={i} cx={sx(d.x)} cy={sy(d.y)}
            r={i === 0 ? 5.5 : 4}
            fill={c} stroke="white" strokeWidth="1.5" />
        })}
        {/* border */}
        <rect x={padL} y={padT} width={pw} height={ph}
          fill="none" stroke="#94a3b8" strokeWidth="1" />
        {/* y labels */}
        {yTicks.map(y => (
          <text key={y} x={padL - 3} y={sy(y) + 3.5}
            textAnchor="end" fontSize="8" fill="#64748b">{y}</text>
        ))}
        {/* x labels */}
        {xTicks.map(x => (
          <text key={x} x={sx(x)} y={padT + ph + 14}
            textAnchor="middle" fontSize="8" fill="#64748b">{x}</text>
        ))}
        {/* legend */}
        <rect x={padL + pw - 66} y={padT + 4} width="8" height="7"
          fill="rgba(59,130,246,0.3)" stroke="#3b82f6" strokeWidth="1" />
        <text x={padL + pw - 56} y={padT + 11} fontSize="8" fill="#3b82f6">Standard</text>
        <rect x={padL + pw - 66} y={padT + 15} width="8" height="7"
          fill="rgba(239,68,68,0.3)" stroke="#ef4444" strokeWidth="1" />
        <text x={padL + pw - 56} y={padT + 22} fontSize="8" fill="#ef4444">External</text>
        {/* y-axis title rotated */}
        <text x={10} y={padT + ph / 2} fontSize="8" fill="#94a3b8"
          transform={`rotate(-90, 10, ${padT + ph / 2})`} textAnchor="middle">kg</text>
      </svg>
    </div>
  )
}

function CGLongBar({ cgTake, cgLand }: { cgTake: number; cgLand: number }) {
  const range  = CG_VIS_MAX - CG_VIS_MIN
  const fwdPct = ((CG_FWD - CG_VIS_MIN) / range) * 100
  const aftPct = ((CG_AFT - CG_VIS_MIN) / range) * 100
  const pct    = (cg: number) => Math.min(100, Math.max(0, ((cg - CG_VIS_MIN) / range) * 100))
  const tp = pct(cgTake), lp = pct(cgLand)
  const okT = cgTake >= CG_FWD && cgTake <= CG_AFT
  const okL = cgLand >= CG_FWD && cgLand <= CG_AFT
  const delta = cgLand - cgTake
  const midPct = Math.min(tp, lp) + Math.abs(tp - lp) / 2

  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-slate-600 mb-1">מרכז כובד אורכי</div>
      <div className="relative h-5 bg-slate-200 rounded-full">
        {/* אזור ירוק = תחום CG מאושר */}
        <div className="absolute top-0 h-full bg-green-200 rounded-full"
          style={{ left: `${fwdPct}%`, width: `${aftPct - fwdPct}%` }} />
        {/* קו מסלול המראה→נחיתה */}
        <div className={`absolute top-[8px] h-[4px] rounded ${okT && okL ? 'bg-sky-300' : 'bg-orange-300'}`}
          style={{ left: `${Math.min(tp, lp)}%`, width: `${Math.max(Math.abs(tp - lp), 0.5)}%` }} />
        {/* חץ כיוון בתוך הבר */}
        {Math.abs(delta) > 0.001 && Math.abs(tp - lp) > 5 && (
          <span className={`absolute text-[10px] font-bold leading-none pointer-events-none select-none
            ${delta < 0 ? 'text-blue-700' : 'text-orange-600'}`}
            style={{ top: '3px', left: `${midPct}%`, transform: 'translateX(-50%)' }}>
            {delta < 0 ? '←' : '→'}
          </span>
        )}
        {/* נקודת נחיתה (עיגול ריק) */}
        <div className={`absolute top-1 w-3 h-3 rounded-full border-2 bg-white shadow-sm
          ${okL ? 'border-sky-500' : 'border-red-500'}`}
          style={{ left: `${lp}%`, transform: 'translateX(-50%)' }} />
        {/* נקודת המראה (עיגול מלא) */}
        <div className={`absolute top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm
          ${okT ? 'bg-green-600' : 'bg-red-500'}`}
          style={{ left: `${tp}%`, transform: 'translateX(-50%)' }} />
      </div>
    </div>
  )
}

function CGLatBar({ cg, ok }: { cg: number; ok: boolean }) {
  const xMin = -0.22, xMax = 0.18
  const range  = xMax - xMin
  const limLpct = ((-0.18 - xMin) / range) * 100
  const limRpct = ((0.14  - xMin) / range) * 100
  const zeroPct = ((0     - xMin) / range) * 100
  const cgPct   = Math.min(100, Math.max(0, ((cg - xMin) / range) * 100))

  return (
    <div className="mb-4">
      <div className="text-xs font-medium text-slate-600 mb-1">מרכז כובד רוחבי</div>
      <div className="relative h-5 bg-slate-200 rounded-full">
        <div className="absolute top-0 h-full bg-green-200 rounded-full"
          style={{ left: `${limLpct}%`, width: `${limRpct - limLpct}%` }} />
        <div className="absolute top-0 w-px h-full bg-slate-400/60"
          style={{ left: `${zeroPct}%` }} />
        <div className={`absolute top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm
          ${ok ? 'bg-green-600' : 'bg-red-500'}`}
          style={{ left: `${cgPct}%`, transform: 'translateX(-50%)' }} />
      </div>
      <div className="relative text-[9px] mt-0.5 text-slate-400 h-3" dir="ltr">
        <span className="absolute left-0">-0.18 שמאל</span>
        <span className="absolute" style={{ left: `${zeroPct}%`, transform: 'translateX(-50%)' }}>0</span>
        <span className="absolute right-0">ימין 0.14</span>
      </div>
    </div>
  )
}

function BannerCell({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`rounded-lg px-1.5 py-1.5 text-center transition-colors
      ${ok ? 'bg-white/10' : 'bg-black/20 ring-1 ring-yellow-400/40'}`}>
      <div className="text-[9px] opacity-75 leading-tight mb-0.5">{label}</div>
      <div className={`text-[11px] font-bold leading-tight ${!ok ? 'text-yellow-300' : ''}`}>
        {!ok && '⛔ '}{value}
      </div>
    </div>
  )
}

