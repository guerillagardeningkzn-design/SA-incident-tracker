# ✦ SA Incident Tracker

**MD Works · Project 03 — Community CRUD Tool**  
Vanilla JS · Google Apps Script · Google Sheets · Leaflet.js · ImgBB · Cloudflare Pages

A community safety reporting tool built for Durban / KZN. Members of the public
report incidents anonymously — fire, water leaks, suspicious activity, unattended
animals, road hazards and more — reviewed by a moderator before appearing on the
live map. Zero running cost. Real users. Real data.

**Live:** [sa-incident-tracker.pages.dev](https://your-url.pages.dev)  
**Portfolio:** [MD Works](https://md-works-portfolio.guerillagardeningkzn.workers.dev)

---

## Features

### Public map
- Dark Leaflet map (CartoDB tiles) with colour-coded incident markers
- Category filters — Security · Emergency · Infrastructure · Animals · Civil
- Time filters — Today · 7 Days · 30 Days · All Time
- Address search powered by Nominatim (OpenStreetMap, no API key needed)
- Incident popups — type, area, description, photos, admin updates, status badge
- Slide-up report panel with up to 3 compressed photos
- Tap-on-map coordinate picker
- Anonymous — no login, no tracking, no cookies

### Admin dashboard
- PIN-based login (stored in GAS Script Properties, not in code)
- Pending / Approved / Rejected moderation queue
- One-click approve or reject with instant UI update
- Report status — Active · Under Investigation · Resolved · False Alarm · Duplicate
- Comments / notes per report (visible publicly as "Updates" in the popup)
- Add verified incidents directly with tap-on-map coordinate picker
- Live KZN CCTV camera feeds (i-traffic, auto-refresh every 60s, add/remove)
- Canvas-based photo blur tool for redacting faces and licence plates
- ImgBB API key configurable from the settings panel (no redeploy needed)

### Backend (GAS + Sheets)
- Google Apps Script Web App as a zero-cost REST API
- Google Sheets as a structured 3-tab database (Pending / Approved / Rejected)
- Photos uploaded client-side to ImgBB, only URLs stored in Sheets
- Comments and report status stored as JSON in sheet columns
- PIN and ImgBB key stored in GAS Script Properties (never in source code)
- UUID-based row identification, safe moderation row moves between sheets

---

## Incident Types

| Category       | Types |
|----------------|-------|
| Security       | Suspicious Person/s · Suspicious Vehicle · Crime in Progress · Crime (Reported) · Hijacking / Armed Robbery |
| Emergency      | Fire / Smoke Detected · Medical Emergency |
| Infrastructure | Water Leak / Burst Pipe · Power Outage · Road Hazard / Debris |
| Animals        | Unattended Dog / No Owner · Injured / Dangerous Animal |
| Civil          | Protest / March · Road Block / Disruption · Riot / Looting |
| Other          | Other |

---

## Setup — Step by Step

### 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → new spreadsheet
2. Rename the default tab to **Pending**
3. Add two more tabs: **Approved** and **Rejected**
4. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`YOUR_SHEET_ID`**`/edit`

### 2 — Deploy the GAS backend

1. In the Sheet: **Extensions → Apps Script**
2. Delete the default code, paste the contents of `gas/Code.gs`
3. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your Sheet ID
4. **Run `setupSheets()` once** (▶ button) — creates headers and backfills new columns
5. Go to **Project Settings → Script Properties** → add:

   | Property  | Value                        |
   |-----------|------------------------------|
   | `AdminPIN`  | your 4-digit PIN           |
   | `ImgBBKey`  | your ImgBB API key         |

   Get a free ImgBB key at [imgbb.com](https://imgbb.com)

6. **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the Web App URL

### 3 — Configure the frontend

Open `js/config.js` and update:

```js
const CONFIG = {
  GAS_URL:    'YOUR_WEB_APP_URL_HERE',
  MAP_CENTER: [-29.8587, 31.0218],   // adjust to your area
  MAP_ZOOM:   12,
  ADMIN_PIN:  '0000',                // must match Script Properties
};
```

### 4 — Deploy to Cloudflare Pages

1. Push to GitHub
2. Cloudflare Pages → Create project → connect repo
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Output directory: `/` (root)
4. Save and deploy — live in ~30 seconds

### 5 — Test end to end

1. Public page → tap **＋** → submit a test report with a photo
2. `/admin.html` → enter PIN → approve the report
3. Map reloads → marker appears with correct colour and popup
4. Add a comment in admin → open popup on public map → comment shows as "Updates"

---

## After any GAS code change

**Deploy → Manage deployments → Edit → New version → Deploy.**  
The URL stays the same — no need to update `config.js`.

---

## Updating the PIN or ImgBB key

Go to **Apps Script → Project Settings → Script Properties** and update the values.  
Changes are live immediately — no redeploy needed.

---

## Technical notes

**CORS and GAS POST requests**  
Setting `Content-Type: application/json` triggers a preflight OPTIONS request that
GAS cannot handle. All POST requests omit this header. The body is still valid JSON
and `JSON.parse(e.postData.contents)` reads it correctly on the GAS side.

**Canvas CORS taint and the blur tool**  
Drawing a cross-origin image (ImgBB URL) directly onto a canvas taints it, causing
`toDataURL()` to throw a `SecurityError`. The blur tool fetches each photo as a
blob first (`fetch` → `blob()` → `URL.createObjectURL`). Blob URLs are same-origin
so the canvas stays clean and the blurred output can be re-uploaded to ImgBB.

**UUID row detection**  
Rather than relying on a header row skip (`slice(1)`), the backend filters rows
using a UUID regex. This means `setupSheets()` only needs to be run once and
existing sheets with or without headers both work correctly.

**Photo flow**  
Photos are compressed client-side (max 800px, JPEG 80%) before upload. The public
report form uploads to ImgBB directly in the browser and sends only URLs to GAS,
keeping the POST payload small and avoiding Drive OAuth scope requirements.

---

## Project structure

```
sa-incident-tracker/
├── index.html          # Public map, filters, address search, report form
├── admin.html          # Admin dashboard, CCTV panel, blur tool
├── style.css           # MD Works brand — shared across both pages
├── js/
│   ├── config.js       # Incident types, report statuses, GAS URL, settings
│   ├── map.js          # Leaflet map, markers, time/category filters, search, report form
│   └── admin.js        # PIN auth, moderation queue, comments, status, CCTV, blur tool
├── gas/
│   └── Code.gs         # GAS backend — all actions, sheet helpers, config
└── README.md
```

---

## What this project demonstrates

- Full CRUD — Create (public form), Read (map), Update (moderation, status, comments), Delete (reject)
- Google Apps Script as a zero-cost REST API with a POST dispatcher pattern
- Google Sheets as a structured multi-tab database
- ImgBB for client-side photo uploads — no backend file handling
- Async `fetch()` with error handling and UI state management
- Canvas API for photo redaction with CORS blob workaround
- Leaflet.js — custom markers, popups, coordinate picker
- Nominatim geocoding — address search, no API key
- Client-side filtering without re-fetching (category + time)
- PIN auth with GAS Script Properties for secure key storage
- `localStorage` for CCTV camera persistence

---

✦ MD Works · Morney Deetlefs · South Africa
