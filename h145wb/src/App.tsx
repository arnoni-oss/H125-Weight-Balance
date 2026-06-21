import { Fragment, useState, useEffect, useRef, useMemo } from 'react'
import './index.css'
import {
  HELICOPTERS, EQUIPMENT, CONFIGS,
  CG_LONG_ENVELOPE, OGE_TABLES, FUEL_CG_TABLE, MAX_BAMBI_BY_OGE_TABLE,
} from './data'

// ─── קבועים ─────────────────────────────────────────────────────────────────────

const MTOW_BASE     = 3700
const MTOW_APPROVED = 3800
const FUEL_MAX      = 723
const FUEL_MIN      = 40
const FUEL_BURN     = 4.0
const FUEL_LANDING  = 100

const E = Object.fromEntries(EQUIPMENT.map(e => [e.name, e])) as Record<string, typeof EQUIPMENT[number]>

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

function getOgeKey(bambiMode: BambiMode, bambiFill: number): keyof typeof OGE_TABLES {
  if (bambiMode === 'hook' && bambiFill >= 100) return 'CARGO100'
  if (bambiMode === 'hook' && bambiFill >= 90)  return 'CARGO90'
  if (bambiMode === 'hook' && bambiFill >= 80)  return 'CARGO80'
  return 'CARGO70'
}

function getOGE(alt: number, tmp: number, bambiMode: BambiMode, bambiFill: number): number {
  const alts = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000]
  const tmps = [10, 15, 20, 25, 30, 35, 40]
  const a = alts.find(v => v >= alt) ?? alts[alts.length - 1]
  const t = tmps.find(v => v >= tmp) ?? tmps[tmps.length - 1]
  const table = OGE_TABLES[getOgeKey(bambiMode, bambiFill)]
  return (table as Record<number, Record<number, number>>)[a][t]
}

function getFuelCG(mass: number): { longArm: number; latArm: number } {
  if (mass <= 0) return { longArm: 0, latArm: 0 }
  if (mass <= FUEL_CG_TABLE[0].mass) return { longArm: FUEL_CG_TABLE[0].longArm, latArm: FUEL_CG_TABLE[0].latArm }
  const last = FUEL_CG_TABLE[FUEL_CG_TABLE.length - 1]
  if (mass >= last.mass) return { longArm: last.longArm, latArm: last.latArm }
  let best = FUEL_CG_TABLE[0]
  let bestDiff = Math.abs(mass - best.mass)
  for (const row of FUEL_CG_TABLE) {
    const d = Math.abs(mass - row.mass)
    if (d < bestDiff) { best = row; bestDiff = d }
  }
  return { longArm: best.longArm, latArm: best.latArm }
}

function getLongEnvelope(cargoWeight: number, bambiMode: BambiMode = 'off', bambiFill: number = 0): [number, number][] {
  const envKey = (bambiMode === 'hook')
    ? bambiFill >= 100 ? 'CARGO100'
    : bambiFill >= 90  ? 'CARGO90'
    : bambiFill >= 80  ? 'CARGO80'
    : 'CARGO70'
    : 'CARGO'
  const env = CG_LONG_ENVELOPE[envKey as keyof typeof CG_LONG_ENVELOPE]
  const bands = [100, 200, 300, 400, 500, 600, 700, 800] as const
  const band = bands.find(b => b >= cargoWeight) ?? 800
  const poly = env.byCargoWeight[band as keyof typeof env.byCargoWeight]
  const a = poly.find(p => p.label === 'A')!
  const b = poly.find(p => p.label === 'B')!
  const c = poly.find(p => p.label === 'C')!
  const d = poly.find(p => p.label === 'D')!
  const tf = env.top.fwd
  const ta = env.top.aft
  return [
    [tf[0], tf[1]],
    [ta[0], ta[1]],
    [b.longArm, b.weight],
    [c.longArm, c.weight],
    [d.longArm, d.weight],
    [a.longArm, a.weight],
    [tf[0], tf[1]],
  ]
}

function getCGLimitsAtWeight(weight: number, poly: [number, number][]): { fwd: number; aft: number } | null {
  const xs: number[] = []
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi <= weight && weight <= yj) || (yj <= weight && weight <= yi)) {
      if (Math.abs(yj - yi) < 0.01) continue
      const t = (weight - yi) / (yj - yi)
      xs.push(xi + t * (xj - xi))
    }
  }
  if (xs.length < 2) return null
  return { fwd: Math.min(...xs), aft: Math.max(...xs) }
}

// ─── טיפוסים ─────────────────────────────────────────────────────────────────

type BambiMode = 'off' | 'cabin' | 'hook'
type FastRope = 'off' | 'fixed' | 'extended'
type StationGroup = 'מסוק' | 'מערכות' | 'אנשים' | 'דלק' | 'אחר'
interface Station { name: string; weight: number; longArm: number; latArm: number; group: StationGroup }
interface CustomStation { name: string; weight: number; longArm: number }

interface AppState {
  helicopter:      string
  config:          string
  system:          'ללא' | 'SHAPO' | 'DSP-HD'
  xp:              boolean
  pa:              boolean
  cargoHook:       boolean
  cargoMirrors:    boolean
  fastRope:        FastRope
  bambiMode:       BambiMode
  bambiFill:       number
  pilotR:          number
  pilotL:          number
  passengers:      number[]
  externalLoad:    number
  fuel:            number
  altitude:        number
  temperature:     number
  max3800Approved: boolean
  customStations:  CustomStation[]
}

const DEF: AppState = {
  helicopter: 'BMP', config: '01', system: 'DSP-HD',
  xp: true, pa: false, cargoHook: true, cargoMirrors: false,
  fastRope: 'off', bambiMode: 'off', bambiFill: 0,
  pilotR: 80, pilotL: 80, passengers: [0, 0, 0, 0],
  externalLoad: 0, fuel: 500,
  altitude: 2000, temperature: 20,
  max3800Approved: false, customStations: [],
}

interface Toast { id: number; msg: string; error: boolean }

// ─── חישוב ציוד ─────────────────────────────────────────────────────────────

