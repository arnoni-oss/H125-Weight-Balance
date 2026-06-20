# H145 Weight & Balance — Developer Context

> קובץ זה הוא תיעוד טכני לשימוש בין-שיחות. מתכנת ← מתכנת.
> עודכן לאחרונה: יוני 2026

## מטרה

PWA מוביילי לחישוב משקל ואיזון מסוק H145 של יחידה אווירית משטרת ישראל.
ממשק עברית RTL. זהה בארכיטקטורה ל-H125 — קובץ יחיד + data.ts.
הטייס מזין נתונים → האפליקציה מחשבת CG ומגבלות משקל → תוצאה: מאושר/לא מאושר.

---

## מחסנית טכנית

| נושא | פרטים |
|------|--------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 + `@tailwindcss/vite` (Tailwind v4) |
| PWA | `vite-plugin-pwa` (generateSW mode) |
| Deploy | GitHub Actions → GitHub Pages |
| Deploy Branch | `claude/happy-volta-BBzTA` (טריגר deploy) |
| Working Branch | `claude/sleepy-planck-iiAey` (ענף עבודה) |
| Repo | `arnoni-oss/h125-weight-balance` |
| תיקייה | `h145wb/` (נפרדת מ-`h125wb/`) |
| קבצים עיקריים | `h145wb/src/App.tsx` (~790 שורות) + `h145wb/src/data.ts` (~534 שורות) |
| מקור נתונים | `H145wb.xlsx` (committed לריפו) |

אין router, אין state manager, אין backend.

### URLs:
- **H125**: `https://arnoni-oss.github.io/H125-Weight-Balance/`
- **H145**: `https://arnoni-oss.github.io/H125-Weight-Balance/h145/`

### Push pattern (תמיד לשני הברנצ'ים):
```bash
git push origin claude/sleepy-planck-iiAey
git push origin claude/sleepy-planck-iiAey:claude/happy-volta-BBzTA
```

### Deploy workflow (`.github/workflows/deploy.yml`):
בונה את שתי האפליקציות ומאחד: H125 בשורש, H145 ב-`dist/h145/`.

---

## הבדלים עיקריים מ-H125

