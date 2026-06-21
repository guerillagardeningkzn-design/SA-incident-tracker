/* ══════════════════════════════════════════
   SA Incident Tracker — map.js
   Public view: Leaflet map + report form
══════════════════════════════════════════ */

// ── State ──────────────────────────────── //
let map, markersLayer;
let incidents          = [];
let activeCategory     = 'all';
let activeSubcategory  = 'all';
let activeTimeFilter   = 'all';
let pickingCoords      = false;
let pendingCoords      = null;
let photoFiles         = [null, null, null];
let submitting         = false;
let imgbbKey           = '';
let searchMarker       = null;
let saveViewTimer      = null;

const VIEW_STORAGE_KEY = 'sait_map_view';
const VIEW_SAVE_DELAY  = 500; // ms after map stabilises

// ── Boot ───────────────────────────────── //
document.addEventListener('DOMContentLoaded', async () => {
  initCursor();
  initMap();
  initPhotoSlots();
  initReportPanel();
  initNotifyDialog();
  initSearch();

  // Wait for config (incl. Sheet-driven incident types) before building
  // the type dropdown and category/sub-category filters — avoids a
  // visible "upgrade" flicker and guarantees they reflect the same list.
  await loadConfig();
  initTypeSelect();
  initFilterBar();
  initTimeFilter();

  loadIncidents();
});

// ── Fetch public config (ImgBB key + incident types) ── //
async function loadConfig() {
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=getConfig`);
    const data = await res.json();
    if (data.imgbbKey) imgbbKey = data.imgbbKey;
    // Replaces INCIDENT_TYPES in memory if the Sheet returned rows.
    // Falls back to the hardcoded list in config.js if not — see
    // applyIncidentTypes() in config.js for details.
    applyIncidentTypes(data.incidentTypes);
  } catch (err) {
    console.warn('Could not load config — using built-in incident types:', err);
  }
}

// ── ImgBB upload ───────────────────────── //
async function uploadToImgBB(base64) {
  if (!imgbbKey) throw new Error('ImgBB key not configured — contact admin');
  const b64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const formData = new FormData();
  formData.append('image', b64);
  formData.append('key', imgbbKey);
  const res  = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) return data.data.url;
  throw new Error(data.error?.message || 'ImgBB upload failed');
}

// ── Map ────────────────────────────────── //
function initMap() {
  const savedView = loadSavedView();

  map = L.map('map', {
    center: savedView ? savedView.center : CONFIG.MAP_CENTER,
    zoom:   savedView ? savedView.zoom   : CONFIG.MAP_ZOOM,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  // Map click — coord picker
  map.on('click', e => {
    if (!pickingCoords) return;
    pendingCoords = e.latlng;
    document.getElementById('coord-display').textContent =
      `${e.latlng.lat.toFixed(6)},  ${e.latlng.lng.toFixed(6)}`;
    document.getElementById('coord-dialog').classList.remove('hidden');
    stopPickingCoords();
  });

  // Persist the view ~500ms after the map stops moving/zooming.
  // 'moveend' fires once pan/zoom (incl. inertia/animation) has settled,
  // so the debounce here is purely to avoid writing on every rapid
  // bounce between moveend events (e.g. quick successive pans).
  map.on('moveend', scheduleViewSave);
}

// ── Map view persistence ───────────────── //
function loadSavedView() {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.center) || parsed.center.length !== 2) return null;
    if (typeof parsed.zoom !== 'number') return null;
    return parsed;
  } catch (err) {
    console.warn('Could not read saved map view:', err);
    return null;
  }
}

function scheduleViewSave() {
  clearTimeout(saveViewTimer);
  saveViewTimer = setTimeout(saveCurrentView, VIEW_SAVE_DELAY);
}

function saveCurrentView() {
  try {
    const center = map.getCenter();
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({
      center: [center.lat, center.lng],
      zoom:   map.getZoom(),
    }));
  } catch (err) {
    console.warn('Could not save map view:', err);
  }
}

// ── Load incidents ─────────────────────── //
async function loadIncidents() {
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=getApproved`);
    const data = await res.json();
    incidents  = data.incidents || [];
    renderMarkers();
  } catch (err) {
    console.warn('Could not load incidents:', err);
    // Show empty map — non-fatal
  }
}

