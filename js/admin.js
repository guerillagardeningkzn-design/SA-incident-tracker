/* ══════════════════════════════════════════
   SA Incident Tracker — admin.js
══════════════════════════════════════════ */

// ── State ──────────────────────────────── //
let allReports  = [];
let activeTab   = 'pending';
let cctvCameras = [];
let cctvTimer   = null;
let imgbbKey    = '';
let blurState   = { photos:[], index:0, rects:[], drawing:false, startX:0, startY:0, reportId:null };

// ── Boot ───────────────────────────────── //
document.addEventListener('DOMContentLoaded', () => {
  initCursor();
  initPin();
  // Admin screen inits after login
});

// ── PIN ────────────────────────────────── //
function initPin() {
  let entered = '';
  const dots  = document.getElementById('pin-dots');
  const err   = document.getElementById('pin-error');

  // Build dot indicators
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('div');
    d.className = 'pin-dot'; dots.appendChild(d);
  }

  function updateDots() {
    dots.querySelectorAll('.pin-dot').forEach((d, i) => {
      d.classList.toggle('filled', i < entered.length);
    });
  }

  function trySubmit() {
    if (entered === CONFIG.ADMIN_PIN) {
      document.getElementById('login-screen').style.display = 'none';
      const screen = document.getElementById('admin-screen');
      screen.classList.add('active');
      initAdminScreen();
      fetchAdminConfig();
    } else {
      err.textContent = 'Incorrect PIN';
      entered = '';
      updateDots();
      setTimeout(() => err.textContent = '', 2000);
    }
  }

  document.querySelectorAll('[data-d]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (entered.length >= 4) return;
      entered += btn.dataset.d;
      updateDots();
      if (entered.length === 4) setTimeout(trySubmit, 200);
    });
  });

  document.getElementById('pin-clear').addEventListener('click', () => {
    entered = ''; updateDots(); err.textContent = '';
  });

  document.getElementById('pin-submit').addEventListener('click', trySubmit);

  // Keyboard support
  document.addEventListener('keydown', e => {
    if (document.getElementById('admin-screen').classList.contains('active')) return;
    if (e.key >= '0' && e.key <= '9' && entered.length < 4) {
      entered += e.key; updateDots();
      if (entered.length === 4) setTimeout(trySubmit, 200);
    }
    if (e.key === 'Backspace') { entered = entered.slice(0,-1); updateDots(); }
    if (e.key === 'Enter') trySubmit();
  });
}

// ── Fetch admin config ─────────────────── //
async function fetchAdminConfig() {
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=getAdminConfig&pin=${CONFIG.ADMIN_PIN}`);
    const data = await res.json();
    if (data.error) { console.warn('Config error:', data.error); return; }
    imgbbKey = data.imgbbKey || '';
    // Populate settings fields
    const keyInput = document.getElementById('settings-imgbb-key');
    if (keyInput) keyInput.value = imgbbKey ? '••••••••' : '';
    if (imgbbKey) {
      document.getElementById('imgbb-status').textContent = '✓ Key set';
      document.getElementById('imgbb-status').className = 'success mono';
    }
  } catch (err) {
    console.warn('Could not load admin config:', err);
  }
}

// ── ImgBB upload ───────────────────────── //
async function uploadToImgBB(base64) {
  if (!imgbbKey) throw new Error('ImgBB key not set — save it in Settings first');
  const b64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const formData = new FormData();
  formData.append('image', b64);
  formData.append('key', imgbbKey);
  const res  = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) return data.data.url;
  throw new Error(data.error?.message || 'ImgBB upload failed');
}


function initAdminScreen() {
  initAdminTypeSelect();
  loadReports();
  loadCameras();
  bindAdminEvents();
}

function bindAdminEvents() {
  document.getElementById('btn-logout').addEventListener('click', () => {
    location.reload();
  });
  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadReports();
    toast('Refreshed', 'success');
  });

  // Queue tabs
  document.querySelectorAll('.queue-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.queue-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      renderQueue();
    });
  });

  // Add CCTV
  document.getElementById('btn-add-cctv').addEventListener('click', addCamera);

  // Add verified incident
  document.getElementById('btn-add-incident').addEventListener('click', addVerifiedIncident);

  // Settings — ImgBB key
  document.getElementById('btn-save-imgbb').addEventListener('click', saveImgBBKey);

  // Blur tool
  initBlurTool();
}

// ── Reports ────────────────────────────── //
async function loadReports() {
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=getAll&pin=${CONFIG.ADMIN_PIN}`);
    const data = await res.json();
    if (data.error) {
      toast(`Error: ${data.error}`, 'error', 6000);
      console.error('getAll error:', data.error);
      return;
    }
    allReports = data.reports || [];
    updateStats();
    renderQueue();
  } catch (err) {
    toast(`Could not load reports: ${err.message}`, 'error', 6000);
    console.error('loadReports fetch error:', err);
  }
}

