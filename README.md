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
- Category, sub-category and time filters — compact dropdowns, mobile-friendly
- Map remembers the last viewed location and zoom (saved ~500ms after panning/zooming settles)
- Address search powered by Nominatim (OpenStreetMap, no API key needed)
- Incident popups — type, area, description, photos, admin updates, status badge
- Slide-up report panel with up to 3 compressed photos
- Tap-on-map coordinate picker
- Optional "Notify via WhatsApp" prompt after submitting — opens a pre-filled
  `wa.me` link to the matched area admin (or super admin if none matched)
- Anonymous — no login, no tracking, no cookies

### Admin dashboard
- Multi-admin with two roles:
  - **Super Admin** — sees every report, manages incident types, creates/manages
    area admins, sees an "⚠ Unassigned" flag on reports outside every territory
  - **Area Admin** — sees only reports inside their own geographic radius
- New area admins are invited via a one-time link and set their own 6-digit PIN
  (invite-link style — no PIN is ever typed in by the super admin)
- Pending / Approved / Rejected moderation queue, geo-scoped per admin
- One-click approve or reject with instant UI update
- Report status — Active · Under Investigation · Resolved · False Alarm · Duplicate
- Comments / notes per report (visible publicly as "Updates" in the popup)
- Add verified incidents directly with tap-on-map coordinate picker
- Live KZN CCTV camera feeds (i-traffic, auto-refresh every 60s, add/remove)
- Canvas-based photo blur tool for redacting faces and licence plates
- ImgBB API key configurable from Settings (super admin only, no redeploy needed)
- Each admin sets their own WhatsApp number in Settings — used for the public
  notify link, optional

### Backend (GAS + Sheets)
- Google Apps Script Web App as a zero-cost REST API
- Google Sheets as a structured database:
  - `Pending` / `Approved` / `Rejected` — the report tabs
  - `IncidentTypes` — editable category/sub-category list, no redeploy needed
  - `Admins` — multi-admin roster with role, territory, and PIN
- Photos uploaded client-side to ImgBB, only URLs stored in Sheets
- Comments and report status stored as JSON in sheet columns
- PINs stored per-admin in the `Admins` sheet; ImgBB key stays in Script Properties
- UUID-based row identification, safe moderation row moves between sheets
- Haversine distance calculation for geo-matching reports to area admin territories

---

## Incident Types

Incident types are no longer hardcoded — they live in the **`IncidentTypes`** sheet
tab, editable directly in Google Sheets:

| Column     | Meaning                                      |
|------------|-----------------------------------------------|
| `value`    | Stable internal key — **never rename once in use** |
| `label`    | Display name shown in dropdowns and popups   |
| `icon`     | Emoji shown next to the label                |
| `color`    | Hex colour used for the map marker           |
| `category` | Groups types in the category/sub-category dropdowns |
| `active`   | `TRUE`/`FALSE` — set to `FALSE` to hide without deleting |

Renaming a `label`, changing a `color`, adding a new row, or deactivating a type
takes effect on next page load — no code change, no redeploy. The `value` column
is the only field that must stay stable, since existing reports reference it.

`setupSheets()` seeds this tab automatically on first run with the original 16
types (Security, Emergency, Infrastructure, Animals, Civil, Other) as a starting
point — edit freely from there.

---

## Multi-Admin & Territories

### Roles
| Role | Sees | Can do |
|------|------|--------|
| **Super Admin** | Every report, with unassigned ones flagged | Moderate any report, manage incident types, create/deactivate area admins, set ImgBB key |
| **Area Admin** | Only reports inside their radius | Moderate reports in their territory, add comments/status, set their own WhatsApp number |

A report is matched to an area admin if its coordinates fall within that admin's
radius (straight-line distance, not driving distance). If no active area admin's
territory contains a report — or the report has no coordinates at all — it's
visible to the Super Admin only, flagged **⚠ Unassigned**.

### Adding a new area admin
1. Super Admin → **Manage Admins** → fill in name + WhatsApp number
2. **Pick territory on map** → tap the centre point of their coverage area
3. Set a radius in km → **Create Admin**
4. Copy the generated one-time invite link, send it to them (WhatsApp, SMS, however)
5. They open the link, choose their own 6-digit PIN, and can log in from then on

Invite links are single-use. If lost, **Get Invite Link** on their row in Manage
Admins issues a fresh one (the old one stops working).

### Migrating from the single-PIN version
If you're upgrading from an earlier version of this project that used a single
`AdminPIN` Script Property, running `setupSheets()` automatically migrates that
PIN into the first row of the new `Admins` sheet as the Super Admin — your
existing PIN keeps working with no manual steps.

---

## WhatsApp Notify

After a public report is submitted, if the location matches an area admin (or
falls back to the Super Admin) with a WhatsApp number on file, the reporter sees
an optional **"Notify via WhatsApp"** button.

**Important — this is a deep link, not an automatic message.** Tapping it opens
WhatsApp with a chat pre-filled (incident type + area only, no description, kept
short and privacy-friendly); the reporter still has to tap **Send** themselves.
There is no free way to push an automatic WhatsApp message without a paid
Business API account, which doesn't fit this project's zero-cost model — so this
is intentionally a one-tap-assisted flow rather than a silent notification.

Each admin sets their own number in **Settings → My WhatsApp Number**. It's
optional — leaving it blank just means the notify button won't appear for
reports matched to that admin.

---

## Setup — Step by Step

### 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → new spreadsheet
2. Rename the default tab to **Pending**
3. Add two more tabs: **Approved** and **Rejected**
   (`IncidentTypes` and `Admins` are created automatically by `setupSheets()` —
   no need to add them manually)
4. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`YOUR_SHEET_ID`**`/edit`

### 2 — Deploy the GAS backend

1. In the Sheet: **Extensions → Apps Script**
2. Delete the default code, paste the contents of `code.gs`
3. Replace `SHEET_ID` with your Sheet ID
4. **Run `setupSheets()` once** (▶ button) — creates all tabs, seeds
   `IncidentTypes` with defaults, and seeds `Admins` with a Super Admin row
   (migrating any existing `AdminPIN` Script Property if present)
5. If this is a brand-new sheet with no prior `AdminPIN`, open the `Admins` tab
   and manually set a 6-digit PIN in row 2, column G (`pin`) for your Super
   Admin account
6. (Optional) **Project Settings → Script Properties** → add `ImgBBKey` —
   get a free key at [imgbb.com](https://imgbb.com). This can also be set later
   from the Settings panel once logged in.
7. **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Copy the Web App URL

### 3 — Configure the frontend

Open `config.js` and update:

```js
const CONFIG = {
  GAS_URL:    'YOUR_WEB_APP_URL_HERE',
  MAP_CENTER: [-29.8587, 31.0218],   // adjust to your area
  MAP_ZOOM:   12,
  MAX_PHOTOS: 3,
};
```

There's no `ADMIN_PIN` to set here anymore — PINs live per-admin in the
`Admins` sheet, entered via the login screen or invite-claim flow.

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
2. `/admin.html` → enter your Super Admin PIN → approve the report
3. Map reloads → marker appears with correct colour and popup
4. Add a comment in admin → open popup on public map → comment shows as "Updates"
5. Manage Admins → create a test area admin inside your test report's
   coordinates → confirm the invite link → claim flow → confirm they only see
   that one report in their queue
6. Submit a report inside the test admin's radius → confirm the WhatsApp notify
   dialog shows their name and a working `wa.me` link

---

## After any GAS code change

**Deploy → Manage deployments → Edit → New version → Deploy.**
The URL stays the same — no need to update `config.js`.

---

## Updating settings

| What | Where |
|------|-------|
| Your own WhatsApp number | Admin → Settings → My WhatsApp Number (any role) |
| ImgBB API key | Admin → Settings → ImgBB API Key (Super Admin only) |
| Incident types / categories | `IncidentTypes` sheet tab, edited directly |
| Admin territories, radius, active status | Admin → Manage Admins (Super Admin only) |
| A lost PIN | Super Admin → Manage Admins → Get Invite Link → admin re-claims with a new PIN |

All changes are live immediately — no redeploy needed for any of the above.

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

**Geo-matching (haversine)**
Reports are matched to area admin territories using the haversine formula —
straight-line distance between two lat/lng points, accounting for the Earth's
curvature. It's pure JS, needs no external API, and is accurate enough for
neighbourhood-scale radii. It does not account for roads or terrain, so a
report just outside a radius by straight-line distance might still be
practically "in the area" by road — radii are worth setting generously.

**Invite-token claim pattern**
New area admins never have a PIN typed in on their behalf. `createAdmin()`
generates a random UUID token stored in the `Admins` sheet with the PIN column
left blank. The invite link carries that token; `claimInvite()` validates it,
lets the new admin set their own PIN, and immediately clears the token so the
link can't be reused. The token itself is the one-time authorisation for that
single action — no separate auth needed for an admin who doesn't have a PIN yet.

**Why WhatsApp notify is a deep link, not a push**
There is no free, server-triggered way to deliver a WhatsApp message without
human interaction — `wa.me` links only pre-fill a chat; a paid WhatsApp Business
API account is required for true automatic sending. Given this project's
zero-cost design, the notify feature is intentionally a one-tap-assisted flow.

---

## Project structure

```
sa-incident-tracker/
├── index.html       # Public map, filters, address search, report form, WhatsApp notify dialog
├── admin.html        # Admin dashboard, Manage Admins, CCTV panel, blur tool, invite-claim screen
├── style.css         # MD Works brand — shared across both pages
├── config.js         # Incident type fallback, report statuses, GAS URL, WhatsApp link builder
├── map.js            # Leaflet map, markers, filters, view persistence, search, report form
├── admin.js          # PIN/invite auth, moderation queue, Manage Admins, comments, status, CCTV, blur tool
├── code.gs            # GAS backend — all actions, sheet helpers, geo-matching, multi-admin
└── README.md
```

Sheet tabs (created by `setupSheets()`):
```
Pending / Approved / Rejected   — report data
IncidentTypes                    — editable category/sub-category list
Admins                           — multi-admin roster, roles, territories, PINs
```

---

## What this project demonstrates

- Full CRUD — Create (public form), Read (map), Update (moderation, status, comments), Delete (reject)
- Google Apps Script as a zero-cost REST API with a POST dispatcher pattern
- Google Sheets as a structured multi-tab database, including as a lightweight
  admin/config store (incident types, admin roster) editable without code
- Role-based access control (Super vs Area admin) enforced server-side, not just hidden in the UI
- Geo-matching with the haversine formula — no external geocoding API required
- Invite-token claim pattern for onboarding new admins without sharing PINs
- `wa.me` deep links as a zero-cost, human-confirmed notification mechanism
- ImgBB for client-side photo uploads — no backend file handling
- Async `fetch()` with error handling and UI state management
- Canvas API for photo redaction with CORS blob workaround
- Leaflet.js — custom markers, popups, coordinate picker, persisted view state
- Nominatim geocoding — address search, no API key
- Client-side filtering without re-fetching (category, sub-category, time)
- `localStorage` for CCTV camera persistence and last-viewed map position

---

✦ MD Works · Morney Deetlefs · South Africa
