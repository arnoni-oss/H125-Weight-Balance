# H125 Weight & Balance — Developer Context

> קובץ זה הוא תיעוד טכני לשימוש בין-שיחות. מתכנת ← מתכנת.
> עודכן לאחרונה: יוני 2026

## מטרה

PWA מוביילי להחלפת גיליון Excel לחישוב משקל ואיזון למסוק H125 של יחידה אווירית משטרת ישראל.
ממשק עברית RTL. הטייס מזין נתונים → האפליקציה מחשבת CG ומגבלות משקל → תוצאה: מאושר/לא מאושר.

---

## מחסנית טכנית

| נושא | פרטים |
|------|--------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 + `@tailwindcss/vite` (Tailwind v4) |
| PWA | `vite-plugin-pwa` (generateSW mode) |
| Deploy | GitHub Actions → GitHub Pages |
| Deploy Branch | `claude/happy-volta-BBzTA` (טריגר deploy) |
| Working Branch | `claude/kind-curie-Zz6Bf` (ענף עבודה) |
| Repo | `arnoni-oss/h125-weight-balance` |
| קובץ עיקרי | `h125wb/src/App.tsx` (קובץ יחיד, ~1200 שורות) |
| CSS | `h125wb/src/index.css` (Tailwind import + spinner hide) |

אין router, אין state manager, אין backend. הכל ב-App.tsx אחד.

### Push pattern (תמיד לשני הברנצ'ים):
```bash
git push origin claude/kind-curie-Zz6Bf
git push origin claude/kind-curie-Zz6Bf:claude/happy-volta-BBzTA
```

---

## קבועים — ערכים מאומתים (לא לשנות בלי אישור)

```typescript
// זרועות
FUEL_ARM         = 3.48   // דלק
BAMBI_ARM        = 3.38   // BAMBI (וו + בטן) — כמו מתלה מטען
// external load arm: 3.38 (hardcoded in buildStations)

// מגבלות CG אורכי — לבדיקה בלבד (המעטפת מוגדרת בפוליגונים)
CG_FWD           = 3.269
CG_AFT           = 3.4358
CG_VIS_MIN       = 3.15   // לתצוגת הבר בלבד
CG_VIS_MAX       = 3.55   // לתצוגת הבר בלבד

// דלק
MIN_FUEL         = 40     // ק"ג מינימום
FUEL_BURN_RATE   = 2.8    // ק"ג/דקה
FUEL_LANDING_MIN = 60     // ק"ג מינימום לנחיתה (לחישוב זמן טיסה)
// מקסימום פיזי: 426 ק"ג

// BAMBI
BAMBI_CAPACITY_L   = 680  // ליטר = ק"ג מים (לאמת עם AFM)
BAMBI_EMPTY_WEIGHT = 40   // ק"ג מיכל ריק
BAMBI_ARM          = 3.38 // מ' — זהה לזרוע וו חיצוני

// מגבלות משקל
MTOW_NO_HOOK    = 2370    // ללא מטען על הוו — משקל כולל מקס
MAX_INTERNAL    = 2250    // עם מטען על הוו — משקל פנימי מקס
MTOW_WITH_HOOK  = 2800    // עם מטען על הוו — משקל כולל מקס
```

---

## מסוקים — משקלי בסיס

```typescript
{ id: 'BMK', emptyWeight: 1605.6, longArm: 3.54, latArm:  0.007 }
{ id: 'BML', emptyWeight: 1609.5, longArm: 3.50, latArm: -0.010 }
{ id: 'BMM', emptyWeight: 1610.8, longArm: 3.52, latArm: -0.010 }
{ id: 'BMN', emptyWeight: 1613.1, longArm: 3.52, latArm: -0.010 }
```

---

## ציוד — משקלים וזרועות

```typescript
מצלמה SHAPO:   18.0 ק"ג, long=1.03, lat=-0.53
מצלמה DSP-HD:  31.3 ק"ג, long=1.03, lat=-0.53
פנס XP:        33.0 ק"ג, long=4.83, lat=0.00
וו חיצוני:     13.6 ק"ג, long=3.38, lat=0.00
מראות וו:       1.7 ק"ג, long=0.28, lat=0.65
// cargoHook = true → מוסיף שניהם (15.3 ק"ג סה"כ)
```

