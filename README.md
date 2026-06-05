# ✦ SA Incident Tracker

**MD Works · Project 03 — Community CRUD Tool**  
Vanilla JS · Google Apps Script · Google Sheets · Leaflet.js · Cloudflare Pages

Community safety reporting for Durban / KZN. Anonymous public reporting with
admin moderation, live CCTV feeds, and a photo blur tool for privacy protection.

---

## Features

**Public view**
- Leaflet map (dark CartoDb theme) with colour-coded incident markers
- Filter by category: Security, Emergency, Infrastructure, Animals, Civil
- Slide-up report panel with up to 3 compressed photos
- Tap-on-map coordinate picker
- Anonymous — no login, no tracking

**Admin dashboard**
- PIN-based authentication (set in `js/config.js` and `gas/Code.gs`)
- Pending / Approved / Rejected queue with one-click moderation
- Add verified incidents directly (bypasses moderation)
- Live KZN CCTV camera feeds (auto-refresh every 60s, add/remove feeds)
- Canvas-based photo blur tool — draw rectangles over faces and plates

**Backend (GAS + Sheets)**
- Photos stored in Google Drive, served as public URLs
- No running cost — Google free tier
- Moderation moves rows between sheets (Pending → Approved / Rejected)

---

## Incident Types

| Category       | Types |
|----------------|-------|
| Security       | Suspicious Person/s, Suspicious Vehicle, Crime in Progress, Crime (Reported), Hijacking / Armed Robbery |
| Emergency      | Fire / Smoke Detected, Medical Emergency |
| Infrastructure | Water Leak / Burst Pipe, Power Outage, Road Hazard / Debris |
| Animals        | Unattended Dog / No Owner, Injured / Dangerous Animal |
| Civil          | Protest / March, Road Block / Disruption, Riot / Looting |
| Other          | Other |

---

## Setup — Step by Step

### 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → create a new sheet
2. Rename the default tab to **Pending**
3. Add two more tabs: **Approved** and **Rejected**
4. Copy the Sheet ID from the URL:  
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

### 2 — Deploy the GAS backend

1. In the Sheet: **Extensions → Apps Script**
2. Delete the default `myFunction` code
3. Paste the contents of `gas/Code.gs`
4. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your Sheet ID
5. Set `ADMIN_PIN` to your chosen 4-digit PIN
6. Click **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy** → copy the Web App URL

### 3 — Configure the frontend

Open `js/config.js` and update:

```js
const CONFIG = {
  GAS_URL:    'YOUR_WEB_APP_URL_HERE',  // paste from step 2
  MAP_CENTER: [-29.8587, 31.0218],      // adjust to your area
  MAP_ZOOM:   12,
  ADMIN_PIN:  '0000',                   // must match Code.gs
  ...
};
```

### 4 — Deploy to Cloudflare Pages

1. Push to GitHub
2. Cloudflare Pages → Create project → connect repo
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Output directory: `/` (root)
4. Save and deploy

### 5 — Test

- Open the site → tap **＋** → submit a test report
- Go to `/admin.html` → enter PIN → approve the report
- Check the map — the marker should appear

---

## Updating the Admin PIN

Change it in **two places**:

1. `js/config.js` → `CONFIG.ADMIN_PIN`
2. `gas/Code.gs` → `ADMIN_PIN`

Then redeploy the GAS Web App (Deploy → Manage deployments → New version).

---

## Project Structure

```
sa-incident-tracker/
├── index.html        # Public map + report form
├── admin.html        # Admin dashboard
├── style.css         # MD Works brand styles
├── js/
│   ├── config.js     # Incident types, GAS URL, settings
│   ├── map.js        # Leaflet map, markers, report form
│   └── admin.js      # PIN auth, queue, CCTV, blur tool
├── gas/
│   └── Code.gs       # Google Apps Script backend
└── README.md
```

---

## What This Project Demonstrates

- Full CRUD operations (Create via public form, Read on map, Update via moderation, Delete/reject)
- Google Apps Script as a zero-cost REST API backend
- Google Sheets as a structured database with multi-tab workflow
- Google Drive for file/photo storage
- Async `fetch()` with proper error handling
- Canvas API for the photo blur tool
- Leaflet.js map integration with custom markers and popups
- Client-side image compression before upload
- PIN authentication pattern

---

✦ MD Works · Morney Deetlefs · [Portfolio →](https://md-works-portfolio.guerillagardeningkzn.workers.dev)