function updateStats() {
  const today = new Date().toDateString();
  document.getElementById('stat-pending').textContent  = allReports.filter(r => r.status === 'pending').length;
  document.getElementById('stat-approved').textContent = allReports.filter(r => r.status === 'approved').length;
  document.getElementById('stat-rejected').textContent = allReports.filter(r => r.status === 'rejected').length;
  document.getElementById('stat-today').textContent    = allReports.filter(r =>
    new Date(r.timestamp).toDateString() === today
  ).length;
}

function renderQueue() {
  const list    = document.getElementById('queue-list');
  const filtered = allReports.filter(r => r.status === activeTab);

  if (!filtered.length) {
    list.innerHTML = `<div class="queue-empty">No ${activeTab} reports.</div>`;
    return;
  }

  list.innerHTML = '';
  filtered.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
    .forEach(r => list.appendChild(buildReportCard(r)));
}

function buildReportCard(r) {
  const t    = getType(r.type);
  const time = new Date(r.timestamp).toLocaleString('en-ZA', { dateStyle:'short', timeStyle:'short' });
  const div  = document.createElement('div');
  div.className = `report-card card ${r.status}`;
  div.dataset.id = r.id;

  let photosHtml = '';
  if (r.photos?.length) {
    photosHtml = `<div class="report-photos">
      ${r.photos.map((url,i) => `<img src="${url}" data-report="${r.id}" data-index="${i}" alt="Photo ${i+1}" onclick="openBlur('${r.id}')">`).join('')}
    </div>`;
  }

  let actionsHtml = '';
  if (r.status === 'pending') {
    actionsHtml = `
      <button class="btn btn-success btn-sm" onclick="moderateReport('${r.id}','approve')">✓ Approve</button>
      <button class="btn btn-danger  btn-sm" onclick="moderateReport('${r.id}','reject')">✕ Reject</button>`;
  } else if (r.status === 'approved') {
    actionsHtml = `<button class="btn btn-danger btn-sm" onclick="moderateReport('${r.id}','reject')">✕ Remove</button>`;
  } else {
    actionsHtml = `<button class="btn btn-success btn-sm" onclick="moderateReport('${r.id}','approve')">↩ Restore</button>`;
  }

  div.innerHTML = `
    <div class="report-header">
      <div>
        <div class="report-type">${t.icon} ${t.label}</div>
        <div class="report-area">📍 ${r.area}</div>
      </div>
      <div style="text-align:right">
        <span class="badge badge-${r.status}">${r.status}</span>
        <div class="report-time" style="margin-top:.4rem">${time}</div>
      </div>
    </div>
    <p class="report-desc">${sanitise(r.description)}</p>
    ${r.lat ? `<p class="report-coords">📌 ${r.lat}, ${r.lng}</p>` : ''}
    ${photosHtml}
    <div class="report-actions">${actionsHtml}</div>
  `;
  return div;
}