// ── Markers ────────────────────────────── //
function renderMarkers() {
  markersLayer.clearLayers();

  const now      = Date.now();
  const cutoffs  = { today: 86400000, week: 604800000, month: 2592000000, all: Infinity };
  const cutoff   = cutoffs[activeTimeFilter] ?? Infinity;

  const filtered = incidents.filter(i => {
    const type = getType(i.type);

    const categoryMatch = activeCategory === 'all' || type.category === activeCategory;
    const subcatMatch    = activeSubcategory === 'all' || i.type === activeSubcategory;

    // Undated incidents only show under "All Time" — a missing timestamp
    // shouldn't make a report look like it just happened.
    const ms        = i.timestamp ? now - new Date(i.timestamp).getTime() : Infinity;
    const timeMatch = ms <= cutoff;

    return categoryMatch && subcatMatch && timeMatch;
  });

  filtered.forEach(inc => {
    if (!inc.lat || !inc.lng) return;
    const t = getType(inc.type);
    const icon = L.divIcon({
      html: `<div class="marker-dot" style="background:${t.color};color:${t.color}"></div>`,
      className: '', iconSize: [14,14], iconAnchor: [7,7],
    });
    const marker = L.marker([inc.lat, inc.lng], { icon });
    marker.bindPopup(buildPopup(inc), { maxWidth: 300 });
    markersLayer.addLayer(marker);
  });
}

function buildPopup(inc) {
  const t    = getType(inc.type);
  const rs   = getStatus(inc.reportStatus || 'active');
  const time = inc.timestamp
    ? new Date(inc.timestamp).toLocaleString('en-ZA', { dateStyle:'medium', timeStyle:'short' })
    : '—';

  let photosHtml = '';
  if (inc.photos?.length) {
    photosHtml = `<div class="popup-photos">
      ${inc.photos.map(url => `<img src="${url}" alt="Incident photo" onclick="window.open('${url}','_blank')">`).join('')}
    </div>`;
  }

  const statusHtml = `<span style="
    font-family:'Syne Mono',monospace;font-size:.55rem;letter-spacing:.1em;
    text-transform:uppercase;padding:.15rem .5rem;border-radius:50px;
    border:1px solid ${rs.color};color:${rs.color};
    background:${rs.color}18;display:inline-block;
  ">${rs.label}</span>`;

  let commentsHtml = '';
  if (inc.comments?.length) {
    const items = inc.comments.map(c => `
      <div style="
        background:rgba(33,28,20,.8);border-radius:3px;
        padding:.4rem .6rem;margin-bottom:.35rem;
      ">
        <div style="display:flex;gap:.6rem;align-items:center;margin-bottom:.2rem">
          <span style="font-family:'Syne Mono',monospace;font-size:.55rem;
            letter-spacing:.1em;color:#7a5815">${sanitise(c.author)}</span>
          <span style="font-family:'Syne Mono',monospace;font-size:.52rem;
            color:#7a6d58">${c.timestamp}</span>
        </div>
        <div style="font-size:.78rem;font-weight:300;
          color:rgba(240,230,206,.7);line-height:1.5">${sanitise(c.text)}</div>
      </div>
    `).join('');

    commentsHtml = `
      <div style="margin-top:.6rem;padding-top:.6rem;border-top:1px solid #2c2619">
        <div style="font-family:'Syne Mono',monospace;font-size:.55rem;
          letter-spacing:.2em;text-transform:uppercase;color:#7a5815;
          margin-bottom:.4rem">Updates</div>
        ${items}
      </div>`;
  }

  return `
    <div>
      <div class="popup-type">${t.icon} ${t.label}</div>
      <div class="popup-area">📍 ${sanitise(inc.area)}</div>
      <div class="popup-desc">${sanitise(inc.description)}</div>
      ${photosHtml}
      ${commentsHtml}
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.4rem;margin-top:.5rem">
        <div class="popup-time">${time}</div>
        ${statusHtml}
      </div>
    </div>`;
}

