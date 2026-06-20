import { useState, useEffect, useRef, useMemo } from 'react'
import './index.css'
import {
  HELICOPTERS, EQUIPMENT, CONFIGS,
  CG_LONG_ENVELOPE, OGE_TABLES, FUEL_CG_TABLE, MAX_BAMBI_BY_OGE_TABLE,
} from './data'

// ─── קבועים ─────────────────────────────────────────────────────────────────────

const MTOW_BASE     = 3700   // ק"ג — בסיס
const MTOW_APPROVED = 3800   // ק"ג — מאושר חריג
const FUEL_MAX      = 723    // ק"ג — מקס דלק פיזי
const FUEL_MIN      = 40     // ק"ג — מינימום לחישוב
const FUEL_BURN     = 4.0    // ק"ג/דקה — קצב שריפה משוער (לאמת AFM)
const FUEL_LANDING  = 100    // ק"ג — מינימום לנחיתה (לחישוב זמן טיסה)

// ציוד לפי שמות מהקובץ data.ts
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

// טבלת OGE לפי מצב BAMBI — לוקח את הטבלה המתאימה ועושה lookup שמרני (ceiling)
function getOgeKey(bambiMode: BambiMode, bambiFill: number): keyof typeof OGE_TABLES {
  if (bambiMode === 'hook' && bambiFill >= 100) return 'CARGO100'
  if (bambiMode === 'hook' && bambiFill >= 90)  return 'CARGO90'
  if (bambiMode === 'hook' && bambiFill >= 80)  return 'CARGO80'
  // ברירת מחדל (כולל cabin ו-off): CARGO70 (המקלה ביותר מבין הקיימים)
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

// חיפוש CG דלק בטבלה — nearest mass
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

// בחירת מעטפת CG אורכי לפי עומס חיצוני (cargoWeight) — מ-CARGO baseline
function getLongEnvelope(cargoWeight: number): [number, number][] {
  const env = CG_LONG_ENVELOPE.CARGO
  // נמצא את ה-band הקרוב למעלה (שמרני)
  const bands = [100, 200, 300, 400, 500, 600, 700, 800] as const
  const band = bands.find(b => b >= cargoWeight) ?? 800
  const poly = env.byCargoWeight[band as keyof typeof env.byCargoWeight]
  // סדר A→B→C→D ויצירת polygon סגור
  const a = poly.find(p => p.label === 'A')!
  const b = poly.find(p => p.label === 'B')!
  const c = poly.find(p => p.label === 'C')!
  const d = poly.find(p => p.label === 'D')!
  return [
    [a.longArm, a.weight],
    [b.longArm, b.weight],
    [c.longArm, c.weight],
    [d.longArm, d.weight],
    [a.longArm, a.weight],
  ]
}

// ─── טיפוסים ─────────────────────────────────────────────────────────────────

type BambiMode = 'off' | 'cabin' | 'hook'
type FastRope = 'off' | 'fixed' | 'extended'
type StationGroup = 'מסוק' | 'מערכות' | 'אנשים' | 'דלק' | 'אחר'
interface Station { name: string; weight: number; longArm: number; latArm: number; group: StationGroup }
interface CustomStation { name: string; weight: number; longArm: number }

interface AppState {
  helicopter:    string                // 'BMO' | 'BMP'
  config:        string                // '01' .. '25'
  system:        'ללא' | 'SHAPO' | 'DSP-HD'
  xp:            boolean               // Nightsun XP
  pa:            boolean               // PA Speakers
  cargoHook:     boolean               // וו מטען + מראות (אופציונלי)
  cargoMirrors:  boolean
  fastRope:      FastRope
  bambiMode:     BambiMode
  bambiFill:     number                // 0 | 70 | 80 | 90 | 100
  pilotR:        number
  pilotL:        number
  passengers:    number[]              // משקל לכל מושב לפי תצורה
  externalLoad:  number                // מטען על הוו (לא כולל BAMBI)
  fuel:          number                // ק"ג
  altitude:      number                // רגל: 0,500,...,4000
  temperature:   number                // °C: 10,15,...,40
  max3800Approved: boolean             // אישור חריג 3800
  customStations: CustomStation[]
}

const DEF: AppState = {
  helicopter: 'BMP', config: '01', system: 'DSP-HD',
  xp: true, pa: false, cargoHook: true, cargoMirrors: false,
  fastRope: 'off',
  bambiMode: 'off', bambiFill: 0,
  pilotR: 80, pilotL: 80,
  passengers: [0, 0, 0, 0],
  externalLoad: 0, fuel: 500,
  altitude: 2000, temperature: 20,
  max3800Approved: false,
  customStations: [],
}

interface Toast { id: number; msg: string; error: boolean }

// ─── חישוב משקל ציוד ─────────────────────────────────────────────────────────

function equipmentStations(s: AppState): Station[] {
  const out: Station[] = []
  const add = (name: string, w: number, la: number, lat: number, g: StationGroup = 'מערכות') => {
    if (w > 0) out.push({ name, weight: w, longArm: la, latArm: lat, group: g })
  }
  if (s.system === 'DSP-HD') {
    const c = E['Controp DSP-HD Camera']
    const hc = E['Controp Hand Controller']
    add('מצלמה DSP-HD', c.weight, c.longArm, c.latArm)
    add('שלט יד DSP', hc.weight, hc.longArm, hc.latArm)
  } else if (s.system === 'SHAPO') {
    const c = E['CONTROP IMAGER SHAPO']
    const hc = E['Controp Hand Controller']
    add('מצלמה SHAPO', c.weight, c.longArm, c.latArm)
    add('שלט יד SHAPO', hc.weight, hc.longArm, hc.latArm)
  }
  if (s.xp) {
    const xp = E['Nightsun XP Search Light']
    const hc = E['Nightsun Hand Controller']
    add('פנס Nightsun XP', xp.weight, xp.longArm, xp.latArm)
    add('שלט יד פנס', hc.weight, hc.longArm, hc.latArm)
  }
  if (s.pa) {
    const pa = E['PA Speakers']
    add('רמקולי כריזה', pa.weight, pa.longArm, pa.latArm)
  }
  if (s.cargoHook) {
    const hook = E['CARGO HOOK DOUBLE DET PROVISIONS']
    add('וו מטען', hook.weight, hook.longArm, hook.latArm)
    if (s.cargoMirrors) {
      const m = E['CARGO EXTERNAL MIRRORS']
      add('מראות וו', m.weight, m.longArm, m.latArm)
    }
  }
  if (s.fastRope !== 'off') {
    const r = E['FAST ROPE SYSTEM R']
    const l = E['FAST ROPE SYSTEM L']
    add('FR ימין', r.weight, r.longArm, r.latArm)
    add('FR שמאל', l.weight, l.longArm, l.latArm)
  }
  if (s.bambiMode !== 'off') {
    const bk = E['BAMBI BUCKET IN CABIN']
    if (s.bambiMode === 'cabin') {
      add('BAMBI (בקבינה)', bk.weight, bk.longArm, bk.latArm)
    } else {
      // hook: דלי על הוו — זרוע הוו
      const onHookArm = E['BAMBI BUCKET ON HOOK'].longArm
      add('BAMBI דלי (על הוו)', bk.weight, onHookArm, 0)
    }
  }
  return out
}

function buildStations(s: AppState, fuelOverride?: number): Station[] {
  const heli = HELICOPTERS.find(h => h.id === s.helicopter)!
  const fuel = fuelOverride ?? s.fuel
  const cfg = CONFIGS.find(c => c.id === s.config)!
  const st: Station[] = []
  const add = (name: string, weight: number, longArm: number, latArm: number, group: StationGroup) =>
    st.push({ name, weight, longArm, latArm, group })

  add(`מסוק ריק (${s.helicopter})`, heli.emptyWeight, heli.longArm, heli.latArm, 'מסוק')

  // ציוד
  equipmentStations(s).forEach(e => st.push(e))

  // צוות
  add('טייס ימין', s.pilotR, 2.312, 0.39, 'אנשים')
  add('טייס שמאל', s.pilotL, 2.312, -0.39, 'אנשים')

  // כסאות + נוסעים — לפי התצורה
  cfg.seats.forEach((seat, i) => {
    // משקל הכסא עצמו (תמיד)
    add(`כסא ${i + 1}`, seat.weight, seat.longArm, seat.latArm, 'מערכות')
    const pax = s.passengers[i] ?? 0
    if (pax > 0) add(`נוסע ${i + 1}`, pax, seat.longArm, seat.latArm, 'אנשים')
  })

  // תחנות ידניות
  s.customStations.forEach(cs => {
    if (cs.weight > 0) add(cs.name || 'תחנה נוספת', cs.weight, cs.longArm, 0, 'אחר')
  })

  // עומס חיצוני: BAMBI על הוו + מטען נוסף
  if (s.bambiMode === 'hook' && s.bambiFill > 0) {
    const waterW = Math.round(680 * s.bambiFill / 100)
    if (waterW > 0) {
      const hookArm = E['BAMBI BUCKET ON HOOK'].longArm
      add(`מים BAMBI ${s.bambiFill}%`, waterW, hookArm, 0, 'אחר')
    }
  }
  if (s.externalLoad > 0) {
    add('משקל על הוו', s.externalLoad, E['WEIGHT ON HOOK'].longArm, 0, 'אחר')
  }

  // דלק — CG משתנה לפי מסה!
  if (fuel > 0) {
    const fcg = getFuelCG(fuel)
    add('דלק', fuel, fcg.longArm, fcg.latArm, 'דלק')
  }
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
  // התאם אורך passengers לפי תצורה ברירת מחדל
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
      // אם תצורה השתנתה — התאם אורך passengers
      if (k === 'config') {
        const newCfg = CONFIGS.find(c => c.id === v as string)!
        next.passengers = Array(newCfg.seats.length).fill(0)
      }
      return next
    })
  }

  const dismissToast = (id: number) => setToasts(t => t.filter(x => x.id !== id))

  const cfg = CONFIGS.find(c => c.id === s.config)!
  const heli = HELICOPTERS.find(h => h.id === s.helicopter)!

  // חישובים
  const stations = useMemo(() => buildStations(s), [s])
  const { longCG, latCG } = useMemo(() => calcCG(stations), [stations])

  const fuelW = s.fuel
  const takeoffW = stations.reduce((sum, st) => sum + st.weight, 0)

  const bambiWaterW = (s.bambiMode === 'hook' && s.bambiFill > 0) ? Math.round(680 * s.bambiFill / 100) : 0
  const extW = s.externalLoad + bambiWaterW
  const internalW = takeoffW - extW

  const ogeLimit = useMemo(() => getOGE(s.altitude, s.temperature, s.bambiMode, s.bambiFill),
    [s.altitude, s.temperature, s.bambiMode, s.bambiFill])

  // מגבלת MTOW אפקטיבית
  const mtowEffective = (s.max3800Approved && ogeLimit >= MTOW_APPROVED) ? MTOW_APPROVED : MTOW_BASE

  // מגבלת BAMBI על הוו — לפי טבלה ייעודית
  const bambiLimits = useMemo(() => {
    if (s.bambiMode !== 'hook' || s.bambiFill === 0) return null
    return MAX_BAMBI_BY_OGE_TABLE.find(r => r.bambiFill === s.bambiFill) ?? null
  }, [s.bambiMode, s.bambiFill])

  const maxInternalLimit = bambiLimits ? bambiLimits.maxInternalWeight : mtowEffective
  const maxFuelByBambi = bambiLimits ? bambiLimits.maxFuel : FUEL_MAX
  const maxFuelByMTOW = Math.floor(mtowEffective - (takeoffW - fuelW))
  const maxFuelByOGE  = Math.floor(ogeLimit - (takeoffW - fuelW))
  const maxFuelAllowed = Math.max(FUEL_MIN, Math.min(FUEL_MAX, maxFuelByBambi, maxFuelByMTOW, maxFuelByOGE))

  // בדיקות חריגה
  const overMTOW = takeoffW > mtowEffective
  const overOGE  = takeoffW > ogeLimit
  const overInternal = internalW > maxInternalLimit

  // מעטפת CG אורכית — לפי עומס חיצוני (cargoWeight)
  const longEnv = useMemo<[number, number][]>(() => getLongEnvelope(extW), [extW])
  const cgLongOK = takeoffW < 1500 || isInPolygon(longCG, takeoffW, longEnv)
  // לרוחב — מעטפת פשוטה ±0.15 מטר (לאמת AFM)
  const cgLatOK = Math.abs(latCG) < 0.15

  const ok = !overMTOW && !overOGE && !overInternal && cgLongOK && cgLatOK

  // ── טוסטים ──
  useEffect(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      const checks: [boolean, keyof typeof prevV.current, string, boolean][] = [
        [overMTOW,     'mtow',     `⛔ חריגה ממשקל מקס' (${mtowEffective} ק"ג)`, true],
        [overInternal, 'internal', `⛔ חריגה ממשקל פנימי מקס' (${maxInternalLimit} ק"ג)`, true],
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

  // ─── UI ────────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="min-h-screen pb-40">
      {/* Header */}
      <div className="bg-gradient-to-l from-slate-800 to-slate-700 text-white px-4 py-3 shadow-md sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">משקל ואיזון</div>
            <div className="text-xs text-slate-300">מסוק H145</div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setTab('main')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${tab === 'main' ? 'bg-white text-slate-800' : 'bg-slate-600 text-slate-200'}`}>
              ראשי
            </button>
            <button onClick={() => setTab('tech')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${tab === 'tech' ? 'bg-white text-slate-800' : 'bg-slate-600 text-slate-200'}`}>
              מרכז כובד
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 pt-3 space-y-3">
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
              <div className="mt-2 text-xs text-slate-500">
                ריק: {heli.emptyWeight} ק"ג · LONG {heli.longArm.toFixed(3)} מ' · LAT {heli.latArm.toFixed(4)} מ'
              </div>
            </Card>

            {/* ציוד */}
            <Card title="ציוד">
              <div className="space-y-2">
                <Field label="מערכת תצפית">
                  <Sel value={s.system} onChange={v => set('system', v as AppState['system'])}
                    opts={['ללא', 'SHAPO', 'DSP-HD']} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Tog label="פנס Nightsun XP" value={s.xp} onChange={v => set('xp', v)} />
                  <Tog label="רמקולי כריזה" value={s.pa} onChange={v => set('pa', v)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Tog label="וו מטען" value={s.cargoHook} onChange={v => set('cargoHook', v)} />
                  <Tog label="מראות וו" value={s.cargoMirrors} onChange={v => set('cargoMirrors', v)}
                    disabled={!s.cargoHook} />
                </div>
                <Field label="מתקן גלישה (FR)">
                  <Sel value={s.fastRope} onChange={v => set('fastRope', v as FastRope)}
                    opts={['off', 'fixed', 'extended']}
                    labels={['ללא', 'קבוע', 'מורחב']} />
                </Field>
                <Field label="BAMBI">
                  <Sel value={s.bambiMode} onChange={v => {
                    const m = v as BambiMode
                    setS(p => ({ ...p, bambiMode: m, bambiFill: m === 'hook' ? Math.max(70, p.bambiFill) : 0 }))
                  }} opts={['off', 'cabin', 'hook']}
                    labels={['ללא', 'בקבינה (ריק)', 'על הוו']} />
                </Field>
                {s.bambiMode === 'hook' && (
                  <div className="flex gap-1">
                    {[70, 80, 90, 100].map(pct => (
                      <button key={pct} onClick={() => set('bambiFill', pct)}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors
                          ${s.bambiFill === pct ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                )}
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
                  <R2 l="מסוק" v={`${s.helicopter} (${heli.emptyWeight} ק"ג)`} />
                  <R2 l="תצורה" v={`${cfg.id}: ${cfg.name} (${cfg.seats.length} כסאות)`} />
                  <R2 l="מערכת" v={s.system} />
                  <R2 l="פנס" v={s.xp ? 'XP' : 'ללא'} />
                  <R2 l="כריזה" v={s.pa ? 'כן' : 'לא'} />
                  <R2 l="וו" v={s.cargoHook ? (s.cargoMirrors ? 'וו + מראות' : 'וו בלבד') : 'ללא'} />
                  <R2 l="FR" v={s.fastRope === 'off' ? 'ללא' : s.fastRope === 'fixed' ? 'קבוע' : 'מורחב'} />
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
              {cfg.seats.length > 0 && (
                <div className="space-y-2">
                  {cfg.seats.map((seat, i) => (
                    <Field key={i} label={`${seat.label}`}>
                      <Num value={s.passengers[i] ?? 0}
                        onChange={v => setS(p => ({ ...p, passengers: p.passengers.map((x, j) => j === i ? v : x) }))}
                        max={150} />
                    </Field>
                  ))}
                </div>
              )}
              {cfg.seats.length === 0 && (
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
              {s.fuel > FUEL_LANDING && (
                <div className="mt-1.5 text-xs text-slate-500 text-center">
                  ⏱️ זמן טיסה: {Math.floor((s.fuel - FUEL_LANDING) / FUEL_BURN)} דק' · נחיתה {FUEL_LANDING} ק"ג · {FUEL_BURN} ק"ג/דק'
                </div>
              )}
            </Card>

            {/* תנאי שטח */}
            <Card title="תנאי שטח">
              <div className="grid grid-cols-2 gap-2">
                <Field label="גובה (רגל)">
                  <Sel value={String(s.altitude)} onChange={v => set('altitude', +v)}
                    opts={['0', '500', '1000', '1500', '2000', '2500', '3000', '3500', '4000']} />
                </Field>
                <Field label="טמפ' (°C)">
                  <Sel value={String(s.temperature)} onChange={v => set('temperature', +v)}
                    opts={['10', '15', '20', '25', '30', '35', '40']} />
                </Field>
              </div>
            </Card>

            {/* תוצאות */}
            <Card title="תוצאות">
              <div className="space-y-1 mb-2">
                <WR l="משקל ריק" v={heli.emptyWeight} />
                <WR l="ציוד" v={equipmentStations(s).reduce((sum, e) => sum + e.weight, 0)} />
                <WR l="כסאות + נוסעים" v={cfg.seats.reduce((sum, seat, i) => sum + seat.weight + (s.passengers[i] ?? 0), 0)} />
                <WR l="צוות" v={s.pilotR + s.pilotL} />
                {extW > 0 && <WR l="עומס חיצוני" v={extW} />}
                <WR l="דלק" v={fuelW} />
                <div className="border-t pt-1 mt-1">
                  <WR l="משקל המראה" v={takeoffW} bold />
                </div>
              </div>

              <div className="space-y-2 mb-3">
                <LimitBar label={`מגבלת מבנה (${mtowEffective} ק"ג)`}
                  actual={takeoffW} max={mtowEffective} over={overMTOW} />
                {bambiLimits && (
                  <LimitBar label={`מגבלת פנימי עם BAMBI (${maxInternalLimit} ק"ג)`}
                    actual={internalW} max={maxInternalLimit} over={overInternal} />
                )}
                <LimitBar label={`מגבלת מנוע OGE (${ogeLimit} ק"ג)`}
                  actual={takeoffW} max={ogeLimit} over={overOGE} />
              </div>

              <div className="border-t pt-2 space-y-1.5">
                <CGLongBar cg={longCG} env={longEnv} weight={takeoffW} ok={cgLongOK} />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`rounded-lg p-2 ${cgLongOK ? 'bg-slate-50' : 'bg-red-50'}`}>
                    <div className="text-slate-500">CG אורכי</div>
                    <div className={`font-bold ${cgLongOK ? 'text-slate-700' : 'text-red-700'}`}>
                      {longCG.toFixed(3)} מ'
                    </div>
                  </div>
                  <div className={`rounded-lg p-2 ${cgLatOK ? 'bg-slate-50' : 'bg-red-50'}`}>
                    <div className="text-slate-500">CG רוחבי</div>
                    <div className={`font-bold ${cgLatOK ? 'text-slate-700' : 'text-red-700'}`}>
                      {latCG.toFixed(3)} מ'
                    </div>
                  </div>
                </div>
              </div>

              {/* MTOW 3800 toggle */}
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
          <Card title="טבלת תחנות">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-right py-1">תחנה</th>
                  <th className="text-center">משקל</th>
                  <th className="text-center border-l border-slate-300">LONG</th>
                  <th className="text-center">LAT</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((st, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1 text-right">{st.name}</td>
                    <td className="text-center">{st.weight.toFixed(1)}</td>
                    <td className="text-center border-l border-slate-200">{st.longArm.toFixed(3)}</td>
                    <td className="text-center">{st.latArm.toFixed(3)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-blue-700 font-bold">
                  <td className="py-1 text-right">סה"כ</td>
                  <td className="text-center">{takeoffW.toFixed(1)}</td>
                  <td className="text-center border-l border-blue-700">{longCG.toFixed(3)}</td>
                  <td className="text-center">{latCG.toFixed(3)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Toasts */}
      <div className="fixed top-16 left-0 right-0 z-30 px-3 space-y-1.5 pointer-events-none">
        <div className="max-w-lg mx-auto space-y-1.5">
          {toasts.map(t => (
            <div key={t.id} onClick={() => dismissToast(t.id)}
              className={`pointer-events-auto rounded-lg shadow-md px-3 py-2 text-sm font-medium cursor-pointer
                flex items-center justify-between
                ${t.error ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
              <span>{t.msg}</span>
              <span className="text-xs opacity-75 mr-2">אישור</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom banner */}
      <div className={`fixed bottom-0 left-0 right-0 z-20 text-white shadow-2xl
        ${ok ? 'bg-emerald-700' : 'bg-red-700'}`}>
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
            <BannerCell label={`מנוע OGE`}
              value={`${takeoffW.toFixed(0)}/${ogeLimit}`}
              ok={!overOGE} />
          </div>
          {(!cgLongOK || !cgLatOK) && (
            <div className={`mt-1.5 grid gap-1.5 ${!cgLongOK && !cgLatOK ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {!cgLongOK && <BannerCell label="CG אורכי" value={`${longCG.toFixed(3)} מ'`} ok={false} />}
              {!cgLatOK && <BannerCell label="CG רוחבי" value={`${latCG.toFixed(3)} מ'`} ok={false} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── רכיבי UI ────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-3">
      <div className="text-sm font-bold text-slate-700 mb-2 border-b pb-1">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 block mb-0.5">{label}</span>
      {children}
    </label>
  )
}

function Sel({ value, onChange, opts, labels }:
  { value: string; onChange: (v: string) => void; opts: readonly string[]; labels?: readonly string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
      {opts.map((o, i) => <option key={o} value={o}>{labels?.[i] ?? o}</option>)}
    </select>
  )
}

function Num({ value, onChange, max = 1000, step = 5 }:
  { value: number; onChange: (v: number) => void; max?: number; step?: number }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(Math.max(0, value - step))}
        className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-bold">−</button>
      <input type="number" value={value || ''} placeholder="0"
        onChange={e => onChange(Math.min(max, Math.max(0, +e.target.value || 0)))}
        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center" />
      <button onClick={() => onChange(Math.min(max, value + step))}
        className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-bold">+</button>
    </div>
  )
}

function Tog({ label, value, onChange, disabled, disabledReason }:
  { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; disabledReason?: string }) {
  return (
    <div className={`flex items-center justify-between bg-slate-50 rounded-lg px-2 py-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-xs text-slate-700" title={disabled ? disabledReason : undefined}>{label}</span>
      <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
        className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0
          ${value ? 'bg-blue-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
          ${value ? 'right-0.5' : 'left-0.5'}`} dir="ltr" />
      </button>
    </div>
  )
}

function WR({ l, v, bold }: { l: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-xs ${bold ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
      <span>{l}</span>
      <span>{v.toFixed(1)} ק"ג</span>
    </div>
  )
}

function R2({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{l}</span>
      <span>{v}</span>
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
    <div className={`rounded-lg px-2 py-1 ${ok ? 'bg-white/15' : 'bg-white/30'}`}>
      <div className="text-[0.625rem] opacity-80">{label}</div>
      <div className={`font-bold text-sm ${ok ? '' : 'underline'}`}>{value}</div>
    </div>
  )
}

// CG אורכי — תצוגה גרפית פשוטה (SVG)
function CGLongBar({ cg, env, weight, ok }:
  { cg: number; env: [number, number][]; weight: number; ok: boolean }) {
  const W = 320, H = 70
  const xMin = 4.25, xMax = 4.75   // טווח תצוגה
  const sx = (x: number) => ((x - xMin) / (xMax - xMin)) * W
  const sy = (y: number) => H - ((y - 1500) / (4000 - 1500)) * H
  const pts = env.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')
  return (
    <div className="text-xs">
      <div className="flex justify-between mb-1">
        <span className="text-slate-500">מעטפת CG אורכי</span>
        <span className={`font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>
          {cg.toFixed(3)} מ' / {weight.toFixed(0)} ק"ג
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-slate-50 rounded-lg">
        <polyline points={pts} fill={ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}
          stroke={ok ? '#16a34a' : '#dc2626'} strokeWidth="1" />
        <circle cx={sx(cg)} cy={sy(weight)} r="4" fill={ok ? '#16a34a' : '#dc2626'}
          stroke="white" strokeWidth="1.5" />
      </svg>
    </div>
  )
}