### סלקטור מערכת תצפית — אפשרויות:
```typescript
opts={['ללא','SHAPO','DSP-HD']}
labels={['ללא','SHAPO (מערכת קטנה)','DSP (מערכת גדולה)']}
```

---

## תצורות ישיבה — SEAT_ARMS

זרוע אורכי אחיד: 2.54 מ' לכולם.
זרועות רוחביות: ±0.62 (חיצוניים), ±0.38 (פנימיים), 0.00 (אמצע).

```typescript
'01': [[2.54, -0.62]]                                          // 1 מושב
'02': [[2.54, -0.62], [2.54,  0.62]]                          // 2 מושבים: שמאל, ימין
'03': [[2.54, -0.62], [2.54,  0.00], [2.54,  0.62]]          // 3: שמאל, אמצע, ימין
'04': [[2.54, -0.62], [2.54,  0.00], [2.54,  0.62]]          // 3: שמאל, אמצע, ימין
'05': [[2.54, -0.62], [2.54,  0.62], [2.54, -0.38], [2.54,  0.38]] // 4 מושבים
'06': []                                                        // אין מושבים
'07': [[2.54, -0.62]]
'08': [[2.54, -0.62], [2.54,  0.62]]
'09': [[2.54, -0.62], [2.54,  0.00], [2.54,  0.62]]          // 3: שמאל, אמצע, ימין
'10': [[2.54, -0.62]]
'11': [[2.54, -0.62], [2.54,  0.62]]
'12': [[2.54, -0.62], [2.54,  0.00], [2.54,  0.62]]          // 3: שמאל, אמצע, ימין
'13': [[2.54, -0.62], [2.54,  0.62], [2.54,  0.00], [2.54,  0.38]] // CUSTOM 4
```

### תצוגת מושבים ב-UI:
- 1 מושב: "נוסע 1"
- 2 מושבים: grid 2 עמודות, `dir="ltr"`, labels: `שמאל` (idx 0) / `ימין` (idx 1)
- 3 מושבים: grid 3 עמודות, `dir="ltr"`, labels: `שמאל` (idx 0) / `אמצע` (idx 1) / `ימין` (idx 2)
- 4 מושבים: "נוסע 1–4"

---

## AppState — ממשק המצב

```typescript
interface AppState {
  helicopter:    string           // 'BMK'|'BML'|'BMM'|'BMN'
  config:        string           // '01'–'13'
  system:        string           // 'ללא'|'SHAPO'|'DSP-HD'
  xp:            boolean          // פנס XP
  cargoHook:     boolean          // וו + מראות
  bambiFill:     number           // 0|70|80|90|100 (אחוז מילוי, 0=כבוי)
  bambiMode:     'hook'|'belly'   // hook=וו חיצוני, belly=בטן (ריק)
  pilotR:        number           // ק"ג טייס ימין
  pilotL:        number           // ק"ג טייס שמאל
  passengers:    number[]         // ק"ג לכל מושב (אורך = configSeats)
  externalLoad:  number           // ק"ג מטען על הוו (נפרד מ-BAMBI)
  fuel:          number           // ק"ג
  altitude:      number           // רגל: 0,500,1000,...,4000
  temperature:   number           // °C: 10,15,20,...,40
  ogeReserve80:  boolean          // האם להפחית 80 ק"ג ממגבלת מנוע
  customStations: CustomStation[] // תחנות ידניות נוספות
}

interface CustomStation { name: string; weight: number; longArm: number }
// latArm של תחנה ידנית = 0 תמיד
```

**ברירת מחדל (DEF):** BMK, config 11, SHAPO, XP=true, cargoHook=true,
bambiFill=0, bambiMode='hook', pilots 80/80, fuel 400, alt 2000, temp 20, ogeReserve80=true.

---

## לוגיקת BAMBI

### מצב וו חיצוני (`bambiMode === 'hook'`)
- `bambiWater = Math.round(680 * bambiFill / 100)` ← מים על הוו
- `extW = externalLoad + bambiWater` ← מטען חיצוני כולל
- `hasHook = extW > 0` → מגבלות 2250/2800 פעילות
- `effectiveOgeReserve80 = true` ← נעול, לא ניתן לשנות
- OGE toggle מוצג מושבת עם הסבר "🔒 BAMBI על הוו"
- UI: כפתורי 70/80/90/100% + טבלת דלק מקס