// ── Filter bar ─────────────────────────── //
function initFilterBar() {
  const catSel    = document.getElementById('filter-category');
  const subcatSel = document.getElementById('filter-subcategory');

  // Build category options from whatever INCIDENT_TYPES currently holds —
  // Sheet-driven if loadConfig() succeeded, hardcoded fallback otherwise.
  // This also fixes the old static filter buttons: renaming or adding a
  // category in the Sheet now actually appears here.
  const groups = groupedTypes();
  Object.keys(groups).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    catSel.appendChild(opt);
  });

  function rebuildSubcategoryOptions() {
    subcatSel.innerHTML = '<option value="all">All Types</option>';
    const cat = catSel.value;
    const types = cat === 'all' ? INCIDENT_TYPES : (groups[cat] || []);
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = `${t.icon} ${t.label}`;
      subcatSel.appendChild(opt);
    });
  }

  catSel.addEventListener('change', () => {
    activeCategory    = catSel.value;
    activeSubcategory = 'all'; // reset sub-category whenever category changes
    rebuildSubcategoryOptions();
    updateSelectStyle(catSel);
    updateSelectStyle(subcatSel);
    renderMarkers();
  });

  subcatSel.addEventListener('change', () => {
    activeSubcategory = subcatSel.value;
    // Keep category in sync — picking a sub-category implies its category,
    // useful since "All Categories" + a specific sub-type is a valid state.
    if (activeSubcategory !== 'all') {
      activeCategory = getType(activeSubcategory).category;
      catSel.value = activeCategory;
      updateSelectStyle(catSel);
    }
    updateSelectStyle(subcatSel);
    renderMarkers();
  });

  rebuildSubcategoryOptions();
}

function updateSelectStyle(sel) {
  sel.classList.toggle('has-value', sel.value !== 'all');
}

// ── Time filter ────────────────────────── //
function initTimeFilter() {
  const sel = document.getElementById('filter-time');
  sel.addEventListener('change', () => {
    activeTimeFilter = sel.value;
    updateSelectStyle(sel);
    renderMarkers();
  });
}

// ── Address search ─────────────────────── //
function initSearch() {
  const input = document.getElementById('search-input');
  const btn   = document.getElementById('search-btn');

  btn.addEventListener('click', () => runSearch(input.value.trim()));

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') runSearch(input.value.trim());
  });
}

