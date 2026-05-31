import { useState } from 'react'
import './index.css'

const HELICOPTERS = [
  { id: 'BMK', emptyWeight: 1605.6 },
  { id: 'BML', emptyWeight: 1609.5 },
  { id: 'BMM', emptyWeight: 1610.8 },
  { id: 'BMN', emptyWeight: 1613.1 },
]

const CONFIGS = [
  { id: '01', name: 'POLICE + 1',      seats: 1 },
  { id: '02', name: 'POLICE + 2',      seats: 2 },
  { id: '03', name: 'POLICE + 3',      seats: 3 },
  { id: '04', name: 'TRANSPORT + 3',   seats: 3 },
  { id: '05', name: 'TRANSPORT + 4',   seats: 4 },
  { id: '06', name: 'FIRE - NO SEATS', seats: 0 },
  { id: '07', name: 'FIRE + 1',        seats: 1 },
  { id: '08', name: 'FIRE + 2',        seats: 2 },
  { id: '09', name: 'FIRE + 3',        seats: 3 },
  { id: '10', name: 'POLICE/FIRE + 1', seats: 1 },
  { id: '11', name: 'POLICE/FIRE + 2', seats: 2 },
  { id: '12', name: 'POLICE/FIRE + 3', seats: 3 },
  { id: '13', name: 'CUSTOM',          seats: 0 },
]

const SYSTEMS = ['ללא', 'SHAPO', 'DSP-HD']
const BAMBI_OPTIONS = ['ללא', 'מחובר', 'בסל']

const OGE_TABLE: Record<number, Record<number, number>> = {
  0:    { 10: 2800, 15: 2800, 20: 2800, 25: 2785, 30: 2775, 35: 2765, 40: 2750 },
  500:  { 10: 2800, 15: 2800, 20: 2790, 25: 2775, 30: 2765, 35: 2750, 40: 2740 },
  1000: { 10: 2800, 15: 2800, 20: 2775, 25: 2765, 30: 2750, 35: 2725, 40: 2690 },
  1500: { 10: 2790, 15: 2775, 20: 2760, 25: 2745, 30: 2735, 35: 2690, 40: 2640 },
  2000: { 10: 2780, 15: 2760, 20: 2740, 25: 2730, 30: 2720, 35: 2660, 40: 2590 },
  2500: { 10: 2760, 15: 2740, 20: 2730, 25: 2715, 30: 2680, 35: 2615, 40: 2530 },
  3000: { 10: 2740, 15: 2725, 20: 2710, 25: 2675, 30: 2640, 35: 2560, 40: 2485 },
  3500: { 10: 2725, 15: 2715, 20: 2700, 25: 2640, 30: 2580, 35: 2510, 40: 2430 },
  4000: { 10: 2715, 15: 2680, 20: 2650, 25: 2585, 30: 2540, 35: 2460, 40: 2390 },
}

function getOGE(altFt: number, tempC: number): number {
  const altitudes = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000]
  const temps = [10, 15, 20, 25, 30, 35, 40]
  const alt = altitudes.reduce((a, b) => Math.abs(b - altFt) < Math.abs(a - altFt) ? b : a)
  const tmp = temps.reduce((a, b) => Math.abs(b - tempC) < Math.abs(a - tempC) ? b : a)
  return OGE_TABLE[alt][tmp]
}

function getEquipW(system: string, xp: boolean, cargoHook: boolean, bambi: string) {
  let w = 0
  if (system === 'SHAPO')  w += 18
  if (system === 'DSP-HD') w += 31.3
  if (xp)                  w += 33
  if (cargoHook)           w += 15.3
  if (bambi === 'מחובר')   w += 40
  if (bambi === 'בסל')     w += 70.6
  return w
}

interface S {
  helicopter: string; config: string; system: string
  xp: boolean; cargoHook: boolean; bambi: string
  pilotR: number; pilotL: number; passengers: number[]
  externalLoad: number; fuel: number
  altitude: number; temperature: number; ogeReserve80: boolean
}

const DEF: S = {
  helicopter: 'BMK', config: '11', system: 'SHAPO',
  xp: true, cargoHook: true, bambi: 'ללא',
  pilotR: 80, pilotL: 80, passengers: [0, 0],
  externalLoad: 0, fuel: 400,
  altitude: 2000, temperature: 20, ogeReserve80: true,
}