async function moderateReport(id, action) {
  try {
    const res  = await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      body:    JSON.stringify({ action: 'moderate', id, decision: action, pin: CONFIG.ADMIN_PIN }),
    });
    const data = await res.json();
    if (data.success) {
      const report = allReports.find(r => r.id === id);
      if (report) report.status = action === 'approve' ? 'approved' : 'rejected';
      updateStats();
      renderQueue();
      toast(`Report ${action === 'approve' ? 'approved' : 'rejected'}`, 'success');
    } else {
      toast(data.error || 'Action failed', 'error');
    }
  } catch {
    toast('Network error', 'error');
  }
}

// ── Add verified incident ──────────────── //
async function addVerifiedIncident() {
  const type = document.getElementById('admin-inc-type').value;
  const area = document.getElementById('admin-inc-area').value.trim();
  const desc = document.getElementById('admin-inc-desc').value.trim();
  const lat  = parseFloat(document.getElementById('admin-lat').value) || null;
  const lng  = parseFloat(document.getElementById('admin-lng').value) || null;

  if (!type || !area || !desc) return toast('Type, area and description required', 'error');

  try {
    const res  = await fetch(CONFIG.GAS_URL, {
      method:  'POST',
      body:    JSON.stringify({ action: 'addVerified', type, area, description:desc, lat, lng, pin: CONFIG.ADMIN_PIN }),
    });
    const data = await res.json();
    if (data.success) {
      toast('Incident added', 'success');
      document.getElementById('admin-inc-type').value = '';
      document.getElementById('admin-inc-area').value = '';
      document.getElementById('admin-inc-desc').value = '';
      loadReports();
    } else {
      toast(data.error || 'Failed', 'error');
    }
  } catch { toast('Network error', 'error'); }
}

// ── Admin type select ──────────────────── //
function initAdminTypeSelect() {
  const sel  = document.getElementById('admin-inc-type');
  const icon = document.getElementById('admin-type-icon');
  const groups = groupedTypes();
  Object.entries(groups).forEach(([cat, types]) => {
    const og = document.createElement('optgroup');
    og.label = cat;
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value; opt.textContent = `${t.icon}  ${t.label}`;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  sel.addEventListener('change', () => {
    const t = getType(sel.value);
    icon.textContent = t ? t.icon : '📌';
  });
}

// ── Settings ───────────────────────────── //
async function saveImgBBKey() {
  const input = document.getElementById('settings-imgbb-key');
  const key   = input.value.trim();
  if (!key || key === '••••••••') return toast('Enter a valid ImgBB API key', 'error');

  try {
    const res  = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body:   JSON.stringify({ action: 'setConfig', pin: CONFIG.ADMIN_PIN, imgbbKey: key }),
    });
    const data = await res.json();
    if (data.ok || data.success) {
      imgbbKey = key;
      input.value = '••••••••';
      document.getElementById('imgbb-status').textContent = '✓ Key saved';
      document.getElementById('imgbb-status').className = 'success mono';
      toast('ImgBB key saved', 'success');
    } else {
      toast(data.error || 'Save failed', 'error');
    }
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
  }
}

// ── CCTV ───────────────────────────────── //
function loadCameras() {
  const stored = localStorage.getItem('cctv_cameras');
  cctvCameras = stored ? JSON.parse(stored) : [
    { name: 'i-traffic · N3 Durban', url: 'http://www.i-traffic.co.za/camimage/KZN/N3_TOLL_DUAL_CARRIAGEWAY_PINETOWN.jpg' },
  ];
  renderCameras();
  startCctvRefresh();
}

function saveCameras() {
  localStorage.setItem('cctv_cameras', JSON.stringify(cctvCameras));
}

