/* ══════════════════════════════════════════
   SA Incident Tracker — Config
   Replace GAS_URL with your deployed
   Google Apps Script Web App URL
══════════════════════════════════════════ */

const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxV4Zj-LSJzeB1ufQmfUtOlibCU2JnWvYa552SH0MWJIkbEheJ9uAGAKlmUIsYUmtSv/exec',
  MAP_CENTER: [-30.4709923, 30.5991048], // Ifafa / KZN
  MAP_ZOOM: 12,
  ADMIN_PIN: '1234', // Change this — also set in GAS
  MAX_PHOTOS: 3,
  CCTV_REFRESH_SECONDS: 60,
};

const INCIDENT_TYPES = [
  // Security
  { value: 'suspicious_person',  label: 'Suspicious Person/s',       icon: '👤', color: '#f59e0b', category: 'Security' },
  { value: 'suspicious_vehicle', label: 'Suspicious Vehicle',        icon: '🚗', color: '#fbbf24', category: 'Security' },
  { value: 'crime_inprogress',   label: 'Crime in Progress',         icon: '🚨', color: '#ef4444', category: 'Security' },
  { value: 'crime_reported',     label: 'Crime (Reported)',          icon: '📋', color: '#dc2626', category: 'Security' },
  { value: 'hijacking',          label: 'Hijacking / Armed Robbery', icon: '🔫', color: '#b91c1c', category: 'Security' },
  // Emergency
  { value: 'fire_smoke',         label: 'Fire / Smoke Detected',     icon: '🔥', color: '#ea580c', category: 'Emergency' },
  { value: 'medical',            label: 'Medical Emergency',         icon: '🚑', color: '#ec4899', category: 'Emergency' },
  // Infrastructure
  { value: 'water_leak',         label: 'Water Leak / Burst Pipe',   icon: '💧', color: '#3b82f6', category: 'Infrastructure' },
  { value: 'power_outage',       label: 'Power Outage',              icon: '⚡', color: '#818cf8', category: 'Infrastructure' },
  { value: 'road_hazard',        label: 'Road Hazard / Debris',      icon: '🚧', color: '#84cc16', category: 'Infrastructure' },
  // Animals
  { value: 'unattended_dog',     label: 'Unattended Dog / No Owner', icon: '🐕', color: '#a78bfa', category: 'Animals' },
  { value: 'injured_animal',     label: 'Injured / Dangerous Animal',icon: '🐾', color: '#7c3aed', category: 'Animals' },
  // Civil
  { value: 'protest',            label: 'Protest / March',           icon: '✊', color: '#f97316', category: 'Civil' },
  { value: 'road_block',         label: 'Road Block / Disruption',   icon: '🛑', color: '#fb923c', category: 'Civil' },
  { value: 'looting',            label: 'Riot / Looting',            icon: '⚠️', color: '#ef4444', category: 'Civil' },
  // Other
  { value: 'other',              label: 'Other',                     icon: '📌', color: '#6b7280', category: 'Other' },
];

function getType(value) {
  return INCIDENT_TYPES.find(t => t.value === value) || INCIDENT_TYPES[INCIDENT_TYPES.length - 1];
}

function groupedTypes() {
  return INCIDENT_TYPES.reduce((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});
}