### מצב בטן (`bambiMode === 'belly'`)
- `bambiWater = 0` ← אין מים (מיכל ריק)
- BAMBI_EMPTY_WEIGHT (40 ק"ג) כלול ב-`dryW` דרך `equipW`
- `extW = externalLoad` ← רק מטען חיצוני אחר
- `hasHook` לפי `externalLoad > 0` בלבד
- מגבלות רגילות (2370 ללא מטען חיצוני)
- `ogeReserve80` חופשי לשינוי
- UI: מציג "מיכל ריק — 40 ק"ג · מגבלות רגילות"

---

## זרימת חישוב ראשי (בתוך App())

```typescript
equipW    = equipWeight(system, xp, cargoHook, bambiFill)
dryW      = emptyW + equipW
crewW     = pilotR + pilotL
paxW      = sum(passengers)
customW   = sum(customStations.weight)
bambiWater = (bambiFill>0 && bambiMode==='hook') ? round(680*bambiFill/100) : 0
extW      = externalLoad + bambiWater
fuelW     = fuel
takeoffW  = dryW + crewW + paxW + customW + extW + fuelW
internalW = takeoffW - extW
ogeRaw    = getOGE(altitude, temperature)   // lookup nearest in OGE_TABLE
effectiveOgeReserve80 = (bambiFill>0 && bambiMode==='hook') ? true : ogeReserve80
ogeLimit  = effectiveOgeReserve80 ? ogeRaw - 80 : ogeRaw
hasHook   = extW > 0
baseIntNoBambi = dryW + crewW + paxW + customW  // לחישוב טבלת BAMBI

// מגבלות משקל
weightNoFuel  = takeoffW - fuelW
maxFuelByOGE  = floor(ogeLimit - weightNoFuel)
maxFuelByMTOW = floor((hasHook ? 2800 : 2370) - weightNoFuel)
maxFuelByInt  = hasHook ? floor(2250 - weightNoFuel + extW) : 426
maxFuelAllowed = max(MIN_FUEL, min(426, maxFuelByOGE, maxFuelByMTOW, maxFuelByInt))

// בדיקות חריגה
overMTOW     = !hasHook && takeoffW  > 2370
overInternal =  hasHook && internalW > 2250
overTotal    =  hasHook && takeoffW  > 2800
overOGE      = takeoffW > ogeLimit

// מעטפות CG — סטטיות, אינן משתנות לפי OGE
const extLongEnv = EXT_LONG_ENV
const extLatEnv  = EXT_LAT_ENV
longEnv    = hasHook ? extLongEnv : STD_LONG_ENV
latEnv     = hasHook ? extLatEnv  : STD_LAT_ENV
cgLongOK   = takeoffW < 1100 || isInPolygon(longCG, takeoffW, longEnv)
cgLatOK    = takeoffW < 1100 || isInPolygon(latCG,  takeoffW, latEnv)
ok = !overMTOW && !overInternal && !overTotal && !overOGE && cgLongOK && cgLatOK
```

**חשוב:** מעטפת CG ובדיקת OGE הן בדיקות נפרדות. OGE/גובה/טמפרטורה לא משפיעים על צורת המעטפת.
הדבר היחיד שמשנה את המעטפת: `hasHook` (יש/אין מטען על הוו).

---

## מעטפות CG (Polygons) — ערכי AFM

כל נקודה: `[זרוע, משקל]`. `isInPolygon` — ray-casting.
אלו **קבועים סטטיים**, לא פונקציות.

```typescript
// סטנדרט ללא הוו
const STD_LONG_ENV: [number, number][] = [
  [3.23, 2370], [3.407, 2370], [3.49, 1750],
  [3.498, 1310], [3.17, 1310], [3.17, 2000], [3.23, 2370],
]
const STD_LAT_ENV: [number, number][] = [
  [-0.08, 2370], [0.08, 2370], [0.08, 2250],
  [0.14, 2250], [0.14, 1300], [-0.18, 1300],
  [-0.18, 2250], [-0.08, 2250], [-0.08, 2370],
]

// חיצוני עם הוו
const EXT_LONG_ENV: [number, number][] = [
  [3.29, 2800], [3.43, 2800], [3.492, 1310],
  [3.17, 1310], [3.17, 2000], [3.29, 2800],
]
const EXT_LAT_ENV: [number, number][] = [
  [-0.08, 2370], [-0.08, 2660], [0.08, 2660], [0.08, 2370],
]

// שימוש:
const extLongEnv = EXT_LONG_ENV  // לא getExtLongEnv() — הפונקציות הוסרו
const extLatEnv  = EXT_LAT_ENV
```

---

## OGE_TABLE (lookup — nearest neighbor)

גובה × טמפרטורה → MTOW לריחוף מה"ק. אורכים 0–4000 רגל, טמפ' 10–40°C.
`getOGE(alt, tmp)` מוצא את הגובה והטמפ' הקרובים ביותר בטבלה.

---

## זמן טיסה

מוצג בסוגריים ליד נתון הדלק בתוצאות:
```
floor((fuelW - 60) / 2.8) דקות
```
"לפי 60 ק"ג לנחיתה ו-2.8 ק"ג/דקה"

---

## לשוניות ורכיבי UI

### לשונית `ראשי` (Tab 1)
1. **טקסט מוגדל** — toggle switch מעל בחירת מסוק (ראה פירוט למטה)
2. **מסוק** — בחירת זנב + תצורה
3. **ציוד** — מערכת תצפית, XP, וו, BAMBI
4. **פירוט תצורה** — accordion מתכווץ
5. **צוות ונוסעים** — `Num` עם +/−
6. **דלק ומשקל על הוו** — מציג `maxFuelAllowed` בשדה
7. **משקל נוסף** — תחנות ידניות (שם, משקל, זרוע)
8. **תנאי שטח** — גובה, טמפ', OGE toggle
9. **תוצאות** — פסי מגבלות `LimitBar`, ברי CG (`CGLongBar` + `CGLatBar`)

### לשונית `בקרת מרכז כובד` (Tab 2)
- טבלת תחנות ומומנטים (buildStations)
- גרף `CGChart2D` — שני גרפים (אורכי + רוחבי), תמיד גלויים (ללא accordion)

---

## toggle טקסט מוגדל

```typescript
const [largeText, setLargeText] = useState(() => localStorage.getItem('largeText') === '1')
useEffect(() => {
  document.documentElement.style.fontSize = largeText ? '20px' : '16px'
  localStorage.setItem('largeText', largeText ? '1' : '0')
}, [largeText])
```

**מבנה JSX (מעל כרטיס בחירת מסוק, בלשונית ראשי):**
```tsx
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
```

**חשוב:** `dir="ltr"` על ה-div הפנימי — בלעדיו הטריגר מופיע הפוך ב-RTL.
צבעי ה-א' **קבועים** (לא דינמיים): שמאל תמיד אפור, ימין תמיד כחול-מודגש.
כל `text-[Xpx]` בקובץ הומר ל-rem כדי לגדול עם html font-size:
- `text-[9px]` → `text-[0.5625rem]`
- `text-[10px]` → `text-[0.625rem]`
- `text-[11px]` → `text-[0.6875rem]`

---

## רכיבים מובנים (פונקציות)

| רכיב | תיאור |
|------|--------|
| `Card` | מסגרת לבנה עם כותרת |
| `Field` | label + content |
| `Sel` | `<select>` מעוצב, תומך `labels` נפרד מ-`opts` |
| `Num` | input עם כפתורי +/− וסלקט-בלחיצה |
| `Tog` | toggle switch, תומך `disabled` + `disabledReason` |
| `WR` | שורת תוצאה: label + ערך ק"ג |
| `R2` | שורת תצוגה: label + ערך string |
| `LimitBar` | פס מגבלה — ירוק עד החריגה, אז אדום (ללא כתום) |
| `CGChart2D` | גרף SVG למעטפת + נקודות מסלול (המראה/אמצע/נחיתה) |
| `CGLongBar` | בר CG אורכי עם חץ שינוי, ערך המראה מעל, נחיתה מתחת |
| `CGLatBar` | בר CG רוחבי, מספרים בקצוות הירוק בלבד |
| `BannerCell` | תא בבאנר התחתון |

---

## LimitBar — ירוק/אדום בלבד (ללא כתום)

```tsx
function LimitBar({ label, actual, max, over }: { label: string; actual: number; max: number; over: boolean }) {
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
```

---

## CGLongBar — ערכי CG מעל ומתחת

- ערך המראה (`cgTake`) מוצג **מעל** הבר
- ערך נחיתה (`cgLand`) מוצג **מתחת** לבר
- חץ שינוי: מוצג תמיד כשיש הפרש (`Math.abs(delta) > 0.001`) — ללא סף 5%
- כל שורות הערכים: `dir="ltr"` + `style={{ left: X%, transform: 'translateX(-50%)' }}`

---

## CGLatBar — מספרים בקצוות הירוק בלבד

```tsx
<div className="relative text-[0.5625rem] mt-0.5 text-slate-400 h-3" dir="ltr">
  <span className="absolute" style={{ left: `${limLpct}%`, transform: 'translateX(-50%)' }}>-0.18</span>
  <span className="absolute" style={{ left: `${limRpct}%`, transform: 'translateX(-50%)' }}>0.14</span>
</div>
```
רק הגבול השמאלי (-0.18) והגבול הימני (0.14) מוצגים — לא 0 ולא הקצוות האפורים.

---

## CGChart2D — עיצוב נקודות

```tsx
// dots: [takeoff, ...mid..., landing]
dots.map((d, i) => {
  const inEnv = hasHook ? isInPolygon(d.x, d.y, extPoly) : isInPolygon(d.x, d.y, stdPoly)
  const c = inEnv ? '#16a34a' : '#dc2626'
  const isLanding = i === dots.length - 1
  const isMid = i > 0 && !isLanding
  return <circle key={i} cx={sx(d.x)} cy={sy(d.y)}
    r={i === 0 ? 5.5 : 4}
    fill={isLanding ? 'white' : isMid ? '#94a3b8' : c}  // המראה=ירוק/אדום, אמצע=אפור, נחיתה=חלול
    stroke={isLanding ? (inEnv ? '#0284c7' : '#dc2626') : 'white'}
    strokeWidth="1.8" />
})
```

---

## CGChart2D — מקרא (legend)

```tsx
<div className="text-center text-[0.5625rem] text-slate-400 -mt-0.5 mb-0.5">m</div>
<div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.5625rem] mt-0.5 text-slate-400 items-center justify-center">
  <span className="flex items-center gap-1">
    <span className="inline-block w-3 h-2.5 rounded-sm bg-blue-100 border border-blue-400" />
    מעטפת ללא משקל על הוו
  </span>
  <span className="flex items-center gap-1">
    <span className="inline-block w-3 h-2.5 rounded-sm bg-red-100 border border-red-400" />
    מעטפת עם משקל הוו
  </span>
  <span className="flex items-center gap-1">
    <span className="inline-block w-3 h-3 rounded-full bg-green-600 border-2 border-white shadow-sm" />המראה
  </span>
  <span className="flex items-center gap-1">
    <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400 border border-white shadow-sm" />אמצע גיחה
  </span>
  <span className="flex items-center gap-1">
    <span className="inline-block w-3 h-3 rounded-full bg-white border-2 border-sky-500 shadow-sm" />נחיתה
  </span>
</div>
```
סדר מימין לשמאל: המראה / אמצע גיחה / נחיתה.
המלל **מחוץ** לריבוע הצבעוני — לא עליו.

---

## באנר מרחף תחתון

שני תאים עיקריים (תמיד), ועד שניים נוספים (רק כשיש חריגת CG):

```tsx
<div className="space-y-1.5">
  <div className="grid grid-cols-2 gap-1.5">
    <BannerCell
      label='מגבלת מבנה'
      value={`${takeoffW.toFixed(0)}/${!hasHook ? MTOW_NO_HOOK : MTOW_WITH_HOOK}`}
      ok={!(overMTOW || overInternal || overTotal)}
    />
    <BannerCell
      label={effectiveOgeReserve80 ? 'מגבלת מנוע מה"ק -80' : 'מגבלת מנוע מה"ק'}
      value={`${takeoffW.toFixed(0)}/${ogeLimit}`}
      ok={!overOGE}
    />
  </div>
  {(!cgLongOK || !cgLatOK) && (
    <div className={`grid gap-1.5 ${!cgLongOK && !cgLatOK ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {!cgLongOK && <BannerCell label="מ.כ. אורכי" value={`${longCG.toFixed(2)} מ'`} ok={false} />}
      {!cgLatOK && <BannerCell label="מ.כ. רוחבי" value={`${latCG.toFixed(2)} מ'`} ok={false} />}
    </div>
  )}