function renderCameras() {
  const container = document.getElementById('cctv-feeds');
  container.innerHTML = '';
  cctvCameras.forEach((cam, i) => {
    const div = document.createElement('div');
    div.className = 'cctv-feed';
    div.innerHTML = `
      <div class="cctv-title">
        <span>${cam.name}</span>
        <button onclick="removeCamera(${i})" title="Remove">✕</button>
      </div>
      <img class="cctv-img" src="${cam.url}?t=${Date.now()}" alt="${cam.name}"
        onerror="this.style.opacity='.3';this.alt='Feed unavailable'"/>
    `;
    container.appendChild(div);
  });
}

function refreshCameras() {
  document.querySelectorAll('.cctv-img').forEach((img, i) => {
    const cam = cctvCameras[i];
    if (cam) img.src = `${cam.url}?t=${Date.now()}`;
  });
}

function startCctvRefresh() {
  if (cctvTimer) clearInterval(cctvTimer);
  cctvTimer = setInterval(refreshCameras, CONFIG.CCTV_REFRESH_SECONDS * 1000);
}

function addCamera() {
  const name = document.getElementById('cctv-name').value.trim();
  const url  = document.getElementById('cctv-url').value.trim();
  if (!name || !url) return toast('Name and URL required', 'error');
  cctvCameras.push({ name, url });
  saveCameras();
  renderCameras();
  document.getElementById('cctv-name').value = '';
  document.getElementById('cctv-url').value  = '';
  toast('Camera added', 'success');
}

function removeCamera(i) {
  cctvCameras.splice(i, 1);
  saveCameras();
  renderCameras();
}

// ── Blur tool ──────────────────────────── //
function initBlurTool() {
  const canvas = document.getElementById('blur-canvas');
  const ctx    = canvas.getContext('2d');

  canvas.addEventListener('mousedown',  e => startRect(e, canvas));
  canvas.addEventListener('mousemove',  e => drawRect(e, canvas, ctx));
  canvas.addEventListener('mouseup',    e => endRect(e, canvas));
  canvas.addEventListener('touchstart', e => startRect(e.touches[0], canvas), { passive: true });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); drawRect(e.touches[0], canvas, ctx); }, { passive: false });
  canvas.addEventListener('touchend',   e => endRect(e.changedTouches[0], canvas));

  document.getElementById('blur-prev').addEventListener('click',   () => changeBlurPhoto(-1));
  document.getElementById('blur-next').addEventListener('click',   () => changeBlurPhoto(1));
  document.getElementById('blur-clear').addEventListener('click',  () => { blurState.rects = []; redrawCanvas(ctx, canvas); });
  document.getElementById('blur-apply').addEventListener('click',  () => applyBlur(ctx, canvas));
  document.getElementById('blur-done').addEventListener('click',   () => saveAllBlurred());
  document.getElementById('blur-cancel').addEventListener('click', () => closeBlurTool());
}

window.openBlur = function(reportId) {
  const report = allReports.find(r => r.id === reportId);
  if (!report?.photos?.length) return;
  blurState = {
    photos:    [...report.photos],
    index:     0,
    rects:     [],
    drawing:   false,
    startX:    0, startY: 0,
    reportId,
    localUrls: {}, // blob/data URLs keyed by index — avoids canvas CORS taint
  };
  document.getElementById('blur-wrapper').classList.remove('hidden');
  loadBlurPhoto();
};

async function loadBlurPhoto() {
  const canvas = document.getElementById('blur-canvas');
  const ctx    = canvas.getContext('2d');
  const src    = blurState.photos[blurState.index];

  // Use cached local URL if already loaded, or if it's already a data URL
  let imageUrl = blurState.localUrls[blurState.index];

  if (!imageUrl) {
    if (src.startsWith('data:') || src.startsWith('blob:')) {
      // Already local — safe to draw directly
      imageUrl = src;
    } else {
      // External URL (ImgBB) — fetch as blob to avoid canvas CORS taint
      // Without this, toDataURL() throws SecurityError and blur never saves
      try {
        const res  = await fetch(src);
        const blob = await res.blob();
        imageUrl   = URL.createObjectURL(blob);
      } catch (err) {
        toast('Cannot load photo: ' + err.message, 'error');
        return;
      }
    }
    blurState.localUrls[blurState.index] = imageUrl;
  }

  const img = new Image();
  img.onload = () => {
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    blurState.rects = [];
    document.getElementById('blur-counter').textContent =
      `Photo ${blurState.index + 1} of ${blurState.photos.length}`;
  };
  img.onerror = () => toast('Cannot display photo', 'error');
  img.src = imageUrl;
}

