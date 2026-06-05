/* ══════════════════════════════════════════
   SA Incident Tracker — map.js
   Public view: Leaflet map + report form
══════════════════════════════════════════ */

// ── State ──────────────────────────────── //
let map, markersLayer;
let incidents       = [];
let activeFilter    = 'all';
let pickingCoords   = false;
let pendingCoords   = null;
let photoFiles      = [null, null, null];
let submitting      = false;

// ── Boot ───────────────────────────────── //
document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  initMap();
  initTypeSelect();
  initPhotoSlots();
  initReportPanel();
  initFilterBar();
  loadIncidents();
});

// ── Map ────────────────────────────────── //
function initMap() {
  map = L.map('map', {
    center: CONFIG.MAP_CENTER,
    zoom:   CONFIG.MAP_ZOOM,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'bottomleft' }).addTo(map);

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
  const filtered = activeFilter === 'all'
    ? incidents
    : incidents.filter(i => getType(i.type).category === activeFilter);

  filtered.forEach(inc => {
    if (!inc.lat || !inc.lng) return;
    const t = getType(inc.type);
    const icon = L.divIcon({
      html: `<div class="marker-dot" style="background:${t.color};color:${t.color}"></div>`,
      className: '',
      iconSize:   [14, 14],
      iconAnchor: [7, 7],
    });

    const marker = L.marker([inc.lat, inc.lng], { icon });
    marker.bindPopup(buildPopup(inc), { maxWidth: 280 });
    markersLayer.addLayer(marker);
  });
}

function buildPopup(inc) {
  const t    = getType(inc.type);
  const time = inc.timestamp
    ? new Date(inc.timestamp).toLocaleString('en-ZA', { dateStyle:'medium', timeStyle:'short' })
    : '—';

  let photosHtml = '';
  if (inc.photos?.length) {
    photosHtml = `<div class="popup-photos">
      ${inc.photos.map(url => `<img src="${url}" alt="Incident photo" onclick="window.open('${url}','_blank')">`).join('')}
    </div>`;
  }

  return `
    <div>
      <div class="popup-type">${t.icon} ${t.label}</div>
      <div class="popup-area">📍 ${inc.area}</div>
      <div class="popup-desc">${sanitise(inc.description)}</div>
      ${photosHtml}
      <div class="popup-time">${time}</div>
    </div>`;
}

// ── Filter bar ─────────────────────────── //
function initFilterBar() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderMarkers();
    });
  });
}

// ── Report panel ───────────────────────── //
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
    }
  });

  form.addEventListener('submit', handleSubmit);
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
  btn.textContent = 'Submitting…';
  btn.disabled = true;

  const payload = {
    action:      'submitReport',
    type,
    area,
    description: desc,
    lat:         parseFloat(document.getElementById('inc-lat').value) || null,
    lng:         parseFloat(document.getElementById('inc-lng').value) || null,
    photos:      photoFiles.filter(Boolean),
  };

  try {
    const res  = await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('report-panel').classList.remove('open');
      document.getElementById('report-form').reset();
      photoFiles = [null, null, null];
      initPhotoSlots();
      document.getElementById('inc-lat').value = '';
      document.getElementById('inc-lng').value = '';
      toast('Report submitted — thank you. It will appear once reviewed.', 'success', 5000);
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
