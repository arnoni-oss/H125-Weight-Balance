# H125 Weight & Balance — Developer Context

> קובץ זה הוא תיעוד טכני לשימוש בין-שיחות. מתכנת ← מתכנת.

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
| Branch | `claude/happy-volta-BBzTA` |
| Repo | `arnoni-oss/h125-weight-balance` |
| קובץ עיקרי | `h125wb/src/App.tsx` (קובץ יחיד, ~1050 שורות) |
| CSS | `h125wb/src/index.css` (Tailwind import + spinner hide) |

אין router, אין state manager, אין backend. הכל ב-App.tsx אחד.

---

## קבועים — ערכים מאומתים (לא לשנות בלי אישור)

```typescript
// זרועות
FUEL_ARM         = 3.48   // דלק
BAMBI_ARM        = 3.38   // BAMBI (וו + בטן) — כמו מתלה מטען
// external load arm: 3.38 (hardcoded in buildStations)

// מגבלות CG אורכי
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

---

## תצורות ישיבה — SEAT_ARMS

כל תצורה: מערך [longArm, latArm] לכל מושב נוסע.
זרוע אורכי אחיד: 2.54 מ' לכולם.
זרועות רוחביות: ±0.62 (חיצוניים), ±0.38 (פנימיים), 0.00 (אמצע).
תצורה '13' (CUSTOM): עד 4 מושבים.

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
// equipW = SHAPO/DSP + XP + hook + BAMBI_EMPTY (אם bambiFill>0)
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

// מעטפות CG — בנויות לפי גבול מבני, לא OGE
extLongEnv = getExtLongEnv(2800)   // ← 2800, לא ogeLimit!
extLatEnv  = getExtLatEnv(2800)
longEnv    = hasHook ? extLongEnv : STD_LONG_ENV
latEnv     = hasHook ? extLatEnv  : STD_LAT_ENV
cgLongOK   = takeoffW < 1100 || isInPolygon(longCG, takeoffW, longEnv)
cgLatOK    = takeoffW < 1100 || isInPolygon(latCG,  takeoffW, latEnv)
ok = !overMTOW && !overInternal && !overTotal && !overOGE && cgLongOK && cgLatOK
```

**חשוב:** מעטפת CG ובדיקת OGE הן בדיקות נפרדות. עברת OGE לא מכניסה את ה-CG מחוץ למעטפת.

---

## מעטפות CG (Polygons)

כל נקודה: `[זרוע, משקל]`. `isInPolygon` — ray-casting.

```typescript
// סטנדרט (ללא הוו)
STD_LONG_ENV = [[3.17,1300],[3.17,2000],[3.23,2370],[3.408,2370],[3.49,1750],[3.49,1300]]
STD_LAT_ENV  = [[-0.18,1200],[-0.18,2250],[-0.08,2370],[0.08,2370],[0.14,2370],[0.14,1300]]

// חיצוני (עם הוו), lim=2800
getExtLongEnv(lim) = [[3.17,1300],[3.17,2000],[3.26,lim],[3.438,lim],[3.49,1300]]
getExtLatEnv(lim)  = [[-0.18,1200],[-0.18,2250],[-0.08,lim],[0.08,lim],[0.14,2370],[0.14,1300]]
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

### לשונית ראשי
1. **מסוק** — בחירת זנב + תצורה
2. **ציוד** — מערכת תצפית, XP, וו, BAMBI
3. **פירוט תצורה** — accordion מתכווץ
4. **צוות ונוסעים** — `Num` עם +/−
5. **דלק ומשקל על הוו** — מציג `maxFuelAllowed` בשדה
6. **משקל נוסף** — תחנות ידניות (שם, משקל, זרוע)
7. **תנאי שטח** — גובה, טמפ', OGE toggle
8. **תוצאות** — פסי מגבלות, גרפי מעטפת (accordion), CG bars

### לשונית תחנות ומומנטים
טבלה מחולקת לקבוצות: מסוק / מערכות / אנשים / דלק / אחר.
שורת סיכום לכל קבוצה. שורת סה"כ + ערכי CG.

### באנר מרחף תחתון
ירוק/אדום/כתום לפי `ok`. מציג: משקל המראה, מנוע מה"ק, CG אורכי, CG רוחבי.

---

## רכיבים מובנים (פונקציות)

| רכיב | תיאור |
|------|--------|
| `Card` | מסגרת לבנה עם כותרת |
| `Field` | label + content |
| `Sel` | `<select>` מעוצב |
| `Num` | input עם כפתורי +/− וסלקט-בלחיצה |
| `Tog` | toggle switch, תומך `disabled` |
| `WR` | שורת תוצאה: label + ערך ק"ג |
| `R2` | שורת תצוגה: label + ערך string |
| `LimitBar` | פס מגבלה עם %. אדום/כתום/ירוק |
| `CGChart2D` | גרף SVG למעטפת + נקודות מסלול |
| `CGLongBar` | בר CG אורכי עם חץ שינוי המראה→נחיתה |
| `CGLatBar` | בר CG רוחבי |
| `BannerCell` | תא בבאנר התחתון |

---

## Toasts

מוצגים כשמצב עובר מ-false→true (edge trigger).
- ⛔ אדום: חריגת MTOW / פנימי / כולל
- ⚠️ כתום: חריגת OGE, CG מחוץ למעטפת
- כפתור "אישור" לסגירה ידנית (לא נסגר אוטומטית)

---

## buildStations(s, fuelOverride?)

מייצר רשימת Station[] לחישוב CG. קרויה 3 פעמים:
- `buildStations(s)` — המראה
- `buildStations(s, fuelMid)` — אמצע
- `buildStations(s, fuelLanding)` — נחיתה (fuelLanding = max(40, round(fuel*0.1)))

בטן BAMBI: מוסיף רק BAMBI_EMPTY_WEIGHT, ללא תחנת מים.

---

## החלטות עיצוביות שנקבעו

1. **arm מסוק ריק** — מתוך HELICOPTERS array, לא קבוע
2. **arm נוסעים** — 2.54 לכולם (אורכי), lat לפי SEAT_ARMS
3. **arm עומס חיצוני ו-BAMBI** — 3.38 (זהה למתלה הוו)
4. **fuelLanding** — `max(40, round(fuel*0.1))` ולא 60 קשיח, כי אחרת עם דלק נמוך התחשיב שבור
5. **מעטפת חיצונית** — בנויה עם MTOW_WITH_HOOK=2800, לא ogeLimit (CG ו-OGE בדיקות נפרדות)
6. **cgLongOK** — `takeoffW < 1100 || isInPolygon(...)` — ל-1100 ומטה אין מגבלת מעטפת
7. **cgFwd/Aft split** — `longCG < 3.304` → קדמי, אחרת → אחורי

---

## דברים שצריך לאמת עם AFM

- `BAMBI_CAPACITY_L = 680` — הנפח המדויק
- `BAMBI_EMPTY_WEIGHT = 40` — משקל מיכל ריק
- `BAMBI_ARM = 3.38` — זרוע בטן/וו (משתמשים באותה זרוע לשני המצבים)
- מעטפת CG חיצונית — נקודות המעטפת לאמת מול AFM
- OGE_TABLE — לאמת מול AFM

---

## Git

```bash
Branch:  claude/happy-volta-BBzTA
Remote:  origin → arnoni-oss/h125-weight-balance
Deploy:  GitHub Actions → GitHub Pages (אוטומטי על push לברנץ')
Build:   cd h125wb && npm run build   (tsc -b && vite build)
```