</div>
```

**שים לב:** label מגבלת מנוע מתעדכן לפי `effectiveOgeReserve80`.

---

## טבלת בקרת מרכז כובד

מחולקת לקבוצות: מסוק / מערכות / אנשים / דלק / אחר.
- כל הטקסט: `text-center`
- הפרדה בין "מומנט אורכי" ל-"זרוע רוחבי": `border-l` (לא `border-r` — בגלל RTL)
  - כותרת: `border-l border-slate-300`
  - תאי נתונים: `border-l border-slate-200`
  - שורת סיכום: `border-l border-slate-200`
  - שורת סה"כ: `border-l border-blue-700`
- **שורת סיכום קבוצה**: לא מוצגת עבור קבוצת `מסוק`
  ```tsx
  {group !== 'מסוק' && (<tr>...סכום...</tr>)}
  ```

---

## buildStations(s, fuelOverride?)

מייצר רשימת Station[] לחישוב CG. קרויה 3 פעמים:
- `buildStations(s)` — המראה
- `buildStations(s, fuelMid)` — אמצע
- `buildStations(s, fuelLanding)` — נחיתה (fuelLanding = max(40, round(fuel*0.1)))

בטן BAMBI: מוסיף רק BAMBI_EMPTY_WEIGHT, ללא תחנת מים.

---

## Toasts

מוצגים כשמצב עובר מ-false→true (edge trigger).
- ⛔ אדום: חריגת MTOW / פנימי / כולל
- ⚠️ כתום: חריגת OGE, CG מחוץ למעטפת
- כפתור "אישור" לסגירה ידנית (לא נסגר אוטומטית)

---

## החלטות עיצוביות שנקבעו

1. **arm מסוק ריק** — מתוך HELICOPTERS array, לא קבוע
2. **arm נוסעים** — 2.54 לכולם (אורכי), lat לפי SEAT_ARMS
3. **arm עומס חיצוני ו-BAMBI** — 3.38 (זהה למתלה הוו)
4. **fuelLanding** — `max(40, round(fuel*0.1))` ולא 60 קשיח, כי אחרת עם דלק נמוך התחשיב שבור
5. **מעטפת חיצונית** — קבועים סטטיים `EXT_LONG_ENV` / `EXT_LAT_ENV` (ערכי AFM אמיתיים)
6. **cgLongOK** — `takeoffW < 1100 || isInPolygon(...)` — ל-1100 ומטה אין מגבלת מעטפת
7. **cgFwd/Aft split** — `longCG < 3.304` → קדמי, אחרת → אחורי
8. **RTL border**: `border-l` הוא ה-border הפיזי שמאלי — ב-RTL זה מציב את הקו בצד הנכון (בין מומנט אורכי לזרוע רוחבי)
9. **font scaling**: `text-[Xpx]` → `text-[Xrem]` — ‏ `document.documentElement.style.fontSize` גדל → כל ה-rem גדלים

---

## דברים שצריך לאמת עם AFM

- `BAMBI_CAPACITY_L = 680` — הנפח המדויק
- `BAMBI_EMPTY_WEIGHT = 40` — משקל מיכל ריק
- `BAMBI_ARM = 3.38` — זרוע בטן/וו (משתמשים באותה זרוע לשני המצבים)
- `OGE_TABLE` — לאמת מול AFM

---

## Git

```bash
Working branch: claude/kind-curie-Zz6Bf
Deploy branch:  claude/happy-volta-BBzTA
Remote:         origin → arnoni-oss/h125-weight-balance
Deploy:         GitHub Actions → GitHub Pages (אוטומטי על push ל-BBzTA)
Build:          cd h125wb && npm run build   (tsc -b && vite build)

# כל push לשני הברנצ'ים:
git push origin claude/kind-curie-Zz6Bf
git push origin claude/kind-curie-Zz6Bf:claude/happy-volta-BBzTA
```