| נושא | H125 | H145 |
|------|------|------|
| MTOW | 2370/2800 | 3700 (בסיס), 3800 (חריג אם OGE מאפשר) |
| זרוע דלק | קבועה (3.48 מ') | משתנה לפי מסה — טבלת `FUEL_CG_TABLE` |
| OGE tables | טבלה אחת | 4 טבלאות לפי BAMBI fill % (CARGO70/80/90/100) |
| BAMBI | hook / belly (2 מצבים) | off / cabin / hook (3 מצבים) |
| תצורות | 13 | 25 |
| מסוקים | 4 (BMK/BML/BMM/BMN) | 2 (BMO/BMP) |
| ציוד | Fixed arms | מתוך Excel — כל פריט lat/long אמיתי |
| מעטפת CG | 2 פוליגונים (STD/EXT) | טבלת `CG_LONG_ENVELOPE` לפי משקל חיצוני (bands) |
| CG רוחבי | פוליגון מלא | כרגע `±0.15` (placeholder — לאמת AFM) |

---

## קבועים

```typescript
MTOW_BASE     = 3700   // ק"ג — בסיס
MTOW_APPROVED = 3800   // ק"ג — חריג, זמין רק אם ogeLimit >= 3800
FUEL_MAX      = 723    // ק"ג — מקסימום פיזי
FUEL_MIN      = 40     // ק"ג — מינימום לחישוב
FUEL_BURN     = 4.0    // ק"ג/דקה — לאמת AFM ⚠️
FUEL_LANDING  = 100    // ק"ג — לחישוב זמן טיסה — לאמת AFM ⚠️

BAMBI_WATER_CAPACITY = 680  // ליטר = ק"ג מים (מ-Excel)
// BAMBI bucket weight: E['BAMBI BUCKET IN CABIN'].weight = 40 ק"ג
// BAMBI bucket arm on hook: E['BAMBI BUCKET ON HOOK'].longArm = 4.427 מ'
// BAMBI bucket arm in cabin: E['BAMBI BUCKET IN CABIN'].longArm = 4.5 מ'
```

---

## מסוקים

```typescript
export const HELICOPTERS: HelicopterData[] = [
  { id: 'BMO', emptyWeight: 2390.45, longArm: 4.714033601, latArm: -0.002374075 },
  { id: 'BMP', emptyWeight: 2386.95, longArm: 4.71397484,  latArm:  0.001141131 },
]
```

**ברירת מחדל:** BMP

---

## ציוד (EQUIPMENT) — כל הפריטים

```typescript
// שמות מדויקים לגישה דרך E[name]:
'Traffic Flight Officer Station (Stowed)'   // 19.18 ק"ג, long=3.897, lat=0.39
'Controp DSP-HD Camera'                     // 31.3  ק"ג, long=2.33,  lat=-1
'CONTROP IMAGER SHAPO'                      // 10.7  ק"ג, long=2.33,  lat=-1
'Controp Hand Controller'                   // 0.68  ק"ג, long=2.46,  lat=0
'Nightsun XP Search Light'                  // 26.31 ק"ג, long=2.63,  lat=1
'Nightsun Hand Controller'                  // 0.68  ק"ג, long=2.79,  lat=-0.14
'PA Speakers'                               // 13.52 ק"ג, long=5.81,  lat=-1
'FAST ROPE SYSTEM R'                        // 14    ק"ג, long=4.013, lat=0.98
'FAST ROPE SYSTEM L'                        // 14    ק"ג, long=4.013, lat=-0.98
'CARGO HOOK DOUBLE DET PROVISIONS'          // 29.77 ק"ג, long=4.121, lat=0
'CARGO EXTERNAL MIRRORS'                    // 4     ק"ג, long=1.12,  lat=0.3
'BAMBI BUCKET IN CABIN'                     // 40    ק"ג, long=4.5,   lat=0
'WEIGHT ON HOOK'                            // 0     ק"ג, long=4.427, lat=0  (זרוע בלבד)
'BAMBI BUCKET ON HOOK'                      // 0     ק"ג, long=4.427, lat=0  (זרוע בלבד)
```

**גישה בקוד:**
```typescript
const E = Object.fromEntries(EQUIPMENT.map(e => [e.name, e]))
```

### לוגיקת ציוד ב-`equipmentStations()`:
- `system === 'DSP-HD'` → DSP-HD Camera + Hand Controller
- `system === 'SHAPO'` → SHAPO + Hand Controller
- `xp === true` → Nightsun XP + Hand Controller
- `pa === true` → PA Speakers
- `cargoHook === true` → CARGO HOOK + (אם `cargoMirrors`) CARGO EXTERNAL MIRRORS
- `fastRope !== 'off'` → FAST ROPE R + L (fixed ו-extended מוסיפים אותו דבר ⚠️ לאמת)
- `bambiMode === 'cabin'` → BAMBI BUCKET IN CABIN
- `bambiMode === 'hook'` → BAMBI BUCKET ON HOOK (משקל 0, זרוע 4.427 — המים מתווספים בנפרד)

### צוות:
```typescript
add('טייס ימין', s.pilotR, 2.312, 0.39, 'אנשים')
add('טייס שמאל', s.pilotL, 2.312, -0.39, 'אנשים')
```

---

## תצורות (CONFIGS) — 25 תצורות

כסאות נוסעים כוללים משקל פיזי של הכסא + משקל הנוסע (נפרדים בחישוב).
כל כסא: `{ label, weight, longArm, latArm, seatId }` — זרועות אמיתיים מה-Excel (מ').

| id | שם | מושבים |
|----|-----|--------|
| 01 | קבועה - 4 כסאות | 4 |
| 02 | 2 כסאות / מתנא | 2 |
| 03 | בטן חלקה | 0 |
| 04 | תובלה 6 כסאות | 6 |
| 05 | תובלה - 7 כסאות | 7 |
| 06 | תובלה - 8 כסאות | 8 |
| 07 | תובלה - 9 כסאות | 9 |
| 08 | SAR - 2 כסאות | 2 |
| 09 | EMS - 2 כסאות | 2 |
| 10 | SAR + EMS מורחב | varies |
| 11 | חפק - 1 כסא | 1 |
| 12 | חפק - 2 כסאות | 2 |
| 13 | חפק - 3 כסאות | 3 |
| 14 | חפק - 4 כסאות | 4 |
| 15–25 | תצורות נוספות | varies |
| 24 | חפק מוטס - פונה אחורה - שורות קדמית/אמצעית/אחורית | 7 |
| 25 | חפק מוטס - התקנה קדמית - שורה קדמית ואמצעית | 4 |

**ברירת מחדל:** `'01'` (קבועה - 4 כסאות)

---

## AppState — ממשק המצב

```typescript
interface AppState {
  helicopter:      string          // 'BMO' | 'BMP'
  config:          string          // '01' .. '25'
  system:          'ללא' | 'SHAPO' | 'DSP-HD'
  xp:              boolean         // Nightsun XP
  pa:              boolean         // PA Speakers
  cargoHook:       boolean         // וו מטען
  cargoMirrors:    boolean         // מראות וו (רק אם cargoHook)
  fastRope:        'off' | 'fixed' | 'extended'
  bambiMode:       'off' | 'cabin' | 'hook'
  bambiFill:       number          // 0 | 70 | 80 | 90 | 100
  pilotR:          number
  pilotL:          number
  passengers:      number[]        // אורך = מספר כסאות בתצורה
  externalLoad:    number          // ק"ג — מטען על הוו (לא BAMBI)
  fuel:            number          // ק"ג
  altitude:        number          // רגל: 0,500,1000,...,4000
  temperature:     number          // °C: 10,15,20,...,40
  max3800Approved: boolean         // אישור חריג — רק אם OGE ≥ 3800
  customStations:  CustomStation[]
}

interface CustomStation { name: string; weight: number; longArm: number }
// latArm תמיד 0

type BambiMode = 'off' | 'cabin' | 'hook'
type FastRope  = 'off' | 'fixed' | 'extended'
```

**ברירת מחדל (DEF):**
```typescript
{ helicopter:'BMP', config:'01', system:'DSP-HD',
  xp:true, pa:false, cargoHook:true, cargoMirrors:false,
  fastRope:'off', bambiMode:'off', bambiFill:0,
  pilotR:80, pilotL:80, passengers:[0,0,0,0],
  externalLoad:0, fuel:500,
  altitude:2000, temperature:20,
  max3800Approved:false, customStations:[] }
```

---

## זרימת חישוב ראשי

```typescript
// buildStations(s) → Station[]
// כולל: מסוק ריק + ציוד + צוות + כסאות + נוסעים + מטען חיצוני + דלק

const stations  = buildStations(s)
const takeoffW  = sum(stations.weight)
const { longCG, latCG } = calcCG(stations)

const bambiWaterW = (bambiMode==='hook' && bambiFill>0) ? round(680 * bambiFill/100) : 0
const extW        = externalLoad + bambiWaterW
const internalW   = takeoffW - extW

const ogeLimit    = getOGE(altitude, temperature, bambiMode, bambiFill)
const mtowEffective = (max3800Approved && ogeLimit >= 3800) ? 3800 : 3700

// מגבלות BAMBI על הוו
const bambiLimits      = MAX_BAMBI_BY_OGE_TABLE.find(r => r.bambiFill === bambiFill) ?? null
const maxInternalLimit = bambiLimits ? bambiLimits.maxInternalWeight : mtowEffective
const maxFuelByBambi   = bambiLimits ? bambiLimits.maxFuel : FUEL_MAX
const maxFuelByMTOW    = floor(mtowEffective  - (takeoffW - fuelW))
const maxFuelByOGE     = floor(ogeLimit       - (takeoffW - fuelW))
const maxFuelAllowed   = max(FUEL_MIN, min(FUEL_MAX, maxFuelByBambi, maxFuelByMTOW, maxFuelByOGE))

// בדיקות חריגה
const overMTOW     = takeoffW  > mtowEffective
const overOGE      = takeoffW  > ogeLimit
const overInternal = internalW > maxInternalLimit

// מעטפת CG
const longEnv = getLongEnvelope(extW)          // ceiling לפי band (100,200,...,800)
const cgLongOK = takeoffW < 1500 || isInPolygon(longCG, takeoffW, longEnv)
const cgLatOK  = Math.abs(latCG) < 0.15       // ⚠️ PLACEHOLDER — לאמת AFM

const ok = !overMTOW && !overOGE && !overInternal && cgLongOK && cgLatOK
```

---

## לוגיקת BAMBI

### `bambiMode === 'off'`
- אין BAMBI, אין מים, bambiFill = 0
- extW = externalLoad בלבד

### `bambiMode === 'cabin'`
- BAMBI BUCKET IN CABIN (40 ק"ג, long=4.5) נוסף לציוד
- אין מים, bambiFill = 0
- extW = externalLoad בלבד
- OGE table: CARGO70 (ברירת מחדל)

### `bambiMode === 'hook'`
- BAMBI BUCKET ON HOOK נוסף לציוד (משקל 0, רק זרוע)
- bambiFill חייב להיות 70/80/90/100
- `bambiWaterW = round(680 * bambiFill / 100)` → 476/544/612/680 ק"ג
- מים נוספים כ-station 'מים BAMBI X%' (long=4.427, lat=0)
- `extW = externalLoad + bambiWaterW`
- OGE table: CARGO70/80/90/100 לפי bambiFill
- `bambiLimits` פעיל → `maxInternalWeight` + `maxFuel` מוגבלים
- UI: כפתורי 70% / 80% / 90% / 100%

**שינוי BAMBI mode:**
```typescript
// כש-mode משתנה ל-hook → bambiFill ← max(70, bambiFill) כדי לוודא ≥70
setS(p => ({ ...p, bambiMode: m, bambiFill: m === 'hook' ? Math.max(70, p.bambiFill) : 0 }))
```

---

## OGE — לוגיקת lookup

```typescript
function getOgeKey(bambiMode, bambiFill): 'CARGO70'|'CARGO80'|'CARGO90'|'CARGO100' {
  if (bambiMode === 'hook' && bambiFill >= 100) return 'CARGO100'
  if (bambiMode === 'hook' && bambiFill >= 90)  return 'CARGO90'
  if (bambiMode === 'hook' && bambiFill >= 80)  return 'CARGO80'
  return 'CARGO70'  // ברירת מחדל: off / cabin / hook-70
}

function getOGE(alt, tmp, bambiMode, bambiFill): number {
  const alts = [0,500,1000,1500,2000,2500,3000,3500,4000]
  const tmps = [10,15,20,25,30,35,40]
  const a = alts.find(v => v >= alt) ?? alts[alts.length - 1]  // ceiling — שמרני
  const t = tmps.find(v => v >= tmp) ?? tmps[tmps.length - 1]  // ceiling — שמרני
  return OGE_TABLES[getOgeKey(bambiMode, bambiFill)][a][t]
}
```

**הצגת OGE ב-UI:** בניגוד ל-H125, OGE **תמיד מוצג** (אין showOGE conditional) — מגבלת המנוע תמיד רלוונטית ב-H145.

### מגבלת BAMBI על הוו (MAX_BAMBI_BY_OGE_TABLE):
```typescript
{ bambiFill: 70,  maxFuel: 484, maxInternalWeight: 3179.602 }
{ bambiFill: 80,  maxFuel: 416, maxInternalWeight: 3120 }
{ bambiFill: 90,  maxFuel: 348, maxInternalWeight: 3050 }
{ bambiFill: 100, maxFuel: 280, maxInternalWeight: 2980 }
```
פעיל רק כש-`bambiMode === 'hook'`.

### MTOW 3800 toggle:
```tsx
<Tog label="אישור חריג MTOW 3800 ק״ג" value={s.max3800Approved}
  onChange={v => set('max3800Approved', v)}
  disabled={ogeLimit < MTOW_APPROVED}
  disabledReason={`OGE מגביל ל-${ogeLimit} ק"ג`} />
```

---

## מעטפת CG אורכי — CG_LONG_ENVELOPE

מבנה הנתונים:
```typescript
CG_LONG_ENVELOPE: Record<string, CargoEnvelope>
// מפתחות: 'CARGO', 'CARGO70', 'CARGO80', 'CARGO90', 'CARGO100'
```

כל `CargoEnvelope` מכיל `byCargoWeight` — 8 bands: 100/200/300/400/500/600/700/800 ק"ג.
כל band מוגדר ע"י 4 נקודות D→A→B→C (polygon).

**בקוד נוכחי מוגדרת רק 'CARGO':**
```typescript
function getLongEnvelope(cargoWeight: number): [number, number][] {
  const env = CG_LONG_ENVELOPE.CARGO   // ⚠️ לא משתמש ב-CARGO70/80/90/100
  const bands = [100,200,300,400,500,600,700,800]
  const band = bands.find(b => b >= cargoWeight) ?? 800   // ceiling
  const poly = env.byCargoWeight[band]
  const [a,b,c,d] = ['A','B','C','D'].map(l => poly.find(p => p.label === l)!)
  return [[a.longArm,a.weight],[b.longArm,b.weight],[c.longArm,c.weight],[d.longArm,d.weight],[a.longArm,a.weight]]
}
```

**בדיקה:**
```typescript
const cgLongOK = takeoffW < 1500 || isInPolygon(longCG, takeoffW, longEnv)
```
ל-1500 ומטה אין מגבלת מעטפת.

---

## FUEL_CG_TABLE — זרוע דלק משתנה

בניגוד ל-H125 (זרוע קבועה 3.48), ב-H145 הזרוע משתנה לפי מסת הדלק.
71 שורות: mass 10→723 ק"ג.

**דגימות:**
```
mass=10:  long=3.603, lat=0.136
mass=100: long=3.580, lat=0.017
mass=300: long=4.238, lat=0.006
mass=500: long=4.361, lat=-0.001
mass=723: long=4.368, lat=-0.002
```

**חיפוש — nearest mass:**
```typescript
function getFuelCG(mass: number): { longArm, latArm } {
  // clamp לטווח + nearest neighbor
}
```

---

## buildStations(s, fuelOverride?)

```
מסוק ריק → equipmentStations (ציוד) → טייסים → כסאות × נוסעים → תחנות ידניות
→ מים BAMBI (אם hook) → עומס חיצוני → דלק (CG משתנה)
```

**3 קריאות לחישוב מסלול:**
- המראה: `buildStations(s)` → `s.fuel`
- (בלשונית מרכז כובד: אמצע/נחיתה אינם מחושבים כרגע ⚠️)

**לשוניות:**
1. `ראשי` — טפסים + תוצאות
2. `מרכז כובד` — טבלת תחנות (בלבד — ללא גרף CG כרגע ⚠️)

---

## לשונית ראשי — סדר רכיבי UI

1. toggle גודל טקסט (localStorage key: `'largeText_h145'`)
2. כרטיס **מסוק** — זנב + תצורה (+ שורת ריק/long/lat)
3. כרטיס **ציוד** — מערכת, XP, PA, וו, מראות, FR, BAMBI
4. accordion **פירוט תצורה** (מתכווץ)
5. כרטיס **צוות ונוסעים**
6. כרטיס **דלק ומשקל על הוו** (כולל זמן טיסה)
7. כרטיס **תנאי שטח** (גובה + טמפ')
8. כרטיס **תוצאות** (פסי מגבלות + CG + toggle 3800)

---

## רכיבי UI

| רכיב | תיאור |
|------|--------|
| `Card` | מסגרת לבנה עם כותרת |
| `Field` | label + content |
| `Sel` | `<select>` מעוצב, תומך `labels` נפרד |
| `Num` | input עם +/− (default step=5) |
| `Tog` | toggle switch, תומך disabled + disabledReason |
| `WR` | שורת משקל: label + ק"ג |
| `R2` | שורת string |
| `LimitBar` | פס מגבלה ירוק/אדום |
| `BannerCell` | תא בבאנר התחתון |
| `CGLongBar` | גרף SVG מעטפת CG אורכי + נקודת המראה |

### LimitBar:
```tsx
// זהה ל-H125 — ירוק/אדום בלבד, ללא כתום
function LimitBar({ label, actual, max, over }) { ... }
```

### CGLongBar — H145 specific:
```typescript
const W = 320, H = 70
const xMin = 4.25, xMax = 4.75   // טווח תצוגה (שונה מ-H125!)
const sy = (y) => H - ((y - 1500) / (4000 - 1500)) * H
// מציג נקודת המראה בלבד (אין אמצע/נחיתה כרגע)
```

### באנר תחתון:
```tsx
<div className={`fixed bottom-0 ... ${ok ? 'bg-emerald-700' : 'bg-red-700'}`}>
  <span className="font-bold text-[0.9625rem]">
    {ok ? '✅ מאושר לטיסה' : '⛔ לא מאושר לטיסה'}
  </span>
  <div className="grid grid-cols-2 gap-1.5">
    <BannerCell label="משקל / מבנה" value={`${takeoffW}/${mtowEffective}`} ok={!overMTOW && !overInternal} />
    <BannerCell label="מנוע OGE"    value={`${takeoffW}/${ogeLimit}`}       ok={!overOGE} />
  </div>
  {(!cgLongOK || !cgLatOK) && ... CG banner cells ... }
</div>
```

### Toasts:
- `⛔` אדום: overMTOW, overInternal
- `⚠️` כתום: overOGE, cgLong/Lat
- edge-trigger (false→true), debounce 1500ms, סגירה בלחיצה

---

## זמן טיסה

```typescript
// מוצג רק אם fuel > FUEL_LANDING (100 ק"ג)
Math.floor((fuel - FUEL_LANDING) / FUEL_BURN)  // דקות
// "זמן טיסה: X דק' · נחיתה 100 ק"ג · 4.0 ק"ג/דק'"
```

---

## data.ts — מבנה ייצוא

```typescript
export interface HelicopterData { id, emptyWeight, longArm, latArm }
export interface EquipmentData  { name, weight, longArm, latArm }
export interface SeatData       { label, weight, longArm, latArm, seatId }
export interface ConfigData     { id, name, seats: SeatData[] }
export interface FuelCGRow      { mass, longArm, latArm }
export interface BambiLimitRow  { bambiFill, maxFuel, maxInternalWeight }
export interface EnvelopePoint  { label, longArm, weight }
export interface CargoEnvelope  { top: { fwd, aft }, byCargoWeight: Record<number, EnvelopePoint[]> }

export const HELICOPTERS:           HelicopterData[]
export const EQUIPMENT:             EquipmentData[]
export const CONFIGS:               ConfigData[]
export const CG_LONG_ENVELOPE:      Record<string, CargoEnvelope>
export const OGE_TABLES:            Record<string, Record<number, Record<number, number>>>
export const FUEL_CG_TABLE:         FuelCGRow[]
export const MAX_BAMBI_BY_OGE_TABLE: BambiLimitRow[]
```

**חשוב:** כל הזרועות ב-data.ts הן **מטרים** (המירה מ-mm ÷ 1000 בזמן יצירת הקובץ).
אין להשתמש ב-`as const` — גורם לשגיאות TypeScript. יש להשתמש ב-interfaces מפורשים.

---

## Git

```bash
Working branch: claude/sleepy-planck-iiAey
Deploy branch:  claude/happy-volta-BBzTA
Remote:         origin → arnoni-oss/h125-weight-balance
Deploy:         GitHub Actions → GitHub Pages (אוטומטי על push ל-BBzTA)

Build H145:     cd h145wb && npm ci && npm run build
Dev server:     cd h145wb && npm run dev

# כל push לשני הברנצ'ים:
git push origin claude/sleepy-planck-iiAey
git push origin claude/sleepy-planck-iiAey:claude/happy-volta-BBzTA
```

---

## TODOs / לאמת עם AFM

| נושא | מצב | הערה |
|------|-----|------|
| `cgLatOK = abs(latCG) < 0.15` | ⚠️ PLACEHOLDER | לאמת מעטפת רוחבית מה-AFM |
| `FUEL_BURN = 4.0` ק"ג/דק' | ⚠️ לאמת | קצב שריפה משוער |
| `FUEL_LANDING = 100` ק"ג | ⚠️ לאמת | מינימום לנחיתה |
| Fast Rope fixed vs extended | ⚠️ זהה כרגע | האם יש הבדל במשקל? |
| גרף CG (CGChart2D) | ⚠️ חסר | רק CGLongBar כרגע, אין 2D chart מלא |
| אמצע/נחיתה בלשונית CG | ⚠️ חסר | buildStations נקרא פעם אחת בלבד |
| CG_LONG_ENVELOPE CARGO70/80/90/100 | ⚠️ לא בשימוש | getLongEnvelope משתמש ב-CARGO בלבד |
| OGE_TABLE | ✅ מה-Excel | לאמת מול AFM הרשמי |
| BAMBI MAX table | ✅ מה-Excel | bambiFill 70/80/90/100 |
| FUEL_CG_TABLE | ✅ מה-Excel (71 שורות) | זרוע משתנה 10→723 ק"ג |
| זרועות ציוד | ✅ מה-Excel | כולם אמיתיים |
| משקלי כסאות | ✅ מה-Excel | כל 25 תצורות |