function equipmentStations(s: AppState): Station[] {
  const out: Station[] = []
  const add = (name: string, w: number, la: number, lat: number, g: StationGroup = 'מערכות') => {
    if (w > 0) out.push({ name, weight: w, longArm: la, latArm: lat, group: g })
  }
  if (s.system === 'DSP-HD') {
    const c = E['Controp DSP-HD Camera'], hc = E['Controp Hand Controller']
    add('מצלמה DSP-HD', c.weight, c.longArm, c.latArm)
    add('שלט יד DSP', hc.weight, hc.longArm, hc.latArm)
  } else if (s.system === 'SHAPO') {
    const c = E['CONTROP IMAGER SHAPO'], hc = E['Controp Hand Controller']
    add('מצלמה SHAPO', c.weight, c.longArm, c.latArm)
    add('שלט יד SHAPO', hc.weight, hc.longArm, hc.latArm)
  }
  if (s.xp) {
    const xp = E['Nightsun XP Search Light'], hc = E['Nightsun Hand Controller']
    add('פנס Nightsun XP', xp.weight, xp.longArm, xp.latArm)
    add('שלט יד פנס', hc.weight, hc.longArm, hc.latArm)
  }
  if (s.pa) { const pa = E['PA Speakers']; add('רמקולי כריזה', pa.weight, pa.longArm, pa.latArm) }
  if (s.cargoHook) {
    const hook = E['CARGO HOOK DOUBLE DET PROVISIONS']
    add('וו מטען', hook.weight, hook.longArm, hook.latArm)
    if (s.cargoMirrors) { const m = E['CARGO EXTERNAL MIRRORS']; add('מראות וו', m.weight, m.longArm, m.latArm) }
  }
  if (s.fastRope !== 'off') {
    const r = E['FAST ROPE SYSTEM R'], l = E['FAST ROPE SYSTEM L']
    add('FR ימין', r.weight, r.longArm, r.latArm)
    add('FR שמאל', l.weight, l.longArm, l.latArm)
  }
  if (s.bambiMode !== 'off') {
    const bk = E['BAMBI BUCKET IN CABIN']
    if (s.bambiMode === 'cabin') {
      add('BAMBI (בקבינה)', bk.weight, bk.longArm, bk.latArm)
    } else {
      add('BAMBI דלי (על הוו)', bk.weight, E['BAMBI BUCKET ON HOOK'].longArm, 0)
    }
  }
  return out
}

