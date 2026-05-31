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

const FUEL_ARM   = 3.35
const CG_FWD     = 3.269
const CG_AFT     = 3.4358
const CG_VIS_MIN = 3.15
const CG_VIS_MAX = 3.55
const MIN_FUEL   = 40

// מגבלות משקל:
// ללא מטען על הוו  → משקל כולל מקסימום 2370
// עם מטען על הוו   → משקל פנימי מקסימום 2250, משקל כולל (כולל מטען) מקסימום 2800
const MTOW_NO_HOOK    = 2370
const MAX_INTERNAL    = 2250
const MTOW_WITH_HOOK  = 2800

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

function getOGE(alt: number, tmp: number) {
  const alts = [0,500,1000,1500,2000,2500,3000,3500,4000]
  const tmps = [10,15,20,25,30,35,40]
  const a = alts.reduce((a,b) => Math.abs(b-alt)<Math.abs(a-alt)?b:a)
  const t = tmps.reduce((a,b) => Math.abs(b-tmp)<Math.abs(a-tmp)?b:a)
  return OGE_TABLE[a][t]
}

interface Station { name: string; weight: number; longArm: number; latArm: number }
interface CustomStation { name: string; weight: number; longArm: number }

function buildStations(s: AppState, fuelOverride?: number): Station[] {
  const heli = HELICOPTERS.find(h => h.id === s.helicopter)!
  const fuel = fuelOverride ?? s.fuel
  const st: Station[] = []

  st.push({ name: `מסוק ריק (${s.helicopter})`, weight: heli.emptyWeight, longArm: heli.longArm, latArm: heli.latArm })
  if (s.system === 'SHAPO')  st.push({ name: 'מצלמה SHAPO',  weight: 18.0, longArm: 1.03, latArm: -0.53 })
  if (s.system === 'DSP-HD') st.push({ name: 'מצלמה DSP-HD', weight: 31.3, longArm: 1.03, latArm: -0.53 })
  if (s.xp)        st.push({ name: 'פנס Nightsun XP', weight: 33.0, longArm: 4.83, latArm: 0.00 })
  if (s.cargoHook) {
    st.push({ name: 'וו חיצוני',  weight: 13.6, longArm: 3.38, latArm: 0.00 })
    st.push({ name: 'מראות וו',   weight:  1.7, longArm: 0.28, latArm: 0.65 })
  }
  if (s.bambi) st.push({ name: 'BAMBI', weight: 40.0, longArm: 2.25, latArm: 0.00 })

  st.push({ name: 'טייס ימין',  weight: s.pilotR, longArm: 1.55, latArm:  0.35 })
  st.push({ name: 'טייס שמאל', weight: s.pilotL, longArm: 1.55, latArm: -0.35 })

  const arms = SEAT_ARMS[s.config] ?? []
  s.passengers.forEach((w, i) => {
    if (w > 0) {
      const [la, lat] = arms[i] ?? [2.54, 0]
      st.push({ name: `נוסע ${i + 1}`, weight: w, longArm: la, latArm: lat })
    }
  })

  // תחנות נוספות ידניות
  s.customStations.forEach(cs => {
    if (cs.weight > 0)
      st.push({ name: cs.name || 'תחנה נוספת', weight: cs.weight, longArm: cs.longArm, latArm: 0 })
  })

  if (s.externalLoad > 0) st.push({ name: 'משקל על הוו', weight: s.externalLoad, longArm: 3.38, latArm: 0 })
  if (fuel > 0)           st.push({ name: 'דלק',          weight: fuel,           longArm: FUEL_ARM, latArm: 0 })

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

function equipWeight(system: string, xp: boolean, cargoHook: boolean, bambi: boolean) {
  let w = 0
  if (system === 'SHAPO')  w += 18
  if (system === 'DSP-HD') w += 31.3
  if (xp)        w += 33
  if (cargoHook) w += 15.3
  if (bambi)     w += 40
  return w
}

// ─── STATE ────────────────────────────────────────────────────────────────────

interface AppState {
  helicopter: string; config: string; system: string
  xp: boolean; cargoHook: boolean; bambi: boolean
  pilotR: number; pilotL: number; passengers: number[]
  externalLoad: number; fuel: number
  altitude: number; temperature: number; ogeReserve80: boolean
  customStations: CustomStation[]
}

const DEF: AppState = {
  helicopter: 'BMK', config: '11', system: 'SHAPO',
  xp: true, cargoHook: true, bambi: false,
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
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const prevV = useRef({ mtow: false, internal: false, total: false, oge: false, cgFwd: false, cgAft: false })

  const set = <K extends keyof AppState>(k: K, v: AppState[K]) => setS(p => ({ ...p, [k]: v }))

  // ── חישובים ──
  const heli      = HELICOPTERS.find(h => h.id === s.helicopter)!
  const equipW    = equipWeight(s.system, s.xp, s.cargoHook, s.bambi)
  const emptyW    = heli.emptyWeight
  const customW   = s.customStations.reduce((a, cs) => a + (cs.weight || 0), 0)
  const dryW      = emptyW + equipW
  const crewW     = s.pilotR + s.pilotL
  const paxW      = s.passengers.reduce((a, b) => a + b, 0)
  const extW      = s.externalLoad
  const fuelW     = s.fuel
  const takeoffW  = dryW + crewW + paxW + customW + extW + fuelW
  const internalW = takeoffW - extW
  const ogeRaw    = getOGE(s.altitude, s.temperature)
  const ogeLimit  = s.ogeReserve80 ? ogeRaw - 80 : ogeRaw
  const hasHook   = extW > 0

  const stations = buildStations(s)
  const { longCG, latCG } = calcCG(stations)

  // ── מגבלות משקל ──
  // ללא מטען על הוו: כולל ≤ 2370
  // עם מטען על הוו: פנימי ≤ 2250 וכולל ≤ 2800
  const overMTOW     = !hasHook && takeoffW  > MTOW_NO_HOOK
  const overInternal =  hasHook && internalW > MAX_INTERNAL
  const overTotal    =  hasHook && takeoffW  > MTOW_WITH_HOOK
  const overOGE      = takeoffW > ogeLimit
  const cgFwdViol    = longCG > 0 && longCG < CG_FWD
  const cgAftViol    = longCG > CG_AFT
  const ok = !overMTOW && !overInternal && !overTotal && !overOGE && !cgFwdViol && !cgAftViol

  const fuelLanding = Math.max(MIN_FUEL, Math.round(s.fuel * 0.1))
  const fuelMid     = Math.round((s.fuel + fuelLanding) / 2)
  const cgTakeoff   = calcCG(buildStations(s, s.fuel))
  const cgMid       = calcCG(buildStations(s, fuelMid))
  const cgLanding   = calcCG(buildStations(s, fuelLanding))

  // ── טוסטים ──
  useEffect(() => {
    const checks: [boolean, keyof typeof prevV.current, string, boolean][] = [
      [overMTOW,     'mtow',     `⛔ חריגה ממשקל מקסימלי (${MTOW_NO_HOOK} ק"ג)`,      true ],
      [overInternal, 'internal', `⛔ חריגה ממשקל פנימי מקסימלי (${MAX_INTERNAL} ק"ג)`, true ],
      [overTotal,    'total',    `⛔ חריגה ממשקל כולל מקסימלי (${MTOW_WITH_HOOK} ק"ג)`, true ],
      [overOGE,      'oge',      '⚠️ חריגה ממגבלת מנוע לריחוף מה"ק',                  false],
      [cgFwdViol,    'cgFwd',    '⚠️ מרכז כובד קדמי מחוץ לתחום',                       false],
      [cgAftViol,    'cgAft',    '⚠️ מרכז כובד אחורי מחוץ לתחום',                      false],
    ]
    const newToasts: Toast[] = []
    checks.forEach(([active, key, msg, error]) => {
      if (active && !prevV.current[key]) newToasts.push({ id: ++toastId.current, msg, error })
      prevV.current[key] = active
    })
    if (newToasts.length === 0) return
    setToasts(t => [...t, ...newToasts])
    newToasts.forEach(toast =>
      setTimeout(() => setToasts(t => t.filter(x => x.id !== toast.id)), 4000)
    )
  }, [overMTOW, overInternal, overTotal, overOGE, cgFwdViol, cgAftViol])

  const configName  = CONFIGS.find(c => c.id === s.config)?.name ?? ''
  const configSeats = CONFIGS.find(c => c.id === s.config)?.seats ?? 0

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
              ${t.error ? 'bg-red-600' : 'bg-orange-500'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      <header className="bg-blue-900 text-white px-4 py-3 sticky top-0 z-10 shadow">
        <div className="text-base font-bold">משקל ואיזון — H125</div>
        <div className="text-blue-300 text-xs">משטרת ישראל · יחידה אווירית</div>
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
        <div className="max-w-lg mx-auto p-3 space-y-3 pb-8">

          {/* מסוק */}
          <Card title="מסוק">
            <div className="grid grid-cols-2 gap-3">
              <Field label="זנב">
                <Sel value={s.helicopter} onChange={v => set('helicopter', v)}
                  opts={HELICOPTERS.map(h => h.id)} />
              </Field>
              <Field label="תצורת מושבים">
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
            <Field label="מערכת הדמיה">
              <Sel value={s.system} onChange={v => set('system', v)}
                opts={['ללא','SHAPO','DSP-HD']} />
            </Field>
            <Tog label="פנס Nightsun XP"   value={s.xp}        onChange={v => set('xp', v)} />
            <Tog label="וו חיצוני + מראות" value={s.cargoHook} onChange={v => set('cargoHook', v)} />
            <Tog label="BAMBI"              value={s.bambi}     onChange={v => set('bambi', v)} />
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
                <R2 l="BAMBI"      v={s.bambi ? 'מחובר' : 'ללא'} />
                <R2 l="משקל ציוד"  v={`${equipW.toFixed(1)} ק"ג`} />
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
              <Field label='דלק (ק"ג) · מקס 426'>
                <Num value={s.fuel} onChange={v => set('fuel', Math.min(v, 426))} />
              </Field>
              <Field label='משקל על הוו (ק"ג)'>
                <Num value={s.externalLoad} onChange={v => set('externalLoad', v)} />
              </Field>
            </div>
            {hasHook && (
              <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mt-1">
                מצב מטען על הוו — פנימי מקס 2250 · כולל מקס 2800 ק"ג
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
                  <Num value={cs.longArm} onChange={v => updateCustomStation(i, 'longArm', v)} />
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
            <Tog label='מינוס 80 ק"ג ממגבלת מנוע לריחוף מה"ק' value={s.ogeReserve80} onChange={v => set('ogeReserve80', v)} />
            <div className="text-xs text-slate-400 mt-1">
              מגבלת מנוע לריחוף מה"ק לפי גובה {s.altitude} רגל וטמפ' {s.temperature}°C —
              ערך גולמי: {ogeRaw} ק"ג
              {s.ogeReserve80 ? ` · אחרי הפחתה: ${ogeLimit} ק"ג` : ''}
            </div>
          </Card>

          {/* תוצאות */}
          <Card title="תוצאות חישוב">

            <div className="space-y-0.5 text-sm mb-3">
              <WR l="מסוק ריק"        v={emptyW} />
              <WR l="ציוד והתקנות"    v={equipW} />
              <WR l="צוות"            v={crewW}  />
              {paxW  > 0 && <WR l="נוסעים"         v={paxW}  />}
              {customW > 0 && <WR l="תחנות נוספות"  v={customW} />}
              {extW  > 0 && <WR l="משקל על הוו"     v={extW}  />}
              <WR l="דלק"             v={fuelW}  />
              <div className="flex justify-between border-t-2 border-slate-300 pt-1 font-bold">
                <span>משקל המראה</span>
                <span>{takeoffW.toFixed(0)} ק"ג</span>
              </div>
            </div>

            {/* פסי מגבלות — לפי מצב הוו */}
            <div className="space-y-2 mb-4">
              {!hasHook ? (
                <LimitBar label={`משקל המראה מול מגבלה (${MTOW_NO_HOOK} ק"ג)`}
                  actual={takeoffW} max={MTOW_NO_HOOK} over={overMTOW} />
              ) : (<>
                <LimitBar label={`משקל פנימי מול מגבלה (${MAX_INTERNAL} ק"ג)`}
                  actual={internalW} max={MAX_INTERNAL} over={overInternal} />
                <LimitBar label={`משקל כולל מול מגבלה (${MTOW_WITH_HOOK} ק"ג)`}
                  actual={takeoffW} max={MTOW_WITH_HOOK} over={overTotal} />
              </>)}
              <LimitBar
                label={s.ogeReserve80 ? `מגבלת מנוע לריחוף מה"ק מינוס 80 (${ogeLimit} ק"ג)` : `מגבלת מנוע לריחוף מה"ק (${ogeLimit} ק"ג)`}
                actual={takeoffW} max={ogeLimit} over={overOGE} />
            </div>

            {/* מרכז כובד לאורך הגיחה */}
            <div className="mb-4">
              <div className="text-xs font-bold text-slate-600 mb-2">
                מרכז כובד לאורך הגיחה (לפי שריפת דלק)
              </div>
              <CGBar label={`המראה · ${s.fuel} ק"ג דלק`}      cg={cgTakeoff.longCG} />
              <CGBar label={`אמצע גיחה · ${fuelMid} ק"ג דלק`} cg={cgMid.longCG}     />
              <CGBar label={`נחיתה · ${fuelLanding} ק"ג דלק`}  cg={cgLanding.longCG} />
            </div>

            <div className="text-xs text-slate-500 mb-3">
              מרכז כובד לרוחב: <span className="font-bold text-slate-700">{latCG.toFixed(4)} מ'</span>
            </div>

            <div className={`text-center font-bold text-sm py-3 rounded-xl
              ${ok ? 'bg-green-600' : 'bg-red-600'} text-white`}>
              {ok ? '✅ בגבולות — מאושר לטיסה' : '⛔ חריגה ממגבלות — לא מאושר'}
            </div>
          </Card>

        </div>
      ) : (

        /* לשונית תחנות ומומנטים */
        <div className="max-w-lg mx-auto p-3 pb-8">
          <Card title="תחנות ומומנטים">
            <p className="text-xs text-slate-400 mb-3">
              זרוע = מרחק מנקודת ייחוס (מ') · מומנט = משקל × זרוע
            </p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs min-w-[340px]">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-1 font-medium pr-1 text-right">תחנה</th>
                    <th className="pb-1 font-medium text-left">משקל</th>
                    <th className="pb-1 font-medium text-left">זרוע א'</th>
                    <th className="pb-1 font-medium text-left">מומנט א'</th>
                    <th className="pb-1 font-medium text-left">זרוע ר'</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((st, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1 pr-1 text-slate-700">{st.name}</td>
                      <td className="py-1 text-left">{st.weight.toFixed(1)}</td>
                      <td className="py-1 text-left text-slate-500">{st.longArm.toFixed(3)}</td>
                      <td className="py-1 text-left font-medium">{(st.weight * st.longArm).toFixed(1)}</td>
                      <td className="py-1 text-left text-slate-400">{st.latArm.toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-slate-50 border-t-2 border-slate-300">
                    <td className="py-1.5 pr-1">סה"כ</td>
                    <td className="py-1.5 text-left">{takeoffW.toFixed(1)}</td>
                    <td className="py-1.5 text-left">{longCG.toFixed(4)}</td>
                    <td className="py-1.5 text-left">{(takeoffW * longCG).toFixed(1)}</td>
                    <td className="py-1.5 text-left">{latCG.toFixed(4)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-3 border-t text-xs space-y-1 text-slate-600">
              <div>
                מרכז כובד לאורך: <span className="font-bold text-slate-800">{longCG.toFixed(4)} מ'</span>
                <span className="mr-2 text-slate-400">גבול קדמי {CG_FWD} | גבול אחורי {CG_AFT}</span>
              </div>
              <div>מרכז כובד לרוחב: <span className="font-bold text-slate-800">{latCG.toFixed(4)} מ'</span></div>
              <div className={`font-bold mt-1 ${cgFwdViol || cgAftViol ? 'text-red-600' : 'text-green-700'}`}>
                {cgFwdViol ? '⛔ קדמי מחוץ לתחום' : cgAftViol ? '⛔ אחורי מחוץ לתחום' : '✅ מרכז כובד בתחום'}
              </div>
            </div>
          </Card>
        </div>
      )}
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
function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white" />
  )
}
function Tog({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-slate-700">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0
          ${value ? 'bg-blue-600' : 'bg-slate-300'}`}>
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
function CGBar({ label, cg }: { label: string; cg: number }) {
  const range  = CG_VIS_MAX - CG_VIS_MIN
  const fwdPct = ((CG_FWD - CG_VIS_MIN) / range) * 100
  const aftPct = ((CG_AFT - CG_VIS_MIN) / range) * 100
  const cgPct  = Math.min(100, Math.max(0, ((cg - CG_VIS_MIN) / range) * 100))
  const ok     = cg >= CG_FWD && cg <= CG_AFT
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className={`font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>
          {cg.toFixed(4)} מ' {ok ? '✅' : '⛔'}
        </span>
      </div>
      <div className="relative h-3 bg-slate-200 rounded-full">
        <div className="absolute top-0 h-full bg-green-300 rounded-full"
          style={{ left: `${fwdPct}%`, width: `${aftPct - fwdPct}%` }} />
        <div className={`absolute top-0 w-1 h-3 rounded-full ${ok ? 'bg-green-700' : 'bg-red-600'}`}
          style={{ left: `${cgPct}%`, transform: 'translateX(-50%)' }} />
      </div>
      <div className="relative h-4 mt-0.5">
        <span className="absolute text-[9px] text-slate-400"
          style={{ left: `${fwdPct}%`, transform: 'translateX(-50%)' }}>{CG_FWD}</span>
        <span className="absolute text-[9px] text-slate-400"
          style={{ left: `${aftPct}%`, transform: 'translateX(-50%)' }}>{CG_AFT}</span>
      </div>
    </div>
  )
}