function getCanvasCoords(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width  / r.width),
    y: (e.clientY - r.top)  * (canvas.height / r.height),
  };
}

function startRect(e, canvas) {
  const { x, y } = getCanvasCoords(e, canvas);
  blurState.drawing = true;
  blurState.startX  = x;
  blurState.startY  = y;
}
function drawRect(e, canvas, ctx) {
  if (!blurState.drawing) return;
  const { x, y } = getCanvasCoords(e, canvas);
  redrawCanvas(ctx, canvas);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth   = 3;
  ctx.strokeRect(blurState.startX, blurState.startY, x - blurState.startX, y - blurState.startY);
}
function endRect(e, canvas) {
  if (!blurState.drawing) return;
  blurState.drawing = false;
  const { x, y } = getCanvasCoords(e, canvas);
  const rect = {
    x: Math.min(blurState.startX, x),
    y: Math.min(blurState.startY, y),
    w: Math.abs(x - blurState.startX),
    h: Math.abs(y - blurState.startY),
  };
  if (rect.w > 5 && rect.h > 5) blurState.rects.push(rect);
  redrawCanvas(document.getElementById('blur-canvas').getContext('2d'), canvas);
}

function redrawCanvas(ctx, canvas) {
  // Use cached blob/data URL — never re-fetch external URL which would re-taint canvas
  const src = blurState.localUrls[blurState.index] || blurState.photos[blurState.index];
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blurState.rects.forEach(r => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    });
  };
  img.src = src;
}

function applyBlur(ctx, canvas) {
  blurState.rects.forEach(r => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  });

  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    // If this throws, canvas is still tainted — blob fetch in loadBlurPhoto should prevent this
    toast('Could not save blur — canvas security error: ' + err.message, 'error');
    return;
  }

  // Update both photos array (for upload) and localUrls cache (for redraw)
  blurState.photos[blurState.index]    = dataUrl;
  blurState.localUrls[blurState.index] = dataUrl;
  blurState.rects = [];
  toast('Blur applied to this photo', 'success');
}

function changeBlurPhoto(dir) {
  const next = blurState.index + dir;
  if (next < 0 || next >= blurState.photos.length) return;
  blurState.index = next;
  loadBlurPhoto();
}

async function saveAllBlurred() {
  toast('Uploading blurred photos…', 'default', 8000);
  try {
    // Re-upload modified photos (base64) to ImgBB — pass through existing URLs unchanged
    const uploadedUrls = await Promise.all(
      blurState.photos.map(p =>
        p.startsWith('http') ? Promise.resolve(p) : uploadToImgBB(p)
      )
    );
    const res  = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body:   JSON.stringify({
        action: 'updatePhotos',
        id:     blurState.reportId,
        photos: uploadedUrls,
        pin:    CONFIG.ADMIN_PIN,
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast('Blurred photos saved', 'success');
      const r = allReports.find(r => r.id === blurState.reportId);
      if (r) r.photos = uploadedUrls;
    } else {
      toast('Save failed: ' + (data.error || 'unknown'), 'error');
    }
  } catch (err) {
    toast('Upload error: ' + err.message, 'error');
  }
  closeBlurTool();
}

function closeBlurTool() {
  document.getElementById('blur-wrapper').classList.add('hidden');
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

// ── Sanitise ───────────────────────────── //
function sanitise(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