export default function App() {
  const [s, setS] = useState<S>(DEF)
  const set = <K extends keyof S>(k: K, v: S[K]) => setS(p => ({ ...p, [k]: v }))

  const heli = HELICOPTERS.find(h => h.id === s.helicopter)!
  const equipW = getEquipW(s.system, s.xp, s.cargoHook, s.bambi)
  const emptyW = heli.emptyWeight
  const dryW = emptyW + equipW
  const crewW = s.pilotR + s.pilotL
  const paxW = s.passengers.reduce((a, b) => a + b, 0)
  const extW = s.externalLoad
  const fuelW = s.fuel
  const takeoffW = dryW + crewW + paxW + extW + fuelW
  const internalW = takeoffW - extW
  const ogeRaw = getOGE(s.altitude, s.temperature)
  const ogeLimit = s.ogeReserve80 ? ogeRaw - 80 : ogeRaw

  const overMTOW     = takeoffW > 2370
  const overInternal = internalW > 2250
  const overOGE      = takeoffW > ogeLimit
  const ok = !overMTOW && !overInternal && !overOGE

  const configSeats = CONFIGS.find(c => c.id === s.config)?.seats ?? 0

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      <header className="bg-blue-900 text-white px-4 py-3">
        <div className="text-lg font-bold">Weight &amp; Balance — H125</div>
        <div className="text-blue-300 text-xs">משטרת ישראל · יחידה אווירית</div>
      </header>

      <div className="max-w-lg mx-auto p-3 space-y-3">

        {/* מסוק */}
        <Card title="מסוק">
          <div className="grid grid-cols-2 gap-3">
            <Field label="זנב">
              <Sel value={s.helicopter} onChange={v => set('helicopter', v)}
                opts={HELICOPTERS.map(h => h.id)} />
            </Field>
            <Field label="תצורת מושבים">
              <Sel value={s.config} onChange={v => {
                const seats = CONFIGS.find(c => c.id === v)?.seats ?? 0
                setS(p => ({ ...p, config: v, passengers: Array(seats).fill(0) }))
              }} opts={CONFIGS.map(c => c.id)} labels={CONFIGS.map(c => c.name)} />
            </Field>
          </div>
        </Card>

        {/* ציוד */}
        <Card title="ציוד">
          <Field label="מצלמה">
            <Sel value={s.system} onChange={v => set('system', v)} opts={SYSTEMS} />
          </Field>
          <Tog label="פנס Nightsun XP" value={s.xp} onChange={v => set('xp', v)} />
          <Tog label="וו חיצוני + מראות" value={s.cargoHook} onChange={v => set('cargoHook', v)} />
          <Field label="BAMBI">
            <Sel value={s.bambi} onChange={v => set('bambi', v)} opts={BAMBI_OPTIONS} />
          </Field>
        </Card>

        {/* צוות */}
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

        {/* דלק */}
        <Card title="דלק ומטען">
          <div className="grid grid-cols-2 gap-3">
            <Field label='דלק (ק"ג) · מקס 426'><Num value={s.fuel} onChange={v => set('fuel', Math.min(v, 426))} /></Field>
            <Field label='מטען חיצוני (ק"ג)'><Num value={s.externalLoad} onChange={v => set('externalLoad', v)} /></Field>
          </div>
        </Card>

        {/* שטח */}
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
          <Tog label='הפחת 80 ק"ג ממגבלת שטח' value={s.ogeReserve80} onChange={v => set('ogeReserve80', v)} />
        </Card>

        {/* תוצאות */}
        <Card title="תוצאות">
          <div className="space-y-1 text-sm mb-3">
            <WRow l="מסוק ריק"       v={emptyW} />
            <WRow l="ציוד והתקנות"   v={equipW} />
            <WRow l="צוות"           v={crewW} />
            <WRow l="נוסעים"         v={paxW} />
            {extW > 0 && <WRow l="מטען חיצוני" v={extW} />}
            <WRow l="דלק"            v={fuelW} />
          </div>

          <div className="space-y-2">
            <Limit label="משקל המראה"   actual={takeoffW} max={2370}  over={overMTOW} />
            <Limit label="משקל פנימי"   actual={internalW} max={2250} over={overInternal} />
            <Limit label={`מגבלת שטח (OGE${s.ogeReserve80 ? ' -80' : ''})`} actual={takeoffW} max={ogeLimit} over={overOGE} />
          </div>

          <div className={`mt-3 text-center font-bold text-sm py-2 rounded-lg ${ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {ok ? '✅ בגבולות — מאושר לטיסה' : '⛔ חריגה ממגבלות — לא מאושר'}
          </div>
        </Card>

      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm p-4">
      <h2 className="font-bold text-slate-800 text-sm mb-3 border-b pb-1">{title}</h2>
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
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-blue-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${value ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function WRow({ l, v }: { l: string; v: number }) {
  return (
    <div className="flex justify-between border-b border-slate-50 pb-1">
      <span className="text-slate-500">{l}</span>
      <span className="font-medium text-slate-700">{v.toFixed(0)} ק"ג</span>
    </div>
  )
}

function Limit({ label, actual, max, over }: { label: string; actual: number; max: number; over: boolean }) {
  const pct = Math.min((actual / max) * 100, 100)
  return (
    <div className={`rounded-lg p-2 ${over ? 'bg-red-50' : 'bg-slate-50'}`}>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className={over ? 'text-red-700 font-bold' : 'text-slate-600'}>
          {actual.toFixed(0)} / {max} ק"ג
        </span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : pct > 90 ? 'bg-orange-400' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