async function runSearch(query) {
  if (!query) return;

  const btn = document.getElementById('search-btn');
  btn.textContent = '⏳';
  btn.classList.add('loading');

  try {
    // Nominatim — free, no API key, bias to South Africa
    const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=za`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en-ZA' } });
    const data = await res.json();

    if (!data.length) {
      toast('No results found for that address', 'error', 4000);
      return;
    }

    const { lat, lon, display_name } = data[0];
    const latlng = [parseFloat(lat), parseFloat(lon)];

    // Pan to result
    map.setView(latlng, 15, { animate: true });

    // Remove previous search marker
    if (searchMarker) map.removeLayer(searchMarker);

    // Add pulse marker at result
    searchMarker = L.marker(latlng, {
      icon: L.divIcon({
        html: `<div class="search-pulse"></div>`,
        className: '', iconSize: [20,20], iconAnchor: [10,10],
      }),
    }).addTo(map);

    // Show short address in toast
    const shortName = display_name.split(',').slice(0,3).join(',');
    toast(`📍 ${shortName}`, 'success', 4000);

    // Auto-remove pulse marker after animation (3 pulses × 1.5s)
    setTimeout(() => {
      if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
    }, 5000);

  } catch (err) {
    toast('Search failed: ' + err.message, 'error');
  } finally {
    btn.textContent = '🔍';
    btn.classList.remove('loading');
  }
}
function initReportPanel() {
  const fab    = document.getElementById('fab-report');
  const panel  = document.getElementById('report-panel');
  const form   = document.getElementById('report-form');
  const pickBtn = document.getElementById('pick-on-map');

  fab.addEventListener('click', () => {
    panel.classList.add('open');
    document.getElementById('inc-type').focus();
  });

  // Close on swipe-down / backdrop tap
  panel.addEventListener('click', e => {
    if (e.target === panel) panel.classList.remove('open');
  });

  // Handle
  panel.querySelector('.panel-handle').addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Pick on map
  pickBtn.addEventListener('click', () => {
    panel.classList.remove('open');
    startPickingCoords();
  });

  // Coord dialog
  document.getElementById('coord-confirm').addEventListener('click', () => {
    if (pendingCoords) {
      document.getElementById('inc-lat').value = pendingCoords.lat.toFixed(6);
      document.getElementById('inc-lng').value = pendingCoords.lng.toFixed(6);
    }
    document.getElementById('coord-dialog').classList.add('hidden');
    panel.classList.add('open');
  });
  document.getElementById('coord-cancel').addEventListener('click', () => {
    document.getElementById('coord-dialog').classList.add('hidden');
    panel.classList.add('open');
  });

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      panel.classList.remove('open');
      stopPickingCoords();
      document.getElementById('coord-dialog').classList.add('hidden');
      document.getElementById('notify-dialog').classList.add('hidden');
    }
  });

  form.addEventListener('submit', handleSubmit);
}

// ── Notify dialog ──────────────────────── //
function initNotifyDialog() {
  document.getElementById('notify-whatsapp-link').addEventListener('click', () => {
    // Let the link navigate (opens WhatsApp / wa.me) — just close our dialog after.
    setTimeout(closeNotifyDialog, 300);
  });
  document.getElementById('notify-skip').addEventListener('click', closeNotifyDialog);
}

// ── Coord picker ───────────────────────── //
function startPickingCoords() {
  pickingCoords = true;
  map.getContainer().style.cursor = 'crosshair';
  document.getElementById('map-pick-hint').style.display = 'block';
}
function stopPickingCoords() {
  pickingCoords = false;
  map.getContainer().style.cursor = '';
  document.getElementById('map-pick-hint').style.display = 'none';
}

// ── Type select ────────────────────────── //
function initTypeSelect() {
  const sel  = document.getElementById('inc-type');
  const icon = document.getElementById('type-icon');
  const groups = groupedTypes();

  Object.entries(groups).forEach(([cat, types]) => {
    const og = document.createElement('optgroup');
    og.label = cat;
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = `${t.icon}  ${t.label}`;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });

  sel.addEventListener('change', () => {
    const t = getType(sel.value);
    icon.textContent = t ? t.icon : '📌';
  });
}

// ── Photo slots ────────────────────────── //
function initPhotoSlots() {
  const strip = document.getElementById('photo-strip');
  strip.innerHTML = '';

  for (let i = 0; i < CONFIG.MAX_PHOTOS; i++) {
    const slot = document.createElement('div');
    slot.className = 'photo-slot';
    slot.dataset.index = i;
    slot.innerHTML = `
      <span class="slot-label">📷<br>Add photo</span>
      <input type="file" accept="image/*" capture="environment" data-index="${i}"/>
      <button type="button" class="remove-photo" data-index="${i}" aria-label="Remove photo">✕</button>
    `;
    slot.querySelector('input').addEventListener('change', onPhotoSelected);
    slot.querySelector('.remove-photo').addEventListener('click', removePhoto);
    strip.appendChild(slot);
  }
}

function onPhotoSelected(e) {
  const idx  = parseInt(e.target.dataset.index);
  const file = e.target.files[0];
  if (!file) return;

  // Compress to max 800px before storing
  const reader = new FileReader();
  reader.onload = re => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 800;
      let w = img.width, h = img.height;
      if (w > max || h > max) {
        if (w > h) { h = Math.round(h * max / w); w = max; }
        else       { w = Math.round(w * max / h); h = max; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const b64 = canvas.toDataURL('image/jpeg', 0.8);
      photoFiles[idx] = b64;

      // Show preview
      const slot = document.querySelector(`.photo-slot[data-index="${idx}"]`);
      let preview = slot.querySelector('img');
      if (!preview) {
        preview = document.createElement('img');
        slot.appendChild(preview);
      }
      preview.src = b64;
      slot.classList.add('has-image');
      slot.querySelector('.slot-label').style.display = 'none';
    };
    img.src = re.target.result;
  };
  reader.readAsDataURL(file);
}

function removePhoto(e) {
  e.stopPropagation();
  const idx  = parseInt(e.target.dataset.index);
  photoFiles[idx] = null;
  const slot = document.querySelector(`.photo-slot[data-index="${idx}"]`);
  const img  = slot.querySelector('img');
  if (img) img.remove();
  slot.classList.remove('has-image');
  slot.querySelector('.slot-label').style.display = '';
  slot.querySelector('input').value = '';
}

// ── Submit ─────────────────────────────── //
async function handleSubmit(e) {
  e.preventDefault();
  if (submitting) return;

  const type = document.getElementById('inc-type').value;
  const area = document.getElementById('inc-area').value.trim();
  const desc = document.getElementById('inc-desc').value.trim();
  const errEl = document.getElementById('form-error');

  errEl.classList.add('hidden');

  if (!type) return showFormError('Please select an incident type.');
  if (!area) return showFormError('Please enter an area or suburb.');
  if (!desc) return showFormError('Please describe what happened.');

  submitting = true;
  const btn = document.getElementById('submit-btn');
  btn.textContent = 'Uploading photos…';
  btn.disabled = true;

  // Upload any photos to ImgBB first — get back URLs
  let photoUrls = [];
  const filesToUpload = photoFiles.filter(Boolean);
  if (filesToUpload.length) {
    try {
      btn.textContent = `Uploading ${filesToUpload.length} photo${filesToUpload.length > 1 ? 's' : ''}…`;
      photoUrls = await Promise.all(filesToUpload.map(b64 => uploadToImgBB(b64)));
    } catch (err) {
      submitting = false;
      btn.textContent = 'Submit for Review';
      btn.disabled = false;
      return showFormError(`Photo upload failed: ${err.message}`);
    }
  }

  btn.textContent = 'Submitting…';

  const payload = {
    action:      'submitReport',
    type,
    area,
    description: desc,
    lat:         parseFloat(document.getElementById('inc-lat').value) || null,
    lng:         parseFloat(document.getElementById('inc-lng').value) || null,
    photos:      photoUrls,
  };

  try {
    const res  = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('report-panel').classList.remove('open');
      document.getElementById('report-form').reset();
      photoFiles = [null, null, null];
      initPhotoSlots();
      document.getElementById('inc-lat').value = '';
      document.getElementById('inc-lng').value = '';

      if (data.notify && data.notify.whatsappNumber) {
        showNotifyDialog(data.notify, type, area);
      } else {
        toast('Report submitted — thank you. It will appear once reviewed.', 'success', 5000);
      }
    } else {
      showFormError(data.error || 'Submission failed. Please try again.');
    }
  } catch (err) {
    showFormError('Network error. Please check your connection and try again.');
  } finally {
    submitting = false;
    btn.textContent = 'Submit for Review';
    btn.disabled = false;
  }
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Post-submit WhatsApp notify dialog ─── //
/*
  Shown after a successful report submission, only when the backend
  matched an area admin (or fell back to the super admin) with a
  WhatsApp number on file. Tapping the button opens a wa.me deep link
  pre-filled with a short, privacy-friendly message — the reporter
  still has to tap Send themselves inside WhatsApp; this is a deep
  link, not an automatic push.
*/
function showNotifyDialog(notify, type, area) {
  const link = buildWhatsAppLink(notify.whatsappNumber, notify.name, type, area);
  if (!link) {
    toast('Report submitted — thank you. It will appear once reviewed.', 'success', 5000);
    return;
  }

  const dialog = document.getElementById('notify-dialog');
  document.getElementById('notify-admin-name').textContent = notify.name || 'the admin';
  document.getElementById('notify-whatsapp-link').href = link;
  dialog.classList.remove('hidden');
}

function closeNotifyDialog() {
  document.getElementById('notify-dialog').classList.add('hidden');
  toast('Report submitted — thank you. It will appear once reviewed.', 'success', 5000);
}

// ── Toast ──────────────────────────────── //
function toast(msg, type = 'default', duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show toast-${type}`;
  setTimeout(() => el.className = '', duration);
}

// ── Cursor ─────────────────────────────── //
function initCursor() {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  let mx=0, my=0, rx=0, ry=0;
  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });
  document.addEventListener('mouseleave',() => { dot.style.opacity='0'; ring.style.opacity='0'; });
  document.addEventListener('mouseenter',() => { dot.style.opacity='1'; ring.style.opacity='1'; });
  (function loop() {
    rx += (mx-rx)*.12; ry += (my-ry)*.12;
    dot.style.left  = mx+'px'; dot.style.top  = my+'px';
    ring.style.left = rx+'px'; ring.style.top = ry+'px';
    requestAnimationFrame(loop);
  })();
}

// ── Sanitise HTML output ───────────────── //
function sanitise(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