function buildStations(s: AppState, fuelOverride?: number): Station[] {
  const heli = HELICOPTERS.find(h => h.id === s.helicopter)!
  const fuel = fuelOverride ?? s.fuel
  const cfg  = CONFIGS.find(c => c.id === s.config)!
  const st: Station[] = []
  const add = (name: string, weight: number, longArm: number, latArm: number, group: StationGroup) =>
    st.push({ name, weight, longArm, latArm, group })

  add(`מסוק ריק (${s.helicopter})`, heli.emptyWeight, heli.longArm, heli.latArm, 'מסוק')
  equipmentStations(s).forEach(e => st.push(e))
  add('טייס ימין', s.pilotR, 2.312,  0.39, 'אנשים')
  add('טייס שמאל', s.pilotL, 2.312, -0.39, 'אנשים')

  cfg.seats.forEach((seat, i) => {
    add(`כסא ${i + 1}`, seat.weight, seat.longArm, seat.latArm, 'מערכות')
    const pax = s.passengers[i] ?? 0
    if (pax > 0) add(`נוסע ${i + 1}`, pax, seat.longArm, seat.latArm, 'אנשים')
  })

  s.customStations.forEach(cs => {
    if (cs.weight > 0) add(cs.name || 'תחנה נוספת', cs.weight, cs.longArm, 0, 'אחר')
  })

  if (s.bambiMode === 'hook' && s.bambiFill > 0) {
    const waterW = Math.round(680 * s.bambiFill / 100)
    if (waterW > 0) add(`מים BAMBI ${s.bambiFill}%`, waterW, E['BAMBI BUCKET ON HOOK'].longArm, 0, 'אחר')
  }
  if (s.externalLoad > 0) add('משקל על הוו', s.externalLoad, E['WEIGHT ON HOOK'].longArm, 0, 'אחר')
  if (fuel > 0) { const fcg = getFuelCG(fuel); add('דלק', fuel, fcg.longArm, fcg.latArm, 'דלק') }
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

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [s, setS] = useState<AppState>(() => {
    const cfg = CONFIGS.find(c => c.id === DEF.config)!
    return { ...DEF, passengers: Array(cfg.seats.length).fill(0) }
  })
  const [tab, setTab] = useState<'main' | 'tech'>('main')
  const [showConfigDetail, setShowConfigDetail] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [largeText, setLargeText] = useState(() => localStorage.getItem('largeText_h145') === '1')
  const toastId = useRef(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevV = useRef({ mtow: false, oge: false, cgLong: false, cgLat: false, internal: false })

  useEffect(() => {
    document.documentElement.style.fontSize = largeText ? '20px' : '16px'
    localStorage.setItem('largeText_h145', largeText ? '1' : '0')
  }, [largeText])

  function set<K extends keyof AppState>(k: K, v: AppState[K]) {
    setS(prev => {
      const next = { ...prev, [k]: v } as AppState
      if (k === 'config') {
        const newCfg = CONFIGS.find(c => c.id === v as string)!
        next.passengers = Array(newCfg.seats.length).fill(0)
      }
      return next
    })
  }

  const dismissToast = (id: number) => setToasts(t => t.filter(x => x.id !== id))

  const cfg  = CONFIGS.find(c => c.id === s.config)!
  const heli = HELICOPTERS.find(h => h.id === s.helicopter)!

  // ── חישובים ──
  const stations = useMemo(() => buildStations(s), [s])
  const { longCG, latCG } = useMemo(() => calcCG(stations), [stations])

  const fuelW    = s.fuel
  const takeoffW = stations.reduce((sum, st) => sum + st.weight, 0)

  const bambiWaterW  = (s.bambiMode === 'hook' && s.bambiFill > 0) ? Math.round(680 * s.bambiFill / 100) : 0
  const extW         = s.externalLoad + bambiWaterW
  const internalW    = takeoffW - extW
  const customW      = s.customStations.reduce((a, cs) => a + cs.weight, 0)

  const ogeLimit = useMemo(() => getOGE(s.altitude, s.temperature, s.bambiMode, s.bambiFill),
    [s.altitude, s.temperature, s.bambiMode, s.bambiFill])

  const mtowEffective = (s.max3800Approved && ogeLimit >= MTOW_APPROVED) ? MTOW_APPROVED : MTOW_BASE

  const bambiLimits = useMemo(() => {
    if (s.bambiMode !== 'hook' || s.bambiFill === 0) return null
    return MAX_BAMBI_BY_OGE_TABLE.find(r => r.bambiFill === s.bambiFill) ?? null
  }, [s.bambiMode, s.bambiFill])

  const maxInternalLimit = bambiLimits ? bambiLimits.maxInternalWeight : mtowEffective
  const maxFuelByBambi   = bambiLimits ? bambiLimits.maxFuel : FUEL_MAX
  const maxFuelByMTOW    = Math.floor(mtowEffective - (takeoffW - fuelW))
  const maxFuelByOGE     = Math.floor(ogeLimit - (takeoffW - fuelW))
  const maxFuelAllowed   = Math.max(FUEL_MIN, Math.min(FUEL_MAX, maxFuelByBambi, maxFuelByMTOW, maxFuelByOGE))

  const overMTOW     = takeoffW  > mtowEffective
  const overOGE      = takeoffW  > ogeLimit
  const overInternal = internalW > maxInternalLimit

  const longEnv  = useMemo<[number, number][]>(() => getLongEnvelope(extW, s.bambiMode, s.bambiFill), [extW, s.bambiMode, s.bambiFill])
  const cgLongOK = takeoffW < 1500 || isInPolygon(longCG, takeoffW, longEnv)
  const cgLatOK  = Math.abs(latCG) < 0.15

  const ok = !overMTOW && !overOGE && !overInternal && cgLongOK && cgLatOK

  // ── CG אמצע ונחיתה ──
  const fuelMid   = Math.round((s.fuel + FUEL_LANDING) / 2)
  const cgMid     = useMemo(() => calcCG(buildStations(s, fuelMid)),     [s, fuelMid])
  const cgLanding = useMemo(() => calcCG(buildStations(s, FUEL_LANDING)), [s])

  const longDots = [
    { x: longCG,           y: takeoffW },
    { x: cgMid.longCG,     y: cgMid.weight },
    { x: cgLanding.longCG, y: cgLanding.weight },
  ]
  const latDots = [
    { x: latCG,           y: takeoffW },
    { x: cgMid.latCG,     y: cgMid.weight },
    { x: cgLanding.latCG, y: cgLanding.weight },
  ]

  // ── Toasts ──
  useEffect(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      const checks: [boolean, keyof typeof prevV.current, string, boolean][] = [
        [overMTOW,     'mtow',     `⛔ חריגה ממשקל מקס' (${mtowEffective} ק"ג)`, true],
        [overInternal, 'internal', `⛔ חריגה ממשקל פנימי מקס' (${maxInternalLimit.toFixed(0)} ק"ג)`, true],
        [overOGE,      'oge',      `⚠️ חריגה ממגבלת מנוע (${ogeLimit} ק"ג)`, false],
        [!cgLongOK,    'cgLong',   '⚠️ מרכז כובד אורכי מחוץ למעטפת', false],
        [!cgLatOK,     'cgLat',    '⚠️ מרכז כובד רוחבי מחוץ למעטפת', false],
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
  }, [overMTOW, overInternal, overOGE, cgLongOK, cgLatOK, mtowEffective, maxInternalLimit, ogeLimit])

  // ── הפעלת BAMBI — כמו H125: מחשבת דלק בטוח ומורידה אוטומטית ──
  function handleBambiEnable() {
    setS(p => {
      const bambiRow = MAX_BAMBI_BY_OGE_TABLE.find(r => r.bambiFill === 70)!
      const ogeLimit = getOGE(p.altitude, p.temperature, 'hook', 70)
      const mtow = (p.max3800Approved && ogeLimit >= MTOW_APPROVED) ? MTOW_APPROVED : MTOW_BASE
      const newState: AppState = { ...p, bambiMode: 'hook', bambiFill: 70, pilotR: 80, pilotL: 80 }
      const weightNoFuel = buildStations(newState, 0).reduce((sum, st) => sum + st.weight, 0)
      const bambiWaterW = Math.round(680 * 70 / 100)
      const safeFuel = Math.max(FUEL_MIN, Math.min(
        FUEL_MAX,
        bambiRow.maxFuel,
        Math.floor(ogeLimit - weightNoFuel),
        Math.floor(mtow    - weightNoFuel),
        Math.floor(bambiRow.maxInternalWeight + bambiWaterW - weightNoFuel),
      ))
      return { ...newState, fuel: Math.min(p.fuel, safeFuel) }
    })
  }

  // ── תחנות ידניות ──
  function addCustomStation() {
    set('customStations', [...s.customStations, { name: '', weight: 0, longArm: 4.5 }])
  }
  function removeCustomStation(i: number) {
    set('customStations', s.customStations.filter((_, idx) => idx !== i))
  }
  function updateCustomStation(i: number, field: keyof CustomStation, val: string | number) {
    set('customStations', s.customStations.map((cs, idx) => idx === i ? { ...cs, [field]: val } : cs))
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100">

      <header className="bg-blue-900 text-white px-4 py-3 sticky top-0 z-10 shadow">
        <div className="text-base font-bold">משקל ואיזון — H145</div>
        <div className="text-blue-300 text-xs">חישוב משקל ואיזון</div>
      </header>

      <div className="flex bg-blue-800 text-white text-sm sticky top-[52px] z-10">
        <button onClick={() => setTab('main')}
          className={`flex-1 py-2 font-medium transition-colors ${tab==='main' ? 'bg-blue-600' : 'hover:bg-blue-700'}`}>
          ראשי
        </button>
        <button onClick={() => setTab('tech')}
          className={`flex-1 py-2 font-medium transition-colors ${tab==='tech' ? 'bg-blue-600' : 'hover:bg-blue-700'}`}>
          בקרת מרכז כובד
        </button>
      </div>

      <div className="max-w-lg mx-auto p-3 space-y-3 pb-36">
        {tab === 'main' && (
          <>
            {/* גודל טקסט */}
            <div className="bg-white rounded-xl shadow-sm px-4 py-1.5 flex items-center justify-between">
              <span className="text-sm text-slate-700">גודל טקסט</span>
              <div className="flex items-center gap-2" dir="ltr">
                <span style={{ fontSize: '14px' }} className="text-slate-400">א</span>
                <button onClick={() => setLargeText(v => !v)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0
                    ${largeText ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
                    ${largeText ? 'right-0.5' : 'left-0.5'}`} />
                </button>
                <span style={{ fontSize: '22px' }} className="font-bold text-blue-600">א</span>
              </div>
            </div>

            {/* מסוק ותצורה */}
            <Card title="מסוק">
              <div className="grid grid-cols-2 gap-2">
                <Field label="זנב">
                  <Sel value={s.helicopter} onChange={v => set('helicopter', v)}
                    opts={HELICOPTERS.map(h => h.id)} />
                </Field>
                <Field label="תצורה">
                  <Sel value={s.config} onChange={v => set('config', v)}
                    opts={CONFIGS.map(c => c.id)}
                    labels={CONFIGS.map(c => `${c.id}: ${c.name}`)} />
                </Field>
              </div>
            </Card>

            {/* ציוד */}
            <Card title="ציוד">
              <div className="space-y-2">
                <Field label="מערכת תצפית">
                  <Sel value={s.system} onChange={v => set('system', v as AppState['system'])}
                    opts={['ללא', 'SHAPO', 'DSP-HD']}
                    labels={['ללא', 'SHAPO (מערכת קטנה)', 'DSP-HD (מערכת גדולה)']} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Tog label="פנס Nightsun XP" value={s.xp} onChange={v => set('xp', v)} />
                  <Tog label="רמקולי כריזה"    value={s.pa} onChange={v => set('pa', v)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Tog label="וו מטען" value={s.cargoHook} onChange={v => set('cargoHook', v)} />
                  <Tog label="מראות וו" value={s.cargoMirrors} onChange={v => set('cargoMirrors', v)}
                    disabled={!s.cargoHook} />
                </div>
                <Field label="מתקן גלישה (FR)">
                  <Sel value={s.fastRope} onChange={v => set('fastRope', v as FastRope)}
                    opts={['off', 'fixed', 'extended']} labels={['ללא', 'קבוע', 'מורחב']} />
                </Field>
                {/* BAMBI — טוגל + מצב + מילוי + טבלה */}
                <div className="py-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-700">BAMBI</span>
                    <button
                      onClick={() => s.bambiMode !== 'off' ? set('bambiMode', 'off') : handleBambiEnable()}
                      className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0
                        ${s.bambiMode !== 'off' ? 'bg-blue-600' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
                        ${s.bambiMode !== 'off' ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {s.bambiMode !== 'off' && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-slate-200">
                      {/* מצב חיבור: וו / בטן */}
                      <div className="flex gap-1 p-2 bg-slate-50 border-b border-slate-100">
                        {(['hook', 'cabin'] as const).map(mode => (
                          <button key={mode}
                            onClick={() => setS(p => ({ ...p, bambiMode: mode, bambiFill: mode === 'hook' ? Math.max(70, p.bambiFill) : 0 }))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                              ${s.bambiMode === mode
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
                            {mode === 'hook' ? 'וו חיצוני' : 'בטן'}
                          </button>
                        ))}
                      </div>

                      {s.bambiMode === 'hook' ? (<>
                        {/* בחירת % מילוי */}
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
                              <th className="py-1.5 font-medium text-center">פנימי מקס'</th>
                              <th className="py-1.5 font-medium text-center">דלק מקס'</th>
                            </tr>
                          </thead>
                          <tbody>
                            {MAX_BAMBI_BY_OGE_TABLE.map(row => {
                              const water = Math.round(680 * row.bambiFill / 100)
                              const sel   = s.bambiFill === row.bambiFill
                              return (
                                <tr key={row.bambiFill} onClick={() => set('bambiFill', row.bambiFill)}
                                  className={`cursor-pointer border-b border-slate-50 last:border-0 transition-colors
                                    ${sel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                                  <td className={`py-1.5 text-center ${sel ? 'font-bold text-blue-700' : 'text-slate-600'}`}>
                                    {row.bambiFill}%
                                  </td>
                                  <td className={`py-1.5 text-center ${sel ? 'font-bold text-blue-700' : ''}`}>{water}</td>
                                  <td className={`py-1.5 text-center ${sel ? 'font-bold text-blue-700' : ''}`}>
                                    {row.maxInternalWeight.toFixed(0)}
                                  </td>
                                  <td className={`py-1.5 text-center font-bold
                                    ${row.maxFuel < 150 ? 'text-red-600' : row.maxFuel < 300 ? 'text-orange-500' : 'text-green-700'}`}>
                                    {row.maxFuel}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </>) : (
                        /* מצב בטן — מיכל ריק בקבינה */
                        <div className="px-3 py-3 bg-white text-xs text-slate-600 space-y-0.5">
                          <div className="font-bold text-slate-700">מיכל ריק — {E['BAMBI BUCKET IN CABIN'].weight} ק"ג</div>
                          <div className="text-slate-400">נחשב למשקל פנימי · מגבלות רגילות (ללא הוו)</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* פירוט תצורה */}
            <Card title={
              <button onClick={() => setShowConfigDetail(v => !v)}
                className="flex items-center justify-between w-full">
                <span>פירוט תצורה: {cfg.name}</span>
                <span className="text-xs text-slate-400">{showConfigDetail ? '▲' : '▼'}</span>
              </button>
            }>
              {showConfigDetail && (
                <div className="space-y-1 text-xs">
                  <R2 l="מסוק"  v={`${s.helicopter} (${heli.emptyWeight} ק"ג)`} />
                  <R2 l="תצורה" v={`${cfg.id}: ${cfg.name} (${cfg.seats.length} כסאות)`} />
                  <R2 l="מערכת" v={s.system} />
                  <R2 l="פנס"   v={s.xp ? 'XP' : 'ללא'} />
                  <R2 l="כריזה" v={s.pa ? 'כן' : 'לא'} />
                  <R2 l="וו"    v={s.cargoHook ? (s.cargoMirrors ? 'וו + מראות' : 'וו בלבד') : 'ללא'} />
                  <R2 l="FR"    v={s.fastRope === 'off' ? 'ללא' : s.fastRope === 'fixed' ? 'קבוע' : 'מורחב'} />
                  <R2 l="BAMBI" v={s.bambiMode === 'off' ? 'ללא' : s.bambiMode === 'cabin' ? 'בקבינה' : `על הוו ${s.bambiFill}%`} />
                </div>
              )}
            </Card>

            {/* צוות ונוסעים */}
            <Card title="צוות ונוסעים">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Field label="טייס ימין"><Num value={s.pilotR} onChange={v => set('pilotR', v)} max={150} /></Field>
                <Field label="טייס שמאל"><Num value={s.pilotL} onChange={v => set('pilotL', v)} max={150} /></Field>
              </div>
              {cfg.seats.length > 0 ? (
                <div className="space-y-2">
                  {cfg.seats.map((seat, i) => (
                    <Field key={i} label={seat.label}>
                      <Num value={s.passengers[i] ?? 0}
                        onChange={v => setS(p => ({ ...p, passengers: p.passengers.map((x, j) => j === i ? v : x) }))}
                        max={150} />
                    </Field>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-2">תצורה ללא כסאות נוסעים</div>
              )}
            </Card>

            {/* דלק ומשקל על הוו */}
            <Card title="דלק ומשקל על הוו">
              <div className="grid grid-cols-2 gap-2">
                <Field label={`דלק (מקס ${maxFuelAllowed})`}>
                  <Num value={s.fuel} onChange={v => set('fuel', v)} max={FUEL_MAX} step={10} />
                </Field>
                <Field label="משקל על הוו">
                  <Num value={s.externalLoad} onChange={v => set('externalLoad', v)} max={1500} step={10} />
                </Field>
              </div>
            </Card>

            {/* תחנות ידניות */}
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
                    <input type="number" inputMode="decimal" step="0.01"
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

            {/* תנאי שטח */}
            <Card title="תנאי שטח">
              <div className="grid grid-cols-2 gap-2">
                <Field label="גובה (רגל)">
                  <Sel value={String(s.altitude)} onChange={v => set('altitude', +v)}
                    opts={['0','500','1000','1500','2000','2500','3000','3500','4000']} />
                </Field>
                <Field label="טמפ' (°C)">
                  <Sel value={String(s.temperature)} onChange={v => set('temperature', +v)}
                    opts={['10','15','20','25','30','35','40']} />
                </Field>
              </div>
            </Card>

            {/* תוצאות */}
            <Card title="תוצאות">
              <div className="space-y-1 mb-2">
                <WR l="משקל ריק"    v={heli.emptyWeight} />
                <WR l="ציוד"        v={equipmentStations(s).reduce((sum, e) => sum + e.weight, 0)} />
                <WR l="כסאות + נוסעים" v={cfg.seats.reduce((sum, seat, i) => sum + seat.weight + (s.passengers[i] ?? 0), 0)} />
                <WR l="צוות"        v={s.pilotR + s.pilotL} />
                {customW > 0 && <WR l="תחנות נוספות" v={customW} />}
                {extW > 0    && <WR l="עומס חיצוני"  v={extW} />}
                <div className="border-b border-slate-50 pb-0.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">דלק</span>
                    <span className="font-medium text-slate-700">
                      {fuelW.toFixed(0)} ק"ג{' '}
                      <span className="font-bold">
                        ({Math.max(0, Math.floor((fuelW - FUEL_LANDING) / FUEL_BURN))} דק' טיסה)
                      </span>
                    </span>
                  </div>
                  <div className="text-[0.6875rem] text-slate-400 text-left">
                    לפי {FUEL_LANDING} ק"ג לנחיתה ו-{FUEL_BURN} ק"ג/דקה
                  </div>
                </div>
                <WR l="משקל המראה" v={takeoffW} bold />
              </div>

              <div className="space-y-2 mb-3">
                <LimitBar label={`מגבלת מבנה (${mtowEffective} ק"ג)`}
                  actual={takeoffW} max={mtowEffective} over={overMTOW} />
                {bambiLimits && (
                  <LimitBar label={`מגבלת פנימי עם BAMBI (${maxInternalLimit.toFixed(0)} ק"ג)`}
                    actual={internalW} max={maxInternalLimit} over={overInternal} />
                )}
                <LimitBar label={`מגבלת מנוע OGE (${ogeLimit} ק"ג)`}
                  actual={takeoffW} max={ogeLimit} over={overOGE} />
              </div>

              <div className="border-t pt-2 space-y-2">
                <CGLongBar cgTake={longCG} cgLand={cgLanding.longCG} weight={takeoffW} env={longEnv} />
                <CGLatBar cg={latCG} ok={cgLatOK} />
              </div>

              <div className="mt-3 border-t pt-2">
                <Tog label="אישור חריג MTOW 3800 ק״ג" value={s.max3800Approved}
                  onChange={v => set('max3800Approved', v)}
                  disabled={ogeLimit < MTOW_APPROVED}
                  disabledReason={`OGE מגביל ל-${ogeLimit} ק"ג`} />
              </div>
            </Card>
          </>
        )}

        {tab === 'tech' && (
          <>
            {/* טבלת תחנות */}
            <Card title="טבלת תחנות">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs min-w-[420px]">
                  <thead>
                    <tr className="border-b-2 border-slate-300 text-slate-500 bg-slate-50">
                      <th className="pb-1.5 pt-1 font-medium text-right pr-1">תחנה</th>
                      <th className="pb-1.5 pt-1 font-medium text-center">משקל</th>
                      <th className="pb-1.5 pt-1 font-medium text-center">LONG</th>
                      <th className="pb-1.5 pt-1 font-medium text-center border-l border-slate-200">מ. אורכי</th>
                      <th className="pb-1.5 pt-1 font-medium text-center">LAT</th>
                      <th className="pb-1.5 pt-1 font-medium text-center">מ. רוחבי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['מסוק', 'מערכות', 'אנשים', 'דלק', 'אחר'] as StationGroup[]).map(group => {
                      const rows = stations.filter(st => st.group === group)
                      if (rows.length === 0) return null
                      const gW    = rows.reduce((a, st) => a + st.weight, 0)
                      const gLM   = rows.reduce((a, st) => a + st.weight * st.longArm, 0)
                      const gLatM = rows.reduce((a, st) => a + st.weight * st.latArm, 0)
                      return (
                        <Fragment key={group}>
                          <tr className="bg-blue-50">
                            <td colSpan={6} className="py-1 pr-1 font-bold text-blue-800">{group}</td>
                          </tr>
                          {rows.map((st, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="py-1 pr-1 text-right">{st.name}</td>
                              <td className="py-1 text-center">{st.weight.toFixed(1)}</td>
                              <td className="py-1 text-center text-slate-500">{st.longArm.toFixed(3)}</td>
                              <td className="py-1 text-center font-medium border-l border-slate-200">{(st.weight * st.longArm).toFixed(1)}</td>
                              <td className="py-1 text-center text-slate-500">{st.latArm.toFixed(3)}</td>
                              <td className="py-1 text-center font-medium">{(st.weight * st.latArm).toFixed(1)}</td>
                            </tr>
                          ))}
                          {group !== 'מסוק' && (
                            <tr className="bg-slate-50 text-slate-500 font-medium">
                              <td className="py-1 pr-1 text-slate-400">סכום</td>
                              <td className="py-1 text-center">{gW.toFixed(1)}</td>
                              <td className="py-1 text-center">—</td>
                              <td className="py-1 text-center border-l border-slate-200">{gLM.toFixed(1)}</td>
                              <td className="py-1 text-center">—</td>
                              <td className="py-1 text-center">{gLatM.toFixed(1)}</td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                    <tr className="font-bold bg-blue-900 text-white border-t-2 border-slate-300">
                      <td className="py-1.5 pr-1">סה"כ</td>
                      <td className="py-1.5 text-center">{takeoffW.toFixed(1)}</td>
                      <td className="py-1.5 text-center">{longCG.toFixed(3)}</td>
                      <td className="py-1.5 text-center border-l border-blue-700">{(takeoffW * longCG).toFixed(1)}</td>
                      <td className="py-1.5 text-center">{latCG.toFixed(3)}</td>
                      <td className="py-1.5 text-center">{(takeoffW * latCG).toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </Card>

            {/* גרפי CG */}
            <Card title="גרפי מרכז כובד">
              <CGChart2D
                title="מעטפת אורכית"
                poly={longEnv}
                dots={longDots}
                xMin={4.20} xMax={4.82}
                xTicks={[4.30, 4.40, 4.50, 4.60, 4.70, 4.80]}
              />
              <CGChart2DLat
                title="מעטפת רוחבית (±0.15 מ')"
                dots={latDots}
              />
            </Card>
          </>
        )}
      </div>

      {/* Toasts */}
      <div className="fixed top-4 inset-x-3 z-50 space-y-2 pointer-events-none max-w-sm mx-auto">
        {toasts.map(t => (
          <div key={t.id}
            className={`rounded-xl px-4 py-3 text-white text-sm font-bold shadow-xl pointer-events-auto
              flex items-center justify-between gap-3
              ${t.error ? 'bg-red-600' : 'bg-orange-500'}`}>
            <span>{t.msg}</span>
            <button onClick={() => dismissToast(t.id)}
              className="flex-shrink-0 bg-black/25 hover:bg-black/40 active:bg-black/50
                rounded-lg px-3 py-1 text-xs font-bold transition-colors">
              אישור
            </button>
          </div>
        ))}
      </div>

      {/* Bottom banner */}
      <div className="fixed bottom-0 inset-x-0 z-20 shadow-[0_-3px_16px_rgba(0,0,0,0.25)]">
        <div className={`text-white transition-colors duration-300 ${
          ok
            ? 'bg-green-800'
            : (overMTOW || overInternal || overOGE)
              ? 'bg-red-700'
              : 'bg-orange-600'
        }`}>
          <div className="max-w-lg mx-auto px-3 pt-2 pb-3">
            <div className="mb-2">
              <span className="font-bold text-[0.9625rem]">
                {ok ? '✅ מאושר לטיסה' : '⛔ לא מאושר לטיסה'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <BannerCell label="משקל / מבנה"
                value={`${takeoffW.toFixed(0)}/${mtowEffective}`}
                ok={!overMTOW && !overInternal} />
              <BannerCell label="מנוע OGE"
                value={`${takeoffW.toFixed(0)}/${ogeLimit}`}
                ok={!overOGE} />
            </div>
            {(!cgLongOK || !cgLatOK) && (
              <div className={`mt-1.5 grid gap-1.5 ${!cgLongOK && !cgLatOK ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {!cgLongOK && <BannerCell label="מ.כ. אורכי" value={`${longCG.toFixed(3)} מ'`} ok={false} />}
                {!cgLatOK  && <BannerCell label="מ.כ. רוחבי" value={`${latCG.toFixed(3)} מ'`} ok={false} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── רכיבי UI ────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm p-4">
      {title && <div className="font-bold text-slate-800 text-sm mb-3 border-b pb-1">{title}</div>}
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

function Sel({ value, onChange, opts, labels }:
  { value: string; onChange: (v: string) => void; opts: readonly string[]; labels?: readonly string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white">
      {opts.map((o, i) => <option key={o} value={o}>{labels?.[i] ?? o}</option>)}
    </select>
  )
}

function Num({ value, onChange, step = 5, min = 0, max }: {
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

function Tog({ label, value, onChange, disabled, disabledReason }:
  { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; disabledReason?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className={`text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}
        title={disabled ? disabledReason : undefined}>{label}</span>
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

function WR({ l, v, bold }: { l: string; v: number; bold?: boolean }) {
  if (bold) {
    return (
      <div className="flex justify-between border-t-2 border-slate-300 pt-1 font-bold">
        <span>{l}</span>
        <span>{v.toFixed(0)} ק"ג</span>
      </div>
    )
  }
  return (
    <div className="flex justify-between border-b border-slate-50 pb-0.5">
      <span className="text-slate-500">{l}</span>
      <span className="font-medium text-slate-700">{v.toFixed(0)} ק"ג</span>
    </div>
  )
}

function R2({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{l}</span><span>{v}</span>
    </div>
  )
}

function LimitBar({ label, actual, max, over }:
  { label: string; actual: number; max: number; over: boolean }) {
  const pct = Math.min((actual / max) * 100, 100)
  return (
    <div className={`rounded-lg p-2 ${over ? 'bg-red-50' : 'bg-slate-50'}`}>
      <div className="flex justify-between items-start text-xs mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={`font-bold whitespace-nowrap ${over ? 'text-red-700' : 'text-slate-600'}`}>
          {actual.toFixed(0)} / {max} ק"ג
        </span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${over ? 'bg-red-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BannerCell({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`rounded-lg px-1.5 py-1.5 text-center transition-colors
      ${ok ? 'bg-white/10' : 'bg-black/20 ring-1 ring-yellow-400/40'}`}>
      <div className="text-[0.5625rem] opacity-75 leading-tight mb-0.5">{label}</div>
      <div className={`text-[0.6875rem] font-bold leading-tight ${!ok ? 'text-yellow-300' : ''}`}>
        {!ok && '⛔ '}{value}
      </div>
    </div>
  )
}

// ── CGLongBar — פס CG אורכי ──
function CGLongBar({ cgTake, cgLand, weight, env }: {
  cgTake: number; cgLand: number; weight: number; env: [number, number][]
}) {
  const CG_VIS_MIN = 4.15, CG_VIS_MAX = 4.85
  const range  = CG_VIS_MAX - CG_VIS_MIN
  const limits = getCGLimitsAtWeight(weight, env)
  const fwdPct = limits ? ((limits.fwd - CG_VIS_MIN) / range) * 100 : 20
  const aftPct = limits ? ((limits.aft - CG_VIS_MIN) / range) * 100 : 80
  const pct    = (cg: number) => Math.min(100, Math.max(0, ((cg - CG_VIS_MIN) / range) * 100))
  const tp = pct(cgTake), lp = pct(cgLand)
  const okT = weight < 1500 || (limits ? cgTake >= limits.fwd && cgTake <= limits.aft : true)
  const okL = limits ? cgLand >= limits.fwd && cgLand <= limits.aft : true
  const delta  = cgLand - cgTake
  const midPct = Math.min(tp, lp) + Math.abs(tp - lp) / 2

  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-slate-600 mb-1">מרכז כובד אורכי</div>
      {/* ערך המראה מעל הבר */}
      <div className="relative text-[0.5625rem] h-3 mb-0.5" dir="ltr">
        <span className={`absolute font-medium ${okT ? 'text-green-700' : 'text-red-600'}`}
          style={{ left: `${tp}%`, transform: 'translateX(-50%)' }}>{cgTake.toFixed(2)}</span>
      </div>
      <div className="relative h-5 bg-slate-200 rounded-full">
        {/* אזור ירוק */}
        <div className="absolute top-0 h-full bg-green-200 rounded-full"
          style={{ left: `${fwdPct}%`, width: `${aftPct - fwdPct}%` }} />
        {/* קו מסלול */}
        <div className={`absolute top-[8px] h-[4px] rounded ${okT && okL ? 'bg-sky-300' : 'bg-orange-300'}`}
          style={{ left: `${Math.min(tp, lp)}%`, width: `${Math.max(Math.abs(tp - lp), 0.5)}%` }} />
        {/* חץ כיוון */}
        {Math.abs(delta) > 0.001 && (
          <span className={`absolute text-[0.625rem] font-bold leading-none pointer-events-none select-none
            ${delta < 0 ? 'text-blue-700' : 'text-orange-600'}`}
            style={{ top: '3px', left: `${midPct}%`, transform: 'translateX(-50%)' }}>
            {delta < 0 ? '←' : '→'}
          </span>
        )}
        {/* נקודת נחיתה */}
        <div className={`absolute top-1 w-3 h-3 rounded-full border-2 bg-white shadow-sm
          ${okL ? 'border-sky-500' : 'border-red-500'}`}
          style={{ left: `${lp}%`, transform: 'translateX(-50%)' }} />
        {/* נקודת המראה */}
        <div className={`absolute top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm
          ${okT ? 'bg-green-600' : 'bg-red-500'}`}
          style={{ left: `${tp}%`, transform: 'translateX(-50%)' }} />
      </div>
      {/* גבולות מעטפת */}
      {limits && (
        <div className="relative text-[0.5625rem] text-slate-400 h-3 mt-0.5" dir="ltr">
          <span className="absolute" style={{ left: `${fwdPct}%`, transform: 'translateX(-50%)' }}>
            {limits.fwd.toFixed(2)}
          </span>
          <span className="absolute" style={{ left: `${aftPct}%`, transform: 'translateX(-50%)' }}>
            {limits.aft.toFixed(2)}
          </span>
        </div>
      )}
      {/* ערך נחיתה */}
      <div className="relative text-[0.5625rem] h-3 mt-0.5" dir="ltr">
        <span className={`absolute font-medium ${okL ? 'text-sky-600' : 'text-red-600'}`}
          style={{ left: `${lp}%`, transform: 'translateX(-50%)' }}>{cgLand.toFixed(2)}</span>
      </div>
      {/* מקרא */}
      <div className="flex gap-3 text-[0.5625rem] mt-1.5 text-slate-400 items-center" dir="ltr">
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-3 h-3 rounded-full bg-green-600 border-2 border-white shadow-sm" />
          המראה
        </span>
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-3 h-3 rounded-full bg-white border-2 border-sky-500 shadow-sm" />
          נחיתה
        </span>
      </div>
    </div>
  )
}

// ── CGLatBar — פס CG רוחבי ──
function CGLatBar({ cg, ok }: { cg: number; ok: boolean }) {
  const LAT_LIMIT = 0.15
  const xMin = -0.22, xMax = 0.22
  const range  = xMax - xMin
  const limLpct = ((-LAT_LIMIT - xMin) / range) * 100
  const limRpct = (( LAT_LIMIT - xMin) / range) * 100
  const zeroPct = ((0          - xMin) / range) * 100
  const cgPct   = Math.min(100, Math.max(0, ((cg - xMin) / range) * 100))
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-1">מרכז כובד רוחבי</div>
      <div className="relative h-5 bg-slate-200 rounded-full">
        <div className="absolute top-0 h-full bg-green-200 rounded-full"
          style={{ left: `${limLpct}%`, width: `${limRpct - limLpct}%` }} />
        <div className="absolute top-0 w-px h-full bg-slate-400/60" style={{ left: `${zeroPct}%` }} />
        <div className={`absolute top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm
          ${ok ? 'bg-green-600' : 'bg-red-500'}`}
          style={{ left: `${cgPct}%`, transform: 'translateX(-50%)' }} />
      </div>
      <div className="relative text-[0.5625rem] mt-0.5 text-slate-400 h-3" dir="ltr">
        <span className="absolute" style={{ left: `${limLpct}%`, transform: 'translateX(-50%)' }}>-{LAT_LIMIT}</span>
        <span className="absolute" style={{ left: `${limRpct}%`, transform: 'translateX(-50%)' }}>{LAT_LIMIT}</span>
      </div>
    </div>
  )
}

// ── CGChart2D — גרף מעטפת אורכית מלא ──
function CGChart2D({ title, poly, dots, xMin, xMax, xTicks }: {
  title: string
  poly: [number, number][]
  dots: { x: number; y: number }[]
  xMin: number; xMax: number
  xTicks: number[]
}) {
  const W = 300, H = 215
  const padL = 42, padR = 10, padT = 12, padB = 28
  const pw = W - padL - padR, ph = H - padT - padB
  const yMin = 1500, yMax = 4000
  const yTicks = [2000, 2500, 3000, 3500]

  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * pw
  const sy = (y: number) => padT + ph * (1 - (y - yMin) / (yMax - yMin))
  const ptsStr = poly.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')
  const trackPts = dots.map(d => `${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join(' ')
  return (
    <div className="mb-3">
      <div className="text-xs font-bold text-slate-600 mb-1 text-center">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto border border-slate-200 rounded-lg bg-white">
        <rect x={padL} y={padT} width={pw} height={ph} fill="#f8fafc" />
        {yTicks.map(y => (
          <line key={y} x1={padL} y1={sy(y)} x2={padL + pw} y2={sy(y)}
            stroke="#e2e8f0" strokeWidth="0.5" />
        ))}
        <polygon points={ptsStr}
          fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
        {dots.length > 1 && (
          <polyline points={trackPts}
            fill="none" stroke="#475569" strokeWidth="1.5"
            strokeDasharray="5,3" strokeLinecap="round" />
        )}
        {dots.map((d, i) => {
          const inEnv    = isInPolygon(d.x, d.y, poly)
          const c        = inEnv ? '#16a34a' : '#dc2626'
          const isLanding = i === dots.length - 1
          return (
            <circle key={i} cx={sx(d.x)} cy={sy(d.y)}
              r={i === 0 ? 5.5 : 4}
              fill={isLanding ? 'white' : (i === 1 ? '#94a3b8' : c)}
              stroke={isLanding ? (inEnv ? '#0284c7' : '#dc2626') : 'white'}
              strokeWidth="1.8" />
          )
        })}
        <rect x={padL} y={padT} width={pw} height={ph} fill="none" stroke="#94a3b8" strokeWidth="1" />
        {yTicks.map(y => (
          <text key={y} x={padL - 3} y={sy(y) + 3.5} textAnchor="end" fontSize="8" fill="#64748b">{y}</text>
        ))}
        {xTicks.map(x => (
          <text key={x} x={sx(x)} y={padT + ph + 14} textAnchor="middle" fontSize="8" fill="#64748b">
            {x.toFixed(2)}
          </text>
        ))}
        <text x={10} y={padT + ph / 2} fontSize="8" fill="#94a3b8"
          transform={`rotate(-90, 10, ${padT + ph / 2})`} textAnchor="middle">kg</text>
      </svg>
      <div className="text-center text-[0.5625rem] text-slate-400 -mt-0.5 mb-1">m</div>
      <CGLegend />
    </div>
  )
}

// ── CGChart2DLat — גרף מעטפת רוחבית ──
function CGChart2DLat({ title, dots }: {
  title: string
  dots: { x: number; y: number }[]
}) {
  const W = 300, H = 215
  const padL = 42, padR = 10, padT = 12, padB = 28
  const pw = W - padL - padR, ph = H - padT - padB
  const xMin = -0.24, xMax = 0.24
  const yMin = 1500, yMax = 4000
  const yTicks = [2000, 2500, 3000, 3500]
  const xTicks = [-0.20, -0.10, 0, 0.10, 0.20]
  const LAT_LIMIT = 0.15

  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * pw
  const sy = (y: number) => padT + ph * (1 - (y - yMin) / (yMax - yMin))

  const latPoly: [number, number][] = [
    [-LAT_LIMIT, yMin], [-LAT_LIMIT, yMax], [LAT_LIMIT, yMax], [LAT_LIMIT, yMin],
  ]
  const ptsStr = latPoly.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')
  const trackPts = dots.map(d => `${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join(' ')

  return (
    <div className="mb-3">
      <div className="text-xs font-bold text-slate-600 mb-1 text-center">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto border border-slate-200 rounded-lg bg-white">
        <rect x={padL} y={padT} width={pw} height={ph} fill="#f8fafc" />
        {yTicks.map(y => (
          <line key={y} x1={padL} y1={sy(y)} x2={padL + pw} y2={sy(y)}
            stroke="#e2e8f0" strokeWidth="0.5" />
        ))}
        <line x1={sx(0)} y1={padT} x2={sx(0)} y2={padT + ph} stroke="#cbd5e1" strokeWidth="0.8" />
        <polygon points={ptsStr}
          fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth="1.5" />
        {dots.length > 1 && (
          <polyline points={trackPts}
            fill="none" stroke="#475569" strokeWidth="1.5"
            strokeDasharray="5,3" strokeLinecap="round" />
        )}
        {dots.map((d, i) => {
          const inEnv    = Math.abs(d.x) <= LAT_LIMIT
          const c        = inEnv ? '#16a34a' : '#dc2626'
          const isLanding = i === dots.length - 1
          return (
            <circle key={i} cx={sx(d.x)} cy={sy(d.y)}
              r={i === 0 ? 5.5 : 4}
              fill={isLanding ? 'white' : (i === 1 ? '#94a3b8' : c)}
              stroke={isLanding ? (inEnv ? '#0284c7' : '#dc2626') : 'white'}
              strokeWidth="1.8" />
          )
        })}
        <rect x={padL} y={padT} width={pw} height={ph} fill="none" stroke="#94a3b8" strokeWidth="1" />
        {yTicks.map(y => (
          <text key={y} x={padL - 3} y={sy(y) + 3.5} textAnchor="end" fontSize="8" fill="#64748b">{y}</text>
        ))}
        {xTicks.map(x => (
          <text key={x} x={sx(x)} y={padT + ph + 14} textAnchor="middle" fontSize="8" fill="#64748b">
            {x.toFixed(2)}
          </text>
        ))}
        <text x={10} y={padT + ph / 2} fontSize="8" fill="#94a3b8"
          transform={`rotate(-90, 10, ${padT + ph / 2})`} textAnchor="middle">kg</text>
      </svg>
      <div className="text-center text-[0.5625rem] text-slate-400 -mt-0.5 mb-1">m</div>
      <CGLegend />
    </div>
  )
}

function CGLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.5625rem] text-slate-400 items-center justify-center">
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-2.5 rounded-sm bg-blue-100 border border-blue-400" />
        מעטפת
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600 border-2 border-white shadow-sm" />
        המראה
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400 border border-white shadow-sm" />
        אמצע
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border-2 border-sky-500 shadow-sm" />
        נחיתה
      </span>
    </div>
  )
}
