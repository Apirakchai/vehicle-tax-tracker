/* ระบบจัดการภาษีรถยนต์ — Black Chicken Farm
   Auth via SHA-256 + sessionStorage
   Local persistence via localStorage
   Optional Google Sheets sync via Apps Script Web App */

// =========== Auth Guard ===========
const SESSION_KEY = "bcf_vt_auth";
const STORAGE_KEY = "bcf_vt_records";
const SETTINGS_KEY = "bcf_vt_settings";

if (sessionStorage.getItem(SESSION_KEY) !== "1") {
  window.location.href = "login.html";
}

// =========== State ===========
let records = [];
let editingId = null;
let currentFilter = { cat: "all", search: "", status: "all", type: "all" };
let autoSyncTimer = null;
let lastSyncTime = 0;
let isSyncing = false;
let isModalOpen = false;
let currentPage = "dashboard";
let chartInstances = {};
let pdfSelectedIds = new Set();
let msMonth = null;  // {year, month} - selected month for monthly summary; null = current
let renewingId = null;
let renewPeriod = "1y";  // default: 1 year
const AUTO_SYNC_INTERVAL = 30000; // 30 วินาที

// Thai month names
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// Theme colors
const COLORS = {
  navy: '#0a1f44',
  gold: '#c9a961',
  blue: '#0066b3',
  red: '#dc2626',
  amber: '#f59e0b',
  yellow: '#eab308',
  green: '#16a34a',
  gray: '#9ca3af',
  ivory: '#f7f4ec',
};
const CHART_PALETTE = [COLORS.navy, COLORS.blue, COLORS.gold, COLORS.green, COLORS.amber, COLORS.red, '#7c3aed', '#0891b2'];

// =========== Utilities ===========
const $ = id => document.getElementById(id);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  // Thai locale dd/mm/yyyy with Buddhist year
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const fmtMoney = (n) => {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v === 0) return "—";
  return "฿" + v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const daysUntil = (iso) => {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(iso);
  d.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
};
// แปลงค่าวันที่รูปแบบใดก็ตาม (ISO เต็ม, Date object, yyyy-mm-dd) → "yyyy-mm-dd"
// สำหรับใส่ใน <input type="date"> ซึ่งรับเฉพาะรูปแบบนี้
function toDateInputValue(v) {
  if (!v) return "";
  // ถ้าเป็น yyyy-mm-dd อยู่แล้ว (อาจมีเวลาต่อท้าย) — ตัดเอาเฉพาะ 10 ตัวแรก
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
  }
  // ลองแปลงเป็น Date (เช่น ISO เต็มจาก Google Sheets หรือ Date object)
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  // ใช้ local date components กัน timezone เลื่อนวัน
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
const statusOf = (rec) => {
  if (rec.suspended) return "suspended";
  const d = daysUntil(rec.end);
  if (d === null) return "ok";
  if (d < 0) return "overdue";
  if (d <= 30) return "urgent";
  if (d <= 90) return "soon";
  return "ok";
};
const statusLabel = {
  overdue: "เลยกำหนด",
  urgent: "ด่วน",
  soon: "ใกล้ครบ",
  ok: "ปกติ",
  suspended: "ยกเว้นเตือน",
};

// Suspension helpers — ระดับ vehicle (ทั้งคัน) คือเมื่อ records ทุกอันของทะเบียนนั้น suspended
function isVehicleSuspended(plate) {
  const recs = records.filter(r => r.plate === plate);
  if (recs.length === 0) return false;
  return recs.every(r => r.suspended === true);
}

function suspendWholeVehicle(plate, suspended) {
  const targets = records.filter(r => r.plate === plate);
  if (targets.length === 0) return 0;
  targets.forEach(r => {
    r.suspended = !!suspended;
  });
  saveRecords();
  // Sync each record to Sheets
  targets.forEach(r => syncToSheets("upsert", r));
  logActivity(suspended ? "suspend" : "unsuspend",
    (suspended ? "ระงับเตือนทั้งคัน " : "เปิดเตือนทั้งคัน ") + plate + " (" + targets.length + " รายการ)",
    { plate });
  return targets.length;
}

// Toggle ระงับเฉพาะรายการเดียว (record-level)
function toggleSuspend(id) {
  const idx = records.findIndex(r => r.id === id);
  if (idx < 0) return;
  const r = records[idx];
  const willSuspend = !r.suspended;

  // ถามว่าจะระงับทั้งคันหรือเฉพาะรายการนี้
  if (willSuspend) {
    const otherRecs = records.filter(x => x.plate === r.plate && x.id !== id);
    if (otherRecs.length > 0) {
      const choice = confirm(
        `ระงับเตือน "${r.plate} - ${r.type}"?\n\n` +
        `กด OK = ระงับเฉพาะรายการนี้\n` +
        `กด Cancel = ยกเลิก (ถ้าต้องการระงับทั้งคัน ${r.plate} ใช้ปุ่ม "ระงับทั้งคัน" ในหน้าแก้ไข)`
      );
      if (!choice) return;
    } else {
      if (!confirm(`ระงับเตือน "${r.plate} - ${r.type}"?`)) return;
    }
  } else {
    if (!confirm(`เปิดเตือน "${r.plate} - ${r.type}" อีกครั้ง?`)) return;
  }

  r.suspended = willSuspend;
  saveRecords();
  syncToSheets("upsert", r);
  logActivity(willSuspend ? "suspend" : "unsuspend",
    (willSuspend ? "ระงับเตือน " : "เปิดเตือน ") + r.plate + " (" + r.type + ")",
    { plate: r.plate, type: r.type });
  renderAll();
  showToast(willSuspend ? `🔕 ระงับเตือน ${r.plate} (${r.type})` : `🔔 เปิดเตือน ${r.plate} (${r.type})`);
}
const typeBadge = (t) => {
  if (t === "ต่อภาษี") return `<span class="type-badge type-tax">ต่อภาษี</span>`;
  if (t === "พ.ร.บ.") return `<span class="type-badge type-prb">พ.ร.บ.</span>`;
  return `<span class="type-badge type-insurance">${t}</span>`;
};
const escapeHtml = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// =========== Storage ===========
function loadRecords() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { records = JSON.parse(stored); }
    catch (e) { records = [...window.SEED_DATA]; }
  } else {
    records = window.SEED_DATA.map(r => ({ ...r }));
    saveRecords();
  }
}
function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}
// =========== PWA: Service Worker & Install ===========
let _deferredInstallPrompt = null;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Wait until window is loaded to avoid blocking startup
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then(reg => {
        console.log("[PWA] Service worker registered");
        // Listen for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New version available
              showUpdateAvailable(reg);
            }
          });
        });
      })
      .catch(err => console.warn("[PWA] SW registration failed:", err));
  });
}

function showUpdateAvailable(reg) {
  // Show update toast — user can tap to reload
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: var(--navy); color: white; padding: 14px 20px; border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 9999;
    display: flex; align-items: center; gap: 14px;
    font-family: 'Sarabun', sans-serif;
  `;
  toast.innerHTML = `
    <span>🔄 มีเวอร์ชันใหม่</span>
    <button id="reloadBtn" style="background:var(--gold); color:var(--navy); border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">รีโหลด</button>
    <button id="dismissUpdate" style="background:transparent; color:white; border:none; cursor:pointer; opacity:0.7; font-size:18px;">×</button>
  `;
  document.body.appendChild(toast);
  toast.querySelector("#reloadBtn").addEventListener("click", () => {
    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => location.reload(), 200);
  });
  toast.querySelector("#dismissUpdate").addEventListener("click", () => toast.remove());
}

// Install prompt handler
function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    showInstallButton();
  });
  // Hide install button after install
  window.addEventListener("appinstalled", () => {
    _deferredInstallPrompt = null;
    hideInstallButton();
    showToast("ติดตั้งแอปสำเร็จ 📱");
    logActivity("install", "ติดตั้งเป็นแอป");
  });
}

function showInstallButton() {
  // Show a floating install button in bottom-right
  if (document.getElementById("pwaInstallBtn")) return;
  // Don't show if already running as PWA
  if (window.matchMedia("(display-mode: standalone)").matches) return;
  if (window.navigator.standalone) return; // iOS

  const btn = document.createElement("button");
  btn.id = "pwaInstallBtn";
  btn.innerHTML = "📱 ติดตั้งเป็นแอป";
  btn.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 100;
    background: var(--gold); color: var(--navy); border: none;
    padding: 12px 18px; border-radius: 50px; font-family: 'Sarabun', sans-serif;
    font-size: 13px; font-weight: 700; cursor: pointer;
    box-shadow: 0 6px 20px rgba(201, 169, 97, 0.4);
    display: inline-flex; align-items: center; gap: 6px;
    animation: bounceIn 0.5s;
  `;
  btn.addEventListener("click", triggerInstall);
  document.body.appendChild(btn);
}

function hideInstallButton() {
  const btn = document.getElementById("pwaInstallBtn");
  if (btn) btn.remove();
}

async function triggerInstall() {
  if (!_deferredInstallPrompt) {
    showToast("กรุณาใช้เมนูเบราว์เซอร์เพื่อติดตั้ง", "warning");
    return;
  }
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  if (outcome === "accepted") {
    showToast("กำลังติดตั้ง...");
  }
  _deferredInstallPrompt = null;
  hideInstallButton();
}

// Detect if running as installed PWA
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
         window.navigator.standalone === true;
}

// =========== Initialize PWA on script load ===========
registerServiceWorker();
setupInstallPrompt();


// URLs ฝังไว้ในโค้ด — ทุกเครื่องที่เปิดระบบจะใช้ค่าเหล่านี้โดยอัตโนมัติ
const DEFAULT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx5iWtn5oRdSaRnzRQFv1a4Fr1XVSnbKVEX0AF_1QOxJM5Bn2B5mWIwrRmeSTwYTJM/exec";
const DEFAULT_NOTIFY_EMAIL = "bcf2546@gmail.com";

function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch (e) { s = {}; }
  // Apply defaults for any missing fields
  if (!s.webhookUrl) s.webhookUrl = DEFAULT_WEBHOOK_URL;
  if (!s.email) s.email = DEFAULT_NOTIFY_EMAIL;
  if (!s.alertDays) s.alertDays = 30;
  return s;
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// =========== Stats ===========
function renderStats() {
  const box = $("statsBox");
  const total = records.length;
  const byStatus = { overdue: 0, urgent: 0, soon: 0, ok: 0, suspended: 0 };
  let totalDue30 = 0;
  records.forEach(r => {
    const s = statusOf(r);
    byStatus[s] = (byStatus[s] || 0) + 1;
    if (s === "urgent" || s === "overdue") {
      totalDue30 += Number(r.amount) || 0;
    }
  });
  // Total active records (not suspended) for "all" count
  const activeTotal = total - byStatus.suspended;
  const suspendedHtml = byStatus.suspended > 0
    ? `<div class="stat-card" style="border-left-color: var(--gray);">
         <div class="stat-label">ยกเว้นเตือน</div>
         <div class="stat-value" style="color: var(--gray);">${byStatus.suspended}</div>
         <div class="stat-sub">ระงับการแจ้งเตือน</div>
       </div>`
    : "";
  box.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">รายการทั้งหมด</div>
      <div class="stat-value">${total}</div>
      <div class="stat-sub">รถ ${new Set(records.map(r => r.plate)).size} คัน${byStatus.suspended > 0 ? ` · ใช้งาน ${activeTotal}` : ""}</div>
    </div>
    <div class="stat-card danger">
      <div class="stat-label">เลยกำหนด</div>
      <div class="stat-value">${byStatus.overdue}</div>
      <div class="stat-sub">ต้องดำเนินการด่วน</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-label">ครบใน 30 วัน</div>
      <div class="stat-value">${byStatus.urgent}</div>
      <div class="stat-sub">ยอดรวม ${fmtMoney(totalDue30)}</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">ครบใน 31-90 วัน</div>
      <div class="stat-value">${byStatus.soon}</div>
      <div class="stat-sub">เตรียมตัวล่วงหน้า</div>
    </div>
    ${suspendedHtml}
  `;
}

// =========== Table Render ===========
function renderTable() {
  const tbody = $("tableBody");
  const empty = $("emptyState");

  let list = records.slice();

  // filter category
  if (currentFilter.cat !== "all") {
    list = list.filter(r => r.category === currentFilter.cat);
  }
  // filter status
  if (currentFilter.status !== "all") {
    list = list.filter(r => statusOf(r) === currentFilter.status);
  }
  // filter type
  if (currentFilter.type !== "all") {
    if (currentFilter.type === "ประกันภัย") {
      list = list.filter(r => (r.type || "").startsWith("ประกันภัย"));
    } else {
      list = list.filter(r => r.type === currentFilter.type);
    }
  }
  // search
  if (currentFilter.search) {
    const q = currentFilter.search.toLowerCase();
    list = list.filter(r =>
      (r.plate || "").toLowerCase().includes(q) ||
      (r.vehicle || "").toLowerCase().includes(q) ||
      (r.owner || "").toLowerCase().includes(q) ||
      (r.company || "").toLowerCase().includes(q) ||
      (r.handler || "").toLowerCase().includes(q) ||
      (r.notes || "").toLowerCase().includes(q)
    );
  }

  // sort by status urgency then by end date
  const order = { overdue: 0, urgent: 1, soon: 2, ok: 3 };
  list.sort((a, b) => {
    const sa = order[statusOf(a)] ?? 9;
    const sb = order[statusOf(b)] ?? 9;
    if (sa !== sb) return sa - sb;
    if (!a.end) return 1;
    if (!b.end) return -1;
    return a.end.localeCompare(b.end);
  });

  if (list.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = list.map(r => {
    const st = statusOf(r);
    const d = daysUntil(r.end);
    const remainText = d === null ? "—" :
      d < 0 ? `${Math.abs(d)} วันที่แล้ว` :
      d === 0 ? `วันนี้` :
      `${d} วัน`;
    const subLine = [r.vehicle, r.owner].filter(Boolean).join(" · ");
    const suspendedBadge = r.suspended ? `<span class="suspend-badge" title="ระงับการแจ้งเตือน">🔕 ยกเว้น</span>` : "";
    return `
      <tr data-id="${escapeHtml(r.id)}" class="${r.suspended ? 'row-suspended' : ''}">
        <td>
          <div class="plate">${escapeHtml(r.plate)} ${suspendedBadge}</div>
          ${subLine ? `<div style="font-size:12px; color:#6b7280; margin-top:4px;">${escapeHtml(subLine)}</div>` : ""}
        </td>
        <td>${typeBadge(r.type)}</td>
        <td>${escapeHtml(r.company || "—")}</td>
        <td style="font-weight:600; color:var(--navy);">${fmtMoney(r.amount)}</td>
        <td>${fmtDate(r.end)}</td>
        <td>${remainText}</td>
        <td><span class="status-pill status-${st}">${statusLabel[st]}</span></td>
        <td>${escapeHtml(r.handler || "—")}</td>
        <td>${r.category === "company" ? "บริษัท" : "ส่วนตัว"}</td>
        <td><button class="pdf-btn-cell" data-action="pdf-row" data-plate="${escapeHtml(r.plate)}" title="สร้าง PDF สำหรับคันนี้">📄</button></td>
        <td>
          <div class="actions-cell">
            <button class="icon-btn icon-suspend" data-action="toggle-suspend" title="${r.suspended ? 'เปิดเตือน' : 'ระงับเตือน'}">${r.suspended ? '🔔' : '🔕'}</button>
            <button class="icon-btn icon-renew" data-action="renew" title="ต่ออายุ">🔄</button>
            <button class="icon-btn icon-edit" data-action="edit" title="แก้ไข">✎</button>
            <button class="icon-btn icon-delete" data-action="delete" title="ลบ">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // attach action handlers
  tbody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();  // กันไม่ให้ trigger คลิกแถว
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') openModal(id);
      else if (action === 'delete') deleteRecord(id);
      else if (action === 'renew') openRenewModal(id);
      else if (action === 'toggle-suspend') toggleSuspend(id);
      else if (action === 'pdf-row') {
        const plate = btn.dataset.plate;
        generatePDFForPlates([plate]);
      }
    });
  });

  // แตะที่แถว (นอกปุ่ม) = เปิดดูรายละเอียด — สะดวกบนมือถือ
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openModal(tr.dataset.id);
    });
  });
}

// =========== File Attachments (Google Drive via Apps Script) ===========
// รูปจะเก็บใน Google Drive folder ที่กำหนดใน Apps Script
// metadata เก็บใน Google Sheets ทำให้ทุกเครื่องเห็นเหมือนกัน

async function uploadFileToServer(recordId, plate, file) {
  const settings = loadSettings();
  if (!settings.webhookUrl) {
    showToast("กรุณาตั้งค่า Web App URL ก่อน", "error");
    return null;
  }
  // Convert file to base64
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // strip "data:image/...;base64," prefix
      const result = reader.result;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  try {
    // Apps Script needs JSON response, use POST without no-cors so we can read response
    // But Apps Script Web Apps with text/plain trigger CORS preflight that we want to avoid
    // Use no-cors and rely on subsequent listFiles fetch
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "uploadFile",
        data: {
          recordId,
          plate,
          fileName: file.name,
          mimeType: file.type,
          dataBase64,
          uploadedBy: getCurrentUserName()
        },
        ts: Date.now()
      }),
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function listFilesFromServer(recordId) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return [];
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?")
      + "action=files&recordId=" + encodeURIComponent(recordId) + "&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const result = await res.json();
    return Array.isArray(result.data) ? result.data : [];
  } catch (e) {
    return [];
  }
}

async function deleteFileFromServer(fileId) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return false;
  try {
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "deleteFile", data: { id: fileId }, ts: Date.now() }),
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function renderFiles(rec) {
  const list = $("filesList");
  const badge = $("filesBadge");
  if (!rec || !rec.id) {
    list.innerHTML = "";
    badge.textContent = "0 ไฟล์";
    return;
  }
  list.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--gray); font-size:12px; padding:14px;">⏳ กำลังโหลดเอกสารจาก Google Drive...</div>`;
  badge.textContent = "—";

  const files = await listFilesFromServer(rec.id);
  badge.textContent = files.length + " ไฟล์";
  if (files.length === 0) {
    list.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--gray); font-size:12px; padding:14px;">ยังไม่มีเอกสารแนบ</div>`;
    return;
  }
  list.innerHTML = files.map(f => `
    <div class="file-thumb" data-id="${escapeHtml(f.id)}" data-url="${escapeHtml(f.url)}">
      <img src="${escapeHtml(f.thumbnail)}" alt="${escapeHtml(f.fileName)}" loading="lazy"
           onerror="this.src='${escapeHtml(f.url)}'">
      <button class="file-delete" data-action="del-file" data-id="${escapeHtml(f.id)}" title="ลบ">×</button>
      <div class="file-label">${escapeHtml(f.fileName)}</div>
    </div>
  `).join("");

  list.querySelectorAll(".file-thumb").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-action='del-file']")) return;
      const url = el.dataset.url;
      if (url) showImageViewer(url);
    });
  });
  list.querySelectorAll("[data-action='del-file']").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("ลบรูปนี้? (จะถูกย้ายไป Trash ใน Google Drive)")) return;
      btn.disabled = true;
      await deleteFileFromServer(btn.dataset.id);
      // Wait briefly for sheet update, then re-fetch
      await new Promise(r => setTimeout(r, 1500));
      const r = records.find(x => x.id === editingId);
      if (r) renderFiles(r);
      showToast("ลบรูปแล้ว");
    });
  });
}

function showImageViewer(src) {
  $("ivImage").src = src;
  $("imageViewer").classList.add("show");
}
function hideImageViewer() {
  $("imageViewer").classList.remove("show");
  $("ivImage").src = "";
}

async function handleFileUpload(files) {
  if (!editingId) {
    showToast("กรุณาบันทึกรายการก่อนแนบรูป", "error");
    return;
  }
  const rec = records.find(x => x.id === editingId);
  if (!rec) return;

  showToast(`กำลังอัปโหลด ${files.length} ไฟล์ไป Google Drive...`, "warning");

  let success = 0, failed = 0;
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      showToast(`${file.name} ใหญ่เกิน 10 MB`, "error");
      failed++;
      continue;
    }
    const ok = await uploadFileToServer(rec.id, rec.plate, file);
    if (ok) success++;
    else failed++;
  }
  if (success > 0) {
    showToast(`อัปโหลด ${success} ไฟล์สำเร็จ`);
    // Wait briefly for Google Sheets to reflect new files, then refresh
    await new Promise(r => setTimeout(r, 2000));
    renderFiles(rec);
  }
  if (failed > 0) {
    showToast(`อัปโหลดไม่สำเร็จ ${failed} ไฟล์`, "error");
  }
}


function calcRenewEnd(oldEnd, period) {
  // oldEnd: ISO date string. period: "6m" | "1y" | "2y"
  if (!oldEnd) return "";
  const d = new Date(oldEnd);
  if (isNaN(d.getTime())) return "";
  if (period === "6m") d.setMonth(d.getMonth() + 6);
  else if (period === "1y") d.setFullYear(d.getFullYear() + 1);
  else if (period === "2y") d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().slice(0, 10);
}

function openRenewModal(id) {
  const r = records.find(x => x.id === id);
  if (!r) {
    showToast("ไม่พบข้อมูลรายการนี้", "error");
    return;
  }
  renewingId = id;
  renewPeriod = "1y";
  isModalOpen = true;

  $("renewPlate").textContent = r.plate;
  const subParts = [r.vehicle, r.owner, r.type].filter(Boolean);
  $("renewType").textContent = subParts.join(" · ");

  // สรุปรอบปัจจุบัน (อ้างอิง — จะถูกเก็บเข้าประวัติเมื่อบันทึก)
  const oldStart = toDateInputValue(r.start);
  const oldEnd = toDateInputValue(r.end);
  $("renewOldDetail").innerHTML = [
    `📅 ${oldStart ? fmtDate(oldStart) : "—"} → ${oldEnd ? fmtDate(oldEnd) : "—"}`,
    `🏢 ${escapeHtml(r.company || "—")}`,
    `💰 ${fmtMoney(r.amount)}`,
  ].join("<br>");

  // รอบใหม่: วันเริ่มเว้นว่างให้กรอก — กรอกแล้ววันสิ้นสุดจะคำนวณให้ (1 ปี default)
  $("renewStart").value = "";
  $("renewNewEnd").value = "";
  $("renewCompany").value = r.company || "";   // ดึงค่าเดิมมาให้ แก้ได้
  $("renewAmount").value = r.amount || "";
  $("renewHandler").value = r.handler || "";
  $("renewNotes").value = "";

  // Reset period buttons เป็น 1 ปี
  document.querySelectorAll(".renew-period-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.period === "1y");
  });

  $("renewOverlay").classList.add("show");
  // โฟกัสช่องวันเริ่ม ให้กรอกได้เลย
  setTimeout(() => $("renewStart").focus(), 150);
}

function closeRenewModal() {
  $("renewOverlay").classList.remove("show");
  renewingId = null;
  isModalOpen = false;
}

function selectRenewPeriod(period) {
  renewPeriod = period;
  document.querySelectorAll(".renew-period-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.period === period);
  });
  // คำนวณวันสิ้นสุดจาก "วันเริ่มรอบใหม่" ที่ผู้ใช้กรอก
  recalcRenewEnd();
}

function recalcRenewEnd() {
  const start = $("renewStart").value;
  if (!start) return;  // ยังไม่กรอกวันเริ่ม — ไม่คำนวณ
  $("renewNewEnd").value = calcRenewEnd(start, renewPeriod);
}

function confirmRenew() {
  if (!renewingId) return;
  const idx = records.findIndex(r => r.id === renewingId);
  if (idx < 0) return;
  const r = records[idx];

  const newStart = $("renewStart").value;
  const newEnd = $("renewNewEnd").value;
  if (!newStart) {
    showToast("กรุณากรอกวันเริ่มต้นรอบใหม่", "error");
    $("renewStart").focus();
    return;
  }
  if (!newEnd) {
    showToast("กรุณาระบุวันสิ้นสุดรอบใหม่", "error");
    $("renewNewEnd").focus();
    return;
  }
  if (newEnd <= newStart) {
    showToast("วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น", "error");
    return;
  }
  const newAmount = parseFloat($("renewAmount").value) || 0;
  const newCompany = $("renewCompany").value.trim();
  const handler = $("renewHandler").value.trim();
  const notes = $("renewNotes").value.trim();
  const today = new Date().toISOString().slice(0, 10);

  // 📦 เก็บรอบปัจจุบันทั้งชุดเข้าประวัติ ก่อนเขียนทับ
  if (!Array.isArray(r.history)) r.history = [];
  r.history.push({
    archivedAt: today,
    start: toDateInputValue(r.start),
    end: toDateInputValue(r.end),
    amount: Number(r.amount) || 0,
    company: r.company || "",
    handler: r.handler || "",
    payStatus: r.payStatus || "",
    note: notes,                       // หมายเหตุของการต่อรอบนี้
    user: getCurrentUserName(),
  });

  // ✨ รอบใหม่ขึ้นแทน
  r.start = newStart;
  r.end = newEnd;
  r.prevPaid = r.currPaid || r.prevPaid;
  r.currPaid = today;
  r.amount = newAmount;
  if (newCompany) r.company = newCompany;
  if (handler) r.handler = handler;
  r.payStatus = "ชำระแล้ว";

  records[idx] = r;
  saveRecords();
  syncToSheets("upsert", r);
  logActivity("renew", `เพิ่มรอบใหม่ ${r.plate} (${r.type}) — ${fmtDate(newStart)} ถึง ${fmtDate(newEnd)}`, { plate: r.plate, type: r.type });
  closeRenewModal();
  renderAll();
  showToast(`✓ บันทึกรอบใหม่ ${r.plate} — ครบกำหนด ${fmtDate(r.end)} (รอบเก่าเก็บในประวัติแล้ว)`);
}

// Helper used here, will be defined fully later when adding multi-user
function getCurrentUserName() {
  const u = sessionStorage.getItem("bcf_user_name");
  return u || "ระบบ";
}

// Activity log
function logActivity(action, detail, extra) {
  // extra: { plate, type } optional structured fields for filtering
  const ts = new Date().toISOString();
  const id = ts + "_" + Math.random().toString(36).slice(2, 8);
  const entry = {
    id,
    timestamp: ts,
    user: getCurrentUserName(),
    action: action || "",
    plate: (extra && extra.plate) || "",
    type: (extra && extra.type) || "",
    detail: detail || "",
  };
  // Local cache (offline-friendly)
  try {
    const log = JSON.parse(localStorage.getItem("bcf_vt_log") || "[]");
    log.push(entry);
    if (log.length > 500) log.splice(0, log.length - 500);
    localStorage.setItem("bcf_vt_log", JSON.stringify(log));
  } catch (e) {}
  // Push to Google Sheets (fire-and-forget)
  pushLogToSheets(entry);
}

async function pushLogToSheets(entry) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return;
  try {
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "logEntry", data: entry, ts: Date.now() }),
    });
  } catch (e) {
    // Silent fail — entry remains in localStorage
  }
}

async function fetchLogsFromSheets(limit) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return null;
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?")
      + "action=logs&limit=" + (limit || 500) + "&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const result = await res.json();
    if (Array.isArray(result.data)) return result.data;
    return null;
  } catch (e) {
    return null;
  }
}

// =========== Server Settings (Master Switches) ===========
let _cachedNotifyEnabled = true;  // local cache, refreshed from server

async function fetchServerSettings() {
  const settings = loadSettings();
  if (!settings.webhookUrl) return null;
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?")
      + "action=settings&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const result = await res.json();
    return result.data || null;
  } catch (e) {
    return null;
  }
}

async function setServerSetting(key, value) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return false;
  try {
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "setSetting", data: { key, value: String(value) }, ts: Date.now() }),
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function loadNotifyEnabledFlag() {
  const data = await fetchServerSettings();
  if (data && data.notifications_enabled) {
    _cachedNotifyEnabled = String(data.notifications_enabled.value).toLowerCase() === "true";
  }
  return _cachedNotifyEnabled;
}

async function toggleMasterNotify() {
  const newValue = !_cachedNotifyEnabled;
  const ok = await setServerSetting("notifications_enabled", newValue ? "true" : "false");
  if (!ok) {
    showToast("เปลี่ยนการตั้งค่าไม่สำเร็จ", "error");
    return;
  }
  _cachedNotifyEnabled = newValue;
  logActivity(newValue ? "notify_on" : "notify_off",
    newValue ? "เปิดการแจ้งเตือนเมลทั้งระบบ" : "ปิดการแจ้งเตือนเมลทั้งระบบ");
  updateNotifySwitchUI();
  showToast(newValue ? "🔔 เปิดการแจ้งเตือนเมลแล้ว" : "🔕 ปิดการแจ้งเตือนเมลแล้ว — จะไม่ส่งเมลจนกว่าจะเปิดอีก", newValue ? "success" : "warning");
}

function updateNotifySwitchUI() {
  const toggle = document.getElementById("masterNotifyToggle");
  const label = document.getElementById("masterNotifyLabel");
  const desc = document.getElementById("masterNotifyDesc");
  if (!toggle) return;
  toggle.classList.toggle("on", _cachedNotifyEnabled);
  if (label) {
    label.textContent = _cachedNotifyEnabled ? "🔔 ส่งเมลแจ้งเตือน: เปิด" : "🔕 ส่งเมลแจ้งเตือน: ปิด";
    label.style.color = _cachedNotifyEnabled ? "var(--green)" : "var(--red)";
  }
  if (desc) {
    desc.textContent = _cachedNotifyEnabled
      ? "ระบบส่งเมลแจ้งเตือนตามปกติ (เลยกำหนดทุกวัน · ด่วน 15 วัน · ใกล้ครบ 30 วัน)"
      : "🚫 ปิดการส่งเมลทั้งระบบ — รถทุกคันจะไม่ได้รับการแจ้งเตือน จนกว่าจะกดเปิดอีกครั้ง";
  }
}


// =========== Backup & Restore ===========
async function fetchBackupList() {
  const settings = loadSettings();
  if (!settings.webhookUrl) return [];
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?")
      + "action=backups&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const result = await res.json();
    return Array.isArray(result.data) ? result.data : [];
  } catch (e) {
    return [];
  }
}

async function fetchBackupData(backupName) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return null;
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?")
      + "action=backupData&name=" + encodeURIComponent(backupName) + "&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const result = await res.json();
    return Array.isArray(result.data) ? result.data : null;
  } catch (e) {
    return null;
  }
}

async function triggerCreateBackup() {
  const settings = loadSettings();
  if (!settings.webhookUrl) {
    showToast("กรุณาตั้งค่า Web App URL", "error");
    return false;
  }
  try {
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "createBackup", ts: Date.now() }),
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function triggerRestoreBackup(backupName) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return false;
  try {
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "restoreBackup", data: { backupName }, ts: Date.now() }),
    });
    return true;
  } catch (e) {
    return false;
  }
}

let _selectedBackup = null;

async function openBackupModal() {
  $("backupOverlay").classList.add("show");
  isModalOpen = true;
  const list = $("backupList");
  list.innerHTML = `<div style="text-align:center; padding:30px; color:var(--gray);">⏳ กำลังโหลดรายการ backup...</div>`;
  $("backupPreview").innerHTML = "";
  $("backupRestoreBtn").disabled = true;
  _selectedBackup = null;

  const backups = await fetchBackupList();
  if (backups.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:30px; color:var(--gray);">
      <div style="font-size:32px; margin-bottom:10px;">📭</div>
      <div>ยังไม่มี backup</div>
      <div style="font-size:12px; margin-top:6px;">ระบบจะสร้าง backup อัตโนมัติทุกเที่ยงคืน หรือกดปุ่ม "สร้าง backup ทันที" ด้านล่าง</div>
    </div>`;
    return;
  }

  list.innerHTML = backups.map(b => {
    const d = new Date(b.date + "T00:00:00");
    const dateStr = d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
    const isToday = b.date === new Date().toISOString().slice(0, 10);
    return `
      <div class="backup-item" data-name="${escapeHtml(b.name)}" data-count="${b.recordCount}">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="backup-date-pill">
            <div style="font-size:18px; font-weight:700;">${d.getDate()}</div>
            <div style="font-size:10px; opacity:0.85;">${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getMonth()]}</div>
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; color:var(--navy); font-size:14px;">
              ${dateStr}
              ${isToday ? '<span style="font-size:11px; padding:2px 8px; border-radius:10px; background:var(--green); color:white; margin-left:6px;">วันนี้</span>' : ""}
            </div>
            <div style="font-size:12px; color:var(--gray); margin-top:2px;">
              ${b.recordCount} รายการ · บันทึกเมื่อ ${escapeHtml(b.createdAt)}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".backup-item").forEach(el => {
    el.addEventListener("click", () => selectBackup(el.dataset.name));
  });
}

async function selectBackup(name) {
  _selectedBackup = name;
  document.querySelectorAll(".backup-item").forEach(el => {
    el.classList.toggle("selected", el.dataset.name === name);
  });
  const preview = $("backupPreview");
  preview.innerHTML = `<div style="padding:14px; text-align:center; color:var(--gray);">⏳ โหลดข้อมูล...</div>`;
  $("backupRestoreBtn").disabled = true;

  const data = await fetchBackupData(name);
  if (!data) {
    preview.innerHTML = `<div style="padding:14px; text-align:center; color:var(--red);">โหลดไม่สำเร็จ</div>`;
    return;
  }

  // Compare with current
  const currentCount = records.length;
  const backupCount = data.length;
  const diff = backupCount - currentCount;
  const diffText = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "เท่ากัน";
  const diffColor = diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--gray)";

  // Group by category
  const byCategory = {};
  data.forEach(r => {
    const cat = r.category === "company" ? "บริษัท" : "ส่วนตัว";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  preview.innerHTML = `
    <div style="padding:14px; background:white; border-radius:10px;">
      <div style="font-weight:600; color:var(--navy); margin-bottom:10px;">ตัวอย่างข้อมูล Backup</div>
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px;">
        <div style="text-align:center; padding:10px; background:var(--ivory); border-radius:8px;">
          <div style="font-size:11px; color:var(--gray);">รายการใน backup</div>
          <div style="font-size:22px; font-weight:700; color:var(--navy);">${backupCount}</div>
        </div>
        <div style="text-align:center; padding:10px; background:var(--ivory); border-radius:8px;">
          <div style="font-size:11px; color:var(--gray);">รายการปัจจุบัน</div>
          <div style="font-size:22px; font-weight:700; color:var(--navy);">${currentCount}</div>
        </div>
        <div style="text-align:center; padding:10px; background:var(--ivory); border-radius:8px;">
          <div style="font-size:11px; color:var(--gray);">ผลต่าง</div>
          <div style="font-size:22px; font-weight:700; color:${diffColor};">${diffText}</div>
        </div>
      </div>
      <div style="font-size:13px; color:var(--gray);">
        ${Object.entries(byCategory).map(([k, v]) => `<span style="margin-right:14px;">📁 ${k}: <strong style="color:var(--navy);">${v}</strong></span>`).join("")}
      </div>
      ${diff !== 0 ? `<div style="font-size:12px; color:${diff < 0 ? 'var(--red)' : 'var(--amber)'}; margin-top:10px; padding:8px; background:${diff < 0 ? '#fef2f2' : '#fffbeb'}; border-radius:6px;">
        ⚠️ ${diff < 0 ? `กู้คืนจะทำให้ <strong>หาย ${Math.abs(diff)} รายการ</strong>` : `กู้คืนจะ <strong>เพิ่ม ${diff} รายการ</strong>`} จากปัจจุบัน
      </div>` : ""}
    </div>
  `;
  $("backupRestoreBtn").disabled = false;
}

function closeBackupModal() {
  $("backupOverlay").classList.remove("show");
  isModalOpen = false;
  _selectedBackup = null;
}

async function confirmRestore() {
  if (!_selectedBackup) return;
  const confirmed = confirm(
    `ยืนยันกู้คืนข้อมูลจาก backup:\n${_selectedBackup}\n\n` +
    `⚠️ ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด\n` +
    `(ระบบจะสร้าง safety backup ก่อนกู้คืน — กลับคืนได้)`
  );
  if (!confirmed) return;

  showToast("กำลังกู้คืน...", "warning");
  const ok = await triggerRestoreBackup(_selectedBackup);
  if (!ok) {
    showToast("กู้คืนไม่สำเร็จ", "error");
    return;
  }
  // Wait for sheet update, then re-fetch data
  await new Promise(r => setTimeout(r, 2500));
  await autoPullFromSheets();
  closeBackupModal();
  logActivity("restore", `กู้คืนข้อมูลจาก ${_selectedBackup}`);
  showToast(`กู้คืนเรียบร้อย — โหลด ${records.length} รายการ`);
}

async function manualBackup() {
  if (!confirm("สร้าง backup ทันที?\n(สามารถกู้คืนข้อมูลปัจจุบันได้ในอนาคต)")) return;
  showToast("กำลังสร้าง backup...", "warning");
  const ok = await triggerCreateBackup();
  if (ok) {
    await new Promise(r => setTimeout(r, 2000));
    showToast("สร้าง backup เรียบร้อย");
    openBackupModal(); // refresh list
  } else {
    showToast("สร้าง backup ไม่สำเร็จ", "error");
  }
}

// Cache logs in memory for filtering without re-fetching
let _cachedLogs = null;
let _logFilter = { user: "all", action: "all", plate: "", dateFrom: "", dateTo: "" };

async function openLogModal() {
  $("logOverlay").classList.add("show");
  isModalOpen = true;
  // Show loading state
  $("logList").innerHTML = `<div style="text-align:center; padding:30px; color:var(--gray);">⏳ กำลังโหลดประวัติจาก Google Sheets...</div>`;
  // Fetch from Sheets
  const remoteLogs = await fetchLogsFromSheets(500);
  if (remoteLogs !== null) {
    _cachedLogs = remoteLogs;
  } else {
    // Fallback to localStorage
    try {
      const local = JSON.parse(localStorage.getItem("bcf_vt_log") || "[]");
      // Local entries may use {ts, ...} or {timestamp, ...}; normalize
      _cachedLogs = local.map(e => ({
        id: e.id || (e.timestamp || e.ts) + "_local",
        timestamp: e.timestamp || e.ts || new Date().toISOString(),
        user: e.user || "",
        action: e.action || "",
        plate: e.plate || "",
        type: e.type || "",
        detail: e.detail || "",
      })).reverse(); // newest first
    } catch (e) {
      _cachedLogs = [];
    }
  }
  renderLogList();
}

function renderLogList() {
  const list = $("logList");
  if (!_cachedLogs) _cachedLogs = [];

  // Apply filters
  let filtered = _cachedLogs.slice();
  if (_logFilter.user !== "all") {
    filtered = filtered.filter(e => e.user === _logFilter.user);
  }
  if (_logFilter.action !== "all") {
    filtered = filtered.filter(e => e.action === _logFilter.action);
  }
  if (_logFilter.plate) {
    const q = _logFilter.plate.toLowerCase();
    filtered = filtered.filter(e =>
      (e.plate || "").toLowerCase().includes(q) ||
      (e.detail || "").toLowerCase().includes(q)
    );
  }
  if (_logFilter.dateFrom) {
    filtered = filtered.filter(e => (e.timestamp || "").slice(0, 10) >= _logFilter.dateFrom);
  }
  if (_logFilter.dateTo) {
    filtered = filtered.filter(e => (e.timestamp || "").slice(0, 10) <= _logFilter.dateTo);
  }

  // Update filter dropdowns with available users/actions
  populateLogFilters();

  // Render count
  $("logCount").textContent = `${filtered.length} รายการ` + (filtered.length !== _cachedLogs.length ? ` (จากทั้งหมด ${_cachedLogs.length})` : "");

  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:30px; color:var(--gray);">ไม่พบกิจกรรมตามตัวกรอง</div>`;
    return;
  }

  // Action labels
  const actionLabels = {
    renew: { icon: "🔄", text: "ต่ออายุ", color: "var(--green)" },
    edit: { icon: "✎", text: "แก้ไข", color: "var(--blue)" },
    add: { icon: "➕", text: "เพิ่ม", color: "var(--gold)" },
    delete: { icon: "🗑", text: "ลบ", color: "var(--red)" },
    login: { icon: "🔑", text: "ล็อกอิน", color: "var(--gray)" },
    logout: { icon: "⏻", text: "ออกจากระบบ", color: "var(--gray)" },
  };

  list.innerHTML = filtered.map(entry => {
    const t = new Date(entry.timestamp);
    const isValidDate = !isNaN(t.getTime());
    let dateStr = "—", timeStr = "";
    if (isValidDate) {
      dateStr = t.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
      timeStr = t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    const a = actionLabels[entry.action] || { icon: "•", text: entry.action || "—", color: "var(--gray)" };
    return `
      <div class="log-entry" style="padding:12px 14px; background:var(--ivory); border-radius:10px; border-left:3px solid ${a.color};">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:4px;">
          <div style="display:inline-flex; align-items:center; gap:6px;">
            <span style="font-size:14px;">${a.icon}</span>
            <span style="font-weight:600; color:${a.color}; font-size:13px;">${a.text}</span>
            ${entry.plate ? `<span style="font-family:'Noto Serif Thai',serif; font-weight:700; color:var(--navy); font-size:13px; margin-left:4px;">${escapeHtml(entry.plate)}</span>` : ""}
            ${entry.type ? `<span style="font-size:11px; color:var(--gray); padding:2px 8px; background:white; border-radius:8px;">${escapeHtml(entry.type)}</span>` : ""}
          </div>
          <div style="font-size:11px; color:var(--gray); white-space:nowrap;">
            <span style="font-weight:600;">${dateStr}</span> · ${timeStr}
          </div>
        </div>
        ${entry.detail ? `<div style="font-size:13px; color:#374151; margin-top:2px;">${escapeHtml(entry.detail)}</div>` : ""}
        <div style="font-size:11px; color:var(--gray); margin-top:4px;">โดย <strong>${escapeHtml(entry.user || "—")}</strong></div>
      </div>
    `;
  }).join("");
}

function populateLogFilters() {
  // User filter
  const users = new Set();
  const actions = new Set();
  (_cachedLogs || []).forEach(e => {
    if (e.user) users.add(e.user);
    if (e.action) actions.add(e.action);
  });

  const userSel = $("logFilterUser");
  const curUser = _logFilter.user;
  userSel.innerHTML = `<option value="all">ผู้ใช้ทั้งหมด</option>` +
    Array.from(users).sort().map(u => `<option value="${escapeHtml(u)}" ${u === curUser ? "selected" : ""}>${escapeHtml(u)}</option>`).join("");

  const actionSel = $("logFilterAction");
  const curAction = _logFilter.action;
  const actionLabels = { renew: "ต่ออายุ", edit: "แก้ไข", add: "เพิ่ม", delete: "ลบ", login: "ล็อกอิน", logout: "ออกจากระบบ" };
  actionSel.innerHTML = `<option value="all">การกระทำทั้งหมด</option>` +
    Array.from(actions).sort().map(a => `<option value="${escapeHtml(a)}" ${a === curAction ? "selected" : ""}>${actionLabels[a] || a}</option>`).join("");
}

function refreshLogs() {
  _cachedLogs = null;
  openLogModal();
}

function closeLogModal() {
  $("logOverlay").classList.remove("show");
  isModalOpen = false;
}

function clearLog() {
  if (!confirm("ล้างประวัติในเครื่องนี้?\n(ข้อมูลใน Google Sheets ไม่ถูกลบ)")) return;
  localStorage.removeItem("bcf_vt_log");
  showToast("ล้างประวัติในเครื่องแล้ว");
}

function exportLogsCSV() {
  if (!_cachedLogs || _cachedLogs.length === 0) {
    showToast("ไม่มีข้อมูลให้ส่งออก", "error");
    return;
  }
  const header = ["วันที่", "เวลา", "ผู้ใช้", "การกระทำ", "ทะเบียน", "ประเภท", "รายละเอียด"];
  const rows = _cachedLogs.map(e => {
    const t = new Date(e.timestamp);
    const date = isNaN(t.getTime()) ? "" : t.toLocaleDateString("th-TH");
    const time = isNaN(t.getTime()) ? "" : t.toLocaleTimeString("th-TH");
    return [date, time, e.user || "", e.action || "", e.plate || "", e.type || "", e.detail || ""];
  });
  const escape = v => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const csv = "\uFEFF" + [header, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity-log-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast("ส่งออก CSV เรียบร้อย");
}

// =========== Modal ===========
function openModal(id) {
  const overlay = $("modalOverlay");
  const title = $("modalTitle");
  if (id) {
    const r = records.find(x => x.id === id);
    if (!r) {
      // Record not found in local cache — likely id mismatch between sheets and local
      console.error("Record not found:", id, "Available IDs:", records.map(x => x.id).slice(0, 5));
      showToast("ไม่พบข้อมูลรายการนี้ กรุณาโหลดข้อมูลใหม่จาก Sheets (ดูใน ตั้งค่า)", "error");
      return;  // ไม่เปิด modal เลย
    }
    editingId = id;
    isModalOpen = true;
    title.textContent = "แก้ไขรายการ";
    $("f_category").value = r.category;
    $("f_plate").value = r.plate || "";
    $("f_vehicle").value = r.vehicle || "";
    $("f_owner").value = r.owner || "";
    $("f_type").value = r.type || "ต่อภาษี";
    $("f_company").value = r.company || "";
    $("f_start").value = toDateInputValue(r.start);
    $("f_end").value = toDateInputValue(r.end);
    $("f_amount").value = r.amount || "";
    $("f_month").value = r.month || "";
    $("f_prevPaid").value = toDateInputValue(r.prevPaid);
    $("f_currPaid").value = toDateInputValue(r.currPaid);
    $("f_handler").value = r.handler || "";
    $("f_payStatus").value = r.payStatus || "";
    $("f_notes").value = r.notes || "";
    renderHistory(r);
    renderFiles(r);
    renderSuspendSection(r);
  } else {
    editingId = null;
    isModalOpen = true;
    title.textContent = "เพิ่มรายการใหม่";
    $("recordForm").reset();
    $("f_category").value = "company";
    $("f_type").value = "ต่อภาษี";
    $("historySection").style.display = "none";
    $("suspendSection").style.display = "none";
    $("filesList").innerHTML = "";
    $("filesBadge").textContent = "0 ไฟล์";
  }
  overlay.classList.add("show");
}

function renderSuspendSection(rec) {
  const section = $("suspendSection");
  if (!rec || !rec.id) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  const isThisSuspended = rec.suspended === true;
  const allRecsForVehicle = records.filter(r => r.plate === rec.plate);
  const suspendedCount = allRecsForVehicle.filter(r => r.suspended).length;
  const totalCount = allRecsForVehicle.length;
  const isVehicleAllSuspended = totalCount > 0 && suspendedCount === totalCount;

  $("suspendThisLabel").textContent = isThisSuspended
    ? "🔔 เปิดเตือนรายการนี้"
    : "🔕 ระงับเฉพาะรายการนี้";

  $("suspendVehicleLabel").textContent = isVehicleAllSuspended
    ? `🔔 เปิดเตือนทั้งคัน (${rec.plate})`
    : `🔕 ระงับทั้งคัน (${rec.plate} · ${totalCount} รายการ)`;

  // Status message
  const msg = $("suspendStatusMsg");
  if (isVehicleAllSuspended) {
    msg.innerHTML = `<span style="color:var(--gray);">📊 รถคันนี้ถูกระงับทุกรายการ (${totalCount}/${totalCount})</span>`;
  } else if (suspendedCount > 0) {
    msg.innerHTML = `<span style="color:var(--gray);">📊 รถคันนี้ระงับ ${suspendedCount} จาก ${totalCount} รายการ</span>`;
  } else {
    msg.innerHTML = `<span style="color:var(--gray);">📊 รถคันนี้แจ้งเตือนปกติทุกรายการ</span>`;
  }
}

function renderHistory(rec) {
  const section = $("historySection");
  const list = $("historyList");
  const badge = $("historyBadge");
  const history = Array.isArray(rec.history) ? rec.history : [];

  if (history.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  badge.textContent = history.length + " รอบ";

  // รวมรอบปัจจุบัน + ประวัติ เป็น timeline เดียว (ใหม่สุดบน)
  const sortKey = h => h.archivedAt || h.date || "";
  const sorted = [...history].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  const rounds = [
    {
      isCurrent: true,
      start: toDateInputValue(rec.start),
      end: toDateInputValue(rec.end),
      amount: Number(rec.amount) || 0,
      company: rec.company || "",
      handler: rec.handler || "",
      user: "",
      note: "",
      when: "",
    },
    ...sorted.map(h => ({
      isCurrent: false,
      // รองรับทั้งรูปแบบใหม่ (start/end/company) และเก่า (oldEnd/newEnd/period)
      start: toDateInputValue(h.start || ""),
      end: toDateInputValue(h.end || h.oldEnd || h.newEnd || ""),
      amount: Number(h.amount) || 0,
      company: h.company || "",
      handler: h.handler || "",
      user: h.user || "",
      note: h.note || h.notes || "",
      when: h.archivedAt || h.date || "",
      legacyPeriod: h.period || "",
    })),
  ];

  list.innerHTML = rounds.map((rd, i) => {
    // เทียบราคากับรอบก่อนหน้า (ตัวถัดไปใน list = รอบเก่ากว่า)
    const prev = rounds[i + 1];
    let diffHtml = "";
    if (prev && rd.amount > 0 && prev.amount > 0) {
      const diff = rd.amount - prev.amount;
      if (Math.abs(diff) >= 0.01) {
        const up = diff > 0;
        diffHtml = `<span class="tl-diff ${up ? "tl-up" : "tl-down"}">${up ? "▲" : "▼"} ${up ? "+" : "−"}${fmtMoney(Math.abs(diff)).replace("฿", "")}</span>`;
      } else {
        diffHtml = `<span class="tl-diff tl-same">= เท่าเดิม</span>`;
      }
    }
    const range = rd.start && rd.end ? `${fmtDate(rd.start)} → ${fmtDate(rd.end)}`
                : rd.end ? `ถึง ${fmtDate(rd.end)}` : "—";
    const metaParts = [];
    if (rd.company) metaParts.push(`🏢 ${escapeHtml(rd.company)}`);
    if (rd.handler) metaParts.push(`👤 ${escapeHtml(rd.handler)}`);
    if (rd.user && rd.user !== "ระบบ" && rd.user !== rd.handler) metaParts.push(`บันทึกโดย ${escapeHtml(rd.user)}`);
    if (rd.when) metaParts.push(`เมื่อ ${fmtDate(rd.when)}`);

    return `
      <div class="tl-item ${rd.isCurrent ? "tl-current" : ""}">
        <div class="tl-marker">
          <div class="tl-dot"></div>
          ${i < rounds.length - 1 ? '<div class="tl-line"></div>' : ""}
        </div>
        <div class="tl-card">
          <div class="tl-head">
            <span class="tl-range">${range}</span>
            ${rd.isCurrent ? '<span class="tl-badge-current">รอบปัจจุบัน</span>' : ""}
          </div>
          <div class="tl-amount-row">
            <span class="tl-amount">${rd.amount > 0 ? fmtMoney(rd.amount) : "—"}</span>
            ${diffHtml}
          </div>
          ${metaParts.length ? `<div class="tl-meta">${metaParts.join(" · ")}</div>` : ""}
          ${rd.note ? `<div class="tl-note">💬 ${escapeHtml(rd.note)}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}
function closeModal() {
  $("modalOverlay").classList.remove("show");
  editingId = null;
  isModalOpen = false;
}
function saveRecord() {
  const data = {
    category: $("f_category").value,
    plate: $("f_plate").value.trim(),
    vehicle: $("f_vehicle").value.trim(),
    owner: $("f_owner").value.trim(),
    type: $("f_type").value,
    company: $("f_company").value.trim(),
    start: $("f_start").value,
    end: $("f_end").value,
    amount: parseFloat($("f_amount").value) || 0,
    month: $("f_month").value.trim(),
    prevPaid: $("f_prevPaid").value,
    currPaid: $("f_currPaid").value,
    handler: $("f_handler").value.trim(),
    payStatus: $("f_payStatus").value,
    notes: $("f_notes").value.trim(),
  };
  if (!data.plate || !data.end) {
    showToast("กรุณากรอกทะเบียนและวันที่สิ้นสุด", "error");
    return;
  }
  // ปุ่มบันทึกแสดงสถานะ
  const saveBtn = $("btnSave");
  const origText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "💾 กำลังบันทึก...";
  setTimeout(() => { saveBtn.disabled = false; saveBtn.textContent = origText; }, 1200);
  let recordToSync;
  if (editingId) {
    const idx = records.findIndex(r => r.id === editingId);
    if (idx >= 0) {
      // Merge existing record (id, suspended, history, etc) with form data
      records[idx] = { ...records[idx], ...data };
      recordToSync = records[idx];  // Has id and all preserved fields
    } else {
      // editingId set but record not found — fallback to new
      data.id = `${data.category[0]}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      records.push(data);
      recordToSync = data;
    }
    logActivity("edit", `แก้ไข ${data.plate} (${data.type})`, { plate: data.plate, type: data.type });
    showToast("บันทึกการแก้ไขแล้ว");
  } else {
    data.id = `${data.category[0]}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    records.push(data);
    recordToSync = data;
    logActivity("add", `เพิ่ม ${data.plate} (${data.type})`, { plate: data.plate, type: data.type });
    showToast("เพิ่มรายการใหม่แล้ว");
  }
  saveRecords();
  syncToSheets("upsert", recordToSync);
  closeModal();
  renderAll();
}
function deleteRecord(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`ยืนยันการลบ?\n\n${r.plate} — ${r.type}`)) return;
  records = records.filter(x => x.id !== id);
  saveRecords();
  syncToSheets("delete", { id });
  logActivity("delete", `ลบ ${r.plate} (${r.type})`, { plate: r.plate, type: r.type });
  showToast("ลบรายการแล้ว");
  renderAll();
}

// =========== Toast ===========
let toastTimer = null;
function showToast(msg, type = "success") {
  const t = $("toast");
  const icon = $("toastIcon");
  const m = $("toastMsg");
  m.textContent = msg;
  t.className = "toast " + (type === "error" ? "error" : type === "warning" ? "warning" : "");
  icon.textContent = type === "error" ? "✕" : type === "warning" ? "⚠" : "✓";
  t.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

// =========== CSV Export ===========
function exportCSV() {
  const header = ["หมวด","ทะเบียน","ประเภทรถ","เจ้าของ","ประเภท","บริษัท","วันเริ่ม","วันสิ้นสุด","ยอดเงิน","เดือน","วันจ่ายรอบก่อน","วันจ่ายปัจจุบัน","ผู้ดำเนินการ","สถานะชำระ","หมายเหตุ"];
  const rows = records.map(r => [
    r.category === "company" ? "บริษัท" : "ส่วนตัว",
    r.plate, r.vehicle || "", r.owner || "", r.type, r.company || "",
    r.start || "", r.end || "", r.amount || "", r.month || "",
    r.prevPaid || "", r.currPaid || "", r.handler || "", r.payStatus || "", r.notes || ""
  ]);
  const escape = v => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const csv = "\uFEFF" + [header, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().slice(0,10);
  a.download = `vehicle-tax-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast("ส่งออก CSV เรียบร้อย");
}

// =========== Google Sheets Sync (Apps Script Web App) ===========
function setSyncStatus(state, text) {
  const el = $("syncStatus");
  el.classList.remove("offline", "syncing", "pending");
  if (state === "offline") el.classList.add("offline");
  if (state === "syncing") el.classList.add("syncing");
  if (state === "pending") el.classList.add("pending");
  $("syncText").textContent = text;
}

// =========== Pending Sync Queue ===========
// ระบบคิวซิงค์: ทุกการเปลี่ยนแปลงเข้าคิวก่อน → ส่ง → ตรวจสอบกับ Sheets ว่าเข้าจริง
// → ลบออกจากคิวเมื่อยืนยันแล้วเท่านั้น ถ้าส่งไม่สำเร็จจะลองใหม่อัตโนมัติ ข้อมูลไม่หายเงียบๆ
const PENDING_KEY = "bcf_vt_pending_sync";

function loadPendingQueue() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; }
  catch (e) { return []; }
}
function savePendingQueue(q) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(q));
}
function pendingKeyOf(it) {
  return it.action + ":" + (it.data && it.data.id ? it.data.id : "x") + ":" + it.ts;
}
function enqueueSync(action, data) {
  let q = loadPendingQueue();
  // ถ้ามี upsert ของ record เดียวกันค้างอยู่ ให้แทนด้วยเวอร์ชันล่าสุด (กันซ้ำซ้อน)
  if (action === "upsert" && data && data.id) {
    q = q.filter(it => !(it.action === "upsert" && it.data && it.data.id === data.id));
  }
  q.push({ action, data, ts: new Date().toISOString(), attempts: 0 });
  savePendingQueue(q);
  updateSyncBadge();
}

let isFlushing = false;
async function flushSyncQueue() {
  if (isFlushing) return;
  const settings = loadSettings();
  if (!settings.webhookUrl) return;
  let q = loadPendingQueue();
  if (q.length === 0) { updateSyncBadge(); return; }

  isFlushing = true;
  setSyncStatus("syncing", `กำลังซิงค์ ${q.length} รายการ...`);
  try {
    // 1) ส่งทุกรายการในคิว
    for (const item of q) {
      try {
        await fetch(settings.webhookUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: item.action, data: item.data, ts: Date.now() }),
        });
      } catch (e) { /* network fail — จะลองใหม่รอบหน้า */ }
      item.attempts = (item.attempts || 0) + 1;
    }
    savePendingQueue(q);

    // 2) รอให้ Sheets เขียนเสร็จ แล้วตรวจสอบว่ารายการเข้าจริง
    await new Promise(r => setTimeout(r, 1800));
    const verified = await verifyPendingAgainstServer(q);

    // 3) ลบเฉพาะรายการที่ยืนยันแล้วออกจากคิว
    q = loadPendingQueue().filter(it => !verified.has(pendingKeyOf(it)));
    savePendingQueue(q);
  } finally {
    isFlushing = false;
    updateSyncBadge();
  }
}

async function verifyPendingAgainstServer(items) {
  const verified = new Set();
  const settings = loadSettings();
  if (!settings.webhookUrl) return verified;
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?")
      + "action=list&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return verified;
    const result = await res.json();
    const serverRecords = Array.isArray(result.data) ? result.data : [];
    const byId = {};
    serverRecords.forEach(r => { byId[r.id] = r; });

    items.forEach(it => {
      if (it.action === "upsert" && it.data && it.data.id) {
        const srv = byId[it.data.id];
        // ยืนยันเมื่อ: record อยู่บน server และ updated ใหม่กว่าเวลาเข้าคิว
        // (หรือส่งไปแล้ว 2+ ครั้งและ record มีอยู่ — กัน clock skew)
        if (srv && (String(srv.updated || "") >= it.ts || (it.attempts || 0) >= 2)) {
          verified.add(pendingKeyOf(it));
        }
      } else if (it.action === "delete" && it.data && it.data.id) {
        if (!byId[it.data.id]) verified.add(pendingKeyOf(it));
      } else {
        // action อื่น (logEntry ฯลฯ) — ถือว่าสำเร็จหลังส่ง 1 ครั้ง
        if ((it.attempts || 0) >= 1) verified.add(pendingKeyOf(it));
      }
    });
  } catch (e) { /* verify ไม่ได้ — คงคิวไว้ */ }
  return verified;
}

function updateSyncBadge() {
  const q = loadPendingQueue();
  if (q.length > 0) {
    setSyncStatus("pending", `⏳ รอซิงค์ ${q.length}`);
  } else {
    setSyncStatus("ok", "ซิงค์แล้ว");
  }
}

async function syncToSheets(action, data) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return;
  enqueueSync(action, data);
  flushSyncQueue();
}

async function pushAllToSheets() {
  const settings = loadSettings();
  if (!settings.webhookUrl) {
    showToast("กรุณาตั้งค่า Web App URL ก่อน", "error");
    return;
  }
  // Safety: เทียบจำนวนกับ server ก่อน — กันเขียนทับด้วยข้อมูลที่ขาดหาย
  let serverCount = null;
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?")
      + "action=list&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const result = await res.json();
      if (Array.isArray(result.data)) serverCount = result.data.length;
    }
  } catch (e) {}
  if (serverCount !== null && records.length < serverCount) {
    const missing = serverCount - records.length;
    const pct = Math.round((missing / serverCount) * 100);
    if (pct > 20) {
      if (!confirm(
        `⚠️ อันตราย!\n\nเครื่องนี้มี ${records.length} รายการ\nแต่ใน Google Sheets มี ${serverCount} รายการ\n\nการส่งขึ้นจะ "ลบ ${missing} รายการ (${pct}%)" ออกจาก Sheets!\n\nแน่ใจหรือไม่?`
      )) return;
      if (!confirm(`ยืนยันครั้งสุดท้าย: เขียนทับข้อมูลใน Google Sheets ด้วยข้อมูลของเครื่องนี้?\n\n(ระบบจะสร้าง backup ฝั่ง Sheets ก่อนเขียนทับ)`)) return;
    }
  }
  setSyncStatus("syncing", "กำลังอัปโหลด...");
  try {
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "replaceAll", data: records, ts: Date.now() }),
    });
    setSyncStatus("ok", "อัปโหลดแล้ว");
    showToast("ส่งข้อมูลทั้งหมดขึ้น Google Sheets แล้ว");
  } catch (e) {
    setSyncStatus("offline", "ออฟไลน์");
    showToast("เกิดข้อผิดพลาด: " + e.message, "error");
  }
}
// =========== Data Health Check ===========
async function runDataHealthCheck() {
  const settings = loadSettings();
  if (!settings.webhookUrl) {
    showToast("กรุณาตั้งค่า Web App URL ก่อน", "error");
    return;
  }
  if (!confirm(
    "🩺 ตรวจสุขภาพข้อมูลใน Google Sheets?\n\n" +
    "ระบบจะ:\n" +
    "• สร้าง backup ก่อนซ่อมเสมอ\n" +
    "• ลบแถวที่ไม่มีรหัส (ข้อมูลเสียจากบั๊กเดิม)\n" +
    "• รวมรายการรหัสซ้ำ (เก็บตัวล่าสุด)"
  )) return;

  showToast("🩺 กำลังตรวจสุขภาพข้อมูล...", "warning");
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?")
      + "action=healthcheck&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const result = await res.json();
    const r = result.data || {};
    const fixed = (r.removedEmptyId || 0) + (r.removedDuplicates || 0);
    logActivity("healthcheck", `ตรวจสุขภาพข้อมูล: ลบแถวเสีย ${r.removedEmptyId || 0}, รวมซ้ำ ${r.removedDuplicates || 0}`);
    if (fixed > 0) {
      alert(
        `🩺 ผลตรวจสุขภาพข้อมูล\n\n` +
        `รายการก่อนซ่อม: ${r.totalBefore}\n` +
        `ลบแถวไม่มีรหัส: ${r.removedEmptyId}\n` +
        `รวมรายการซ้ำ: ${r.removedDuplicates}\n` +
        `รายการหลังซ่อม: ${r.totalAfter}\n\n` +
        `✅ Backup ก่อนซ่อม: ${r.backup || "-"}\n` +
        `กำลังโหลดข้อมูลที่ซ่อมแล้ว...`
      );
      // ดึงข้อมูลที่ซ่อมแล้วมาใช้
      await autoPullFromSheets();
      renderAll();
      showToast(`✅ ซ่อมข้อมูลแล้ว ${fixed} จุด — โหลดใหม่เรียบร้อย`);
    } else {
      showToast(`✅ ข้อมูลสมบูรณ์ดี (${r.totalAfter} รายการ) ไม่พบปัญหา`);
    }
  } catch (e) {
    showToast("ตรวจไม่สำเร็จ: " + e.message, "error");
  }
}

async function pullFromSheets() {
  const settings = loadSettings();
  if (!settings.webhookUrl) {
    showToast("กรุณาตั้งค่า Web App URL ก่อน", "error");
    return;
  }
  setSyncStatus("syncing", "กำลังดึง...");
  try {
    // GET request to fetch data
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?") + "action=list";
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const result = await res.json();
    if (Array.isArray(result.data)) {
      if (!confirm(`พบ ${result.data.length} รายการบน Google Sheets\nจะแทนที่ข้อมูลในเครื่องทั้งหมด ต่อไปหรือไม่?`)) {
        setSyncStatus("ok", "ยกเลิก");
        return;
      }
      records = result.data;
      saveRecords();
      renderAll();
      setSyncStatus("ok", "ดึงสำเร็จ");
      showToast(`ดึงข้อมูล ${result.data.length} รายการแล้ว`);
    } else {
      throw new Error("รูปแบบข้อมูลไม่ถูกต้อง");
    }
  } catch (e) {
    setSyncStatus("offline", "ออฟไลน์");
    showToast("ดึงไม่สำเร็จ: " + e.message, "error");
  }
}

// Auto-sync: ดึงข้อมูลแบบเงียบ ไม่ถามยืนยัน ไม่ขัดจังหวะการใช้งาน
async function autoPullFromSheets() {
  const settings = loadSettings();
  if (!settings.webhookUrl) return;
  if (isSyncing) return;          // ป้องกัน concurrent sync
  if (isModalOpen) return;         // ไม่ดึงตอนผู้ใช้กำลังแก้ไข
  if (document.hidden) return;     // ไม่ดึงตอนผู้ใช้ไม่ได้เปิดแท็บนี้
  // ⚠️ สำคัญ: ถ้ามีรายการรอซิงค์ ห้ามดึงมาทับ — ส่งของค้างขึ้นไปก่อน
  if (loadPendingQueue().length > 0) {
    flushSyncQueue();
    return;
  }
  
  isSyncing = true;
  setSyncStatus("syncing", "กำลังซิงค์...");
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?") + "action=list&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const result = await res.json();
    if (Array.isArray(result.data)) {
      // ⚠️ Safety: ถ้า server คืนค่าว่างแต่เครื่องมีข้อมูล — ไม่ทับ (อาจเป็น error ฝั่ง Sheets)
      if (result.data.length === 0 && records.length > 0) {
        setSyncStatus("offline", "Sheets ว่างเปล่า — ไม่ดึงทับ");
        return;
      }
      // เปรียบเทียบกับข้อมูลปัจจุบัน — อัปเดตเฉพาะที่เปลี่ยน
      // Merge: ถ้า server ยังไม่มีประวัติแต่เครื่องมี — เก็บของเครื่องไว้และส่งขึ้นไป
      const localById = {};
      records.forEach(r => { localById[r.id] = r; });
      result.data.forEach(srv => {
        const loc = localById[srv.id];
        if (loc && Array.isArray(loc.history) && loc.history.length > 0 &&
            (!Array.isArray(srv.history) || srv.history.length === 0)) {
          srv.history = loc.history;
          enqueueSync("upsert", srv);  // ส่งประวัติขึ้น Sheets
        }
      });
      const newJson = JSON.stringify(result.data);
      const oldJson = JSON.stringify(records);
      if (newJson !== oldJson) {
        records = result.data;
        saveRecords();
        renderAll();
        showToast(`อัปเดตข้อมูลล่าสุด (${result.data.length} รายการ)`, "success");
      }
      lastSyncTime = Date.now();
      const time = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
      setSyncStatus("ok", "ซิงค์ล่าสุด " + time);
    }
  } catch (e) {
    setSyncStatus("offline", "ออฟไลน์");
  } finally {
    isSyncing = false;
  }
}

function startAutoSync() {
  stopAutoSync();
  const settings = loadSettings();
  if (!settings.webhookUrl) return;
  // ส่งคิวที่ค้างจาก session ก่อน (ถ้ามี) แล้วค่อยดึง
  if (loadPendingQueue().length > 0) {
    flushSyncQueue();
  } else {
    autoPullFromSheets();
  }
  // ตั้ง interval
  autoSyncTimer = setInterval(autoPullFromSheets, AUTO_SYNC_INTERVAL);
  // กลับมา online → ส่งคิวค้างทันที
  window.addEventListener("online", () => flushSyncQueue());
}

function stopAutoSync() {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
}
async function testSync() {
  const settings = loadSettings();
  if (!settings.webhookUrl) {
    showToast("กรุณาบันทึก URL ก่อน", "error");
    return;
  }
  setSyncStatus("syncing", "กำลังทดสอบ...");
  try {
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "ping", ts: Date.now() }),
    });
    setSyncStatus("ok", "เชื่อมต่อสำเร็จ");
    showToast("ส่งคำขอทดสอบแล้ว — ตรวจสอบ Google Sheets");
  } catch (e) {
    setSyncStatus("offline", "ออฟไลน์");
    showToast("เชื่อมต่อไม่ได้: " + e.message, "error");
  }
}

// =========== Settings Modal ===========
function openSettings() {
  isModalOpen = true;
  const s = loadSettings();
  $("s_webhookUrl").value = s.webhookUrl || "";
  $("s_email").value = s.email || "";
  $("s_alertDays").value = s.alertDays || 30;
  $("recordCount").textContent = records.length;
  $("settingsOverlay").classList.add("show");
  // Refresh master notify status from server
  loadNotifyEnabledFlag().then(() => updateNotifySwitchUI());
}
function closeSettings() {
  $("settingsOverlay").classList.remove("show");
  isModalOpen = false;
}
function saveSettingsForm() {
  const s = {
    webhookUrl: $("s_webhookUrl").value.trim(),
    email: $("s_email").value.trim(),
    alertDays: parseInt($("s_alertDays").value) || 30,
  };
  saveSettings(s);
  showToast("บันทึกการตั้งค่าแล้ว");
  closeSettings();
  if (s.webhookUrl) {
    setSyncStatus("ok", "พร้อมใช้งาน");
    startAutoSync();
  } else {
    setSyncStatus("offline", "ออฟไลน์");
    stopAutoSync();
  }
}
function resetData() {
  if (!confirm("รีเซ็ตข้อมูลทั้งหมดในเครื่อง?\n(ข้อมูลบน Google Sheets ไม่ถูกลบ)")) return;
  if (!confirm("ยืนยันอีกครั้ง — การกระทำนี้ไม่สามารถย้อนกลับได้")) return;
  localStorage.removeItem(STORAGE_KEY);
  loadRecords();
  closeSettings();
  renderAll();
  showToast("รีเซ็ตข้อมูลเรียบร้อย");
}

// =========== Logout ===========
function logout() {
  if (!confirm("ออกจากระบบ?")) return;
  logActivity("logout", `${getCurrentUserName()} ออกจากระบบ`);
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem("bcf_user_name");
  sessionStorage.removeItem("bcf_vt_logged_in");
  window.location.href = "login.html";
}

// =========== Monthly Summary ===========
// Document checklist by type and vehicle category
function getDocumentsForRecord(rec) {
  const docs = [];
  const vehicle = (rec.vehicle || "").toLowerCase();
  const isMotorcycle = vehicle.includes("มอเตอร์ไซ") || vehicle.includes("มอเตอร์ไซด์") || vehicle.includes("motorcycle");
  const isTruck = vehicle.includes("6 ล้อ") || vehicle.includes("สิบล้อ") || vehicle.includes("ห้องเย็น") || vehicle.includes("ตู้เย็น");

  if (rec.type === "ต่อภาษี") {
    docs.push("เล่มทะเบียนรถ (สมุดสีฟ้า)");
    docs.push("สำเนาบัตรประชาชนเจ้าของรถ");
    docs.push("กรมธรรม์ พ.ร.บ. ที่ยังไม่หมดอายุ");
    if (!isMotorcycle) {
      docs.push("ใบรับรองตรวจสภาพรถ (ตรอ.) — รถอายุเกิน 7 ปี");
    } else {
      docs.push("ใบรับรองตรวจสภาพรถ (ตรอ.) — มอเตอร์ไซค์อายุเกิน 5 ปี");
    }
    if (isTruck) {
      docs.push("ใบรับรองตรวจสภาพรถ (ตรอ.) — รถบรรทุกตรวจทุกปี");
      docs.push("ใบ GPS ติดตามรถ (สำหรับรถบรรทุก)");
    }
  } else if ((rec.type || "").startsWith("ประกันภัย")) {
    docs.push("กรมธรรม์ประกันภัยฉบับเดิม");
    docs.push("สำเนาทะเบียนรถ");
    docs.push("สำเนาบัตรประชาชนผู้เอาประกัน");
    docs.push("รูปถ่ายรอบคันรถ (4 มุม)");
    docs.push("เลขไมล์ปัจจุบัน");
  } else if (rec.type === "พ.ร.บ.") {
    docs.push("เล่มทะเบียนรถ หรือสำเนา");
    docs.push("สำเนาบัตรประชาชนเจ้าของรถ");
    docs.push("กรมธรรม์ พ.ร.บ. ฉบับเดิม (ถ้ามี)");
  }
  return docs;
}

function getChecklistKey(year, month, vehiclePlate, docName) {
  // Stable storage key for checking off items
  return `bcf_chk_${year}_${month}_${vehiclePlate}_${docName}`.replace(/\s+/g, "_");
}

function isDocChecked(year, month, plate, doc) {
  return localStorage.getItem(getChecklistKey(year, month, plate, doc)) === "1";
}

function setDocChecked(year, month, plate, doc, checked) {
  const key = getChecklistKey(year, month, plate, doc);
  if (checked) localStorage.setItem(key, "1");
  else localStorage.removeItem(key);
}


function getCurrentMsMonth() {
  if (msMonth) return msMonth;
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() };
}

function setMsMonth(year, month) {
  // Normalize month overflow (e.g., month=12 → next year jan)
  const d = new Date(year, month, 1);
  msMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderMonthlySummary();
}

function renderMsSelect() {
  // Build the select options: 12 months back to 24 months forward = 36 months
  const sel = $("ms_select");
  const today = new Date();
  const cur = getCurrentMsMonth();
  const opts = [];
  for (let offset = -12; offset <= 24; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const label = THAI_MONTHS[m] + " " + (y + 543);
    const value = `${y}-${m}`;
    const isCurrent = (y === cur.year && m === cur.month);
    opts.push(`<option value="${value}" ${isCurrent ? "selected" : ""}>${label}</option>`);
  }
  sel.innerHTML = opts.join("");
}

function getRecordsForMonth(year, month) {
  return records.filter(r => {
    if (!r.end) return false;
    const d = new Date(r.end);
    if (isNaN(d.getTime())) return false;
    return d.getFullYear() === year && d.getMonth() === month;
  }).sort((a, b) => {
    const da = new Date(a.end);
    const db = new Date(b.end);
    return da - db;
  });
}

function renderMonthlySummary() {
  const cur = getCurrentMsMonth();
  const monthRecs = getRecordsForMonth(cur.year, cur.month);

  // Update select & header
  renderMsSelect();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === cur.year && today.getMonth() === cur.month;
  $("ms_monthName").textContent = THAI_MONTHS[cur.month] + " " + (cur.year + 543) + (isCurrentMonth ? "  (เดือนนี้)" : "");

  // Summary stats
  const total = monthRecs.length;
  const totalAmt = monthRecs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  let taxCnt = 0, insCnt = 0, prbCnt = 0;
  monthRecs.forEach(r => {
    if (r.type === "ต่อภาษี") taxCnt++;
    else if ((r.type || "").startsWith("ประกันภัย")) insCnt++;
    else if (r.type === "พ.ร.บ.") prbCnt++;
  });
  $("ms_totalCount").textContent = total;
  $("ms_totalAmount").textContent = fmtMoney(totalAmt);
  $("ms_taxCount").textContent = taxCnt;
  $("ms_insCount").textContent = insCnt;
  $("ms_prbCount").textContent = prbCnt;

  const list = $("ms_list");
  if (monthRecs.length === 0) {
    list.innerHTML = `<div class="ms-empty"><div class="big">📭</div><div>ไม่มีรายการต้องจ่ายในเดือนนี้</div></div>`;
    return;
  }

  // Group records by plate
  const byPlate = {};
  monthRecs.forEach(r => {
    if (!byPlate[r.plate]) {
      byPlate[r.plate] = { plate: r.plate, records: [], vehicle: "", owner: "", category: r.category, totalAmount: 0, hasOverdue: false, hasUrgent: false, earliestDate: null };
    }
    const grp = byPlate[r.plate];
    grp.records.push(r);
    grp.totalAmount += Number(r.amount) || 0;
    if (r.vehicle && !grp.vehicle) grp.vehicle = r.vehicle;
    if (r.owner && !grp.owner) grp.owner = r.owner;
    const status = statusOf(r);
    if (status === "overdue") grp.hasOverdue = true;
    if (status === "urgent") grp.hasUrgent = true;
    const ed = new Date(r.end);
    if (grp.earliestDate === null || ed < grp.earliestDate) grp.earliestDate = ed;
  });

  // Sort by earliest date
  const groups = Object.values(byPlate).sort((a, b) => a.earliestDate - b.earliestDate);

  list.innerHTML = groups.map(grp => {
    const cardCls = grp.hasOverdue ? "has-overdue" : grp.hasUrgent ? "has-urgent" : "";
    const catCls = grp.category === "personal" ? "personal" : "";
    const catLabel = grp.category === "company" ? "บริษัท" : "ส่วนตัว";
    const subParts = [grp.vehicle, grp.owner].filter(Boolean);
    const meta = subParts.join(" · ");

    // Records as items
    const itemsHtml = grp.records.sort((a, b) => new Date(a.end) - new Date(b.end)).map(r => {
      const d = new Date(r.end);
      const day = d.getDate();
      const monthAbbr = THAI_MONTHS_SHORT[d.getMonth()];
      const status = statusOf(r);
      const itemCls = status === "overdue" ? "overdue" : status === "urgent" ? "urgent" : "";
      const statusText = status === "overdue" ? "เลยกำหนด" : status === "urgent" ? "ด่วน" : status === "soon" ? "ใกล้ครบ" : "ปกติ";
      return `
        <div class="ms-vc-item ${itemCls}" data-id="${escapeHtml(r.id)}">
          <div class="vi-day">
            <span class="vi-day-num">${day}</span>
            <span style="font-size:10px;">${monthAbbr}</span>
          </div>
          <div class="vi-type">
            <div>${escapeHtml(r.type)}</div>
            <div class="vi-status">${escapeHtml(r.handler ? ("ผู้ดำเนินการ: " + r.handler) : "ยังไม่ระบุผู้ดำเนินการ")}</div>
          </div>
          <div class="vi-company">${escapeHtml(r.company || "—")}</div>
          <div class="vi-amount">${fmtMoney(r.amount)}</div>
          <div class="vi-status-pill"><span class="pill ${status}">${statusText}</span></div>
        </div>
      `;
    }).join("");

    // Build unique checklist for this vehicle (combining all docs from all records)
    const docSet = new Set();
    grp.records.forEach(r => {
      getDocumentsForRecord(r).forEach(doc => docSet.add(doc));
    });
    const docs = Array.from(docSet);
    const checklistHtml = docs.map((doc, i) => {
      const checked = isDocChecked(cur.year, cur.month, grp.plate, doc);
      return `
        <div class="ms-vc-check-item ${checked ? "checked" : ""}">
          <input type="checkbox" id="chk-${escapeHtml(grp.plate)}-${i}" ${checked ? "checked" : ""}
                 data-plate="${escapeHtml(grp.plate)}" data-doc="${escapeHtml(doc)}">
          <label for="chk-${escapeHtml(grp.plate)}-${i}">${escapeHtml(doc)}</label>
        </div>
      `;
    }).join("");

    return `
      <div class="ms-vehicle-card ${cardCls}" data-plate="${escapeHtml(grp.plate)}">
        <div class="ms-vc-header">
          <div class="ms-vc-title">
            <div class="ms-vc-plate">
              ${escapeHtml(grp.plate)}
              <span class="cat-pill ${catCls}">${catLabel}</span>
            </div>
            ${meta ? `<div class="ms-vc-meta">${escapeHtml(meta)}</div>` : ""}
          </div>
          <div class="ms-vc-actions">
            <div class="ms-vc-total">
              <div class="ms-vc-total-label">รวม ${grp.records.length} รายการ</div>
              <div class="ms-vc-total-amount">${fmtMoney(grp.totalAmount)}</div>
            </div>
            <button class="ms-vc-pdf" data-action="ms-vc-pdf" data-plate="${escapeHtml(grp.plate)}" title="สร้าง PDF สำหรับคันนี้">📄</button>
          </div>
        </div>

        <div class="ms-vc-items">${itemsHtml}</div>

        ${docs.length > 0 ? `
          <div class="ms-vc-checklist">
            <div class="ms-vc-checklist-title">
              <span class="icon">📋</span>
              <span>เอกสารที่ต้องเตรียม</span>
            </div>
            <div class="ms-vc-checklist-list">${checklistHtml}</div>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  // Click handlers
  list.querySelectorAll(".ms-vc-item").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      switchPage("records");
      setTimeout(() => openModal(id), 300);
    });
  });
  list.querySelectorAll("[data-action='ms-vc-pdf']").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const plate = btn.dataset.plate;
      generatePDFForPlates([plate]);
    });
  });
  list.querySelectorAll(".ms-vc-check-item input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", e => {
      e.stopPropagation();
      const plate = cb.dataset.plate;
      const doc = cb.dataset.doc;
      setDocChecked(cur.year, cur.month, plate, doc, cb.checked);
      cb.closest(".ms-vc-check-item").classList.toggle("checked", cb.checked);
    });
    cb.addEventListener("click", e => e.stopPropagation());
  });
}

async function generateMonthlyChecklistPDF() {
  if (typeof window.jspdf === "undefined") {
    showToast("กำลังโหลดไลบรารี กรุณาลองใหม่...", "warning");
    return;
  }
  const cur = getCurrentMsMonth();
  const monthRecs = getRecordsForMonth(cur.year, cur.month);
  if (monthRecs.length === 0) {
    showToast("ไม่มีรายการในเดือนนี้", "error");
    return;
  }

  // Group by plate
  const byPlate = {};
  monthRecs.forEach(r => {
    if (!byPlate[r.plate]) {
      byPlate[r.plate] = { plate: r.plate, records: [], vehicle: "", owner: "", category: r.category, totalAmount: 0 };
    }
    const grp = byPlate[r.plate];
    grp.records.push(r);
    grp.totalAmount += Number(r.amount) || 0;
    if (r.vehicle && !grp.vehicle) grp.vehicle = r.vehicle;
    if (r.owner && !grp.owner) grp.owner = r.owner;
  });
  const groups = Object.values(byPlate).sort((a, b) => {
    const ea = Math.min(...a.records.map(r => new Date(r.end).getTime()));
    const eb = Math.min(...b.records.map(r => new Date(r.end).getTime()));
    return ea - eb;
  });

  const { jsPDF } = window.jspdf;
  showToast("กำลังสร้างใบเตรียมเอกสาร...", "warning");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  loadSarabunFontInPdf(doc);

  // Header
  doc.setFillColor(10, 31, 68);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setTextColor(255);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(15);
  doc.text("ใบเตรียมเอกสาร — ภาษีรถยนต์", 14, 9, { baseline: "top" });
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(11);
  doc.setTextColor(201, 169, 97);
  doc.text(`ประจำเดือน: ${THAI_MONTHS[cur.month]} ${cur.year + 543}`, 14, 17, { baseline: "top" });
  doc.setFontSize(8);
  doc.setTextColor(220);
  doc.text(`สร้างเมื่อ: ${new Date().toLocaleString("th-TH")}  ·  Black Chicken Farm`, 14, 25, { baseline: "top" });

  // Summary stats box
  let y = 40;
  const totalAll = monthRecs.length;
  const amtAll = monthRecs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  doc.setDrawColor(230);
  doc.setFillColor(247, 244, 236);
  doc.roundedRect(14, y, pageW - 28, 16, 2, 2, "FD");
  doc.setTextColor(10, 31, 68);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(10);
  doc.text(`รถ ${groups.length} คัน  ·  รายการที่ต้องดำเนินการ ${totalAll} รายการ  ·  ยอดรวมประมาณ ${fmtMoney(amtAll)}`, pageW / 2, y + 10, { align: "center" });
  y += 24;

  // Per-vehicle sections
  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    const recs = grp.records.sort((a, b) => new Date(a.end) - new Date(b.end));

    // Estimate height needed
    const docSet = new Set();
    recs.forEach(r => getDocumentsForRecord(r).forEach(d => docSet.add(d)));
    const docs = Array.from(docSet);
    const estHeight = 30 + recs.length * 6 + Math.ceil(docs.length / 2) * 6 + 14;

    if (y + estHeight > pageH - 20) {
      doc.addPage();
      y = 20;
    }

    // Vehicle header bar
    doc.setFillColor(10, 31, 68);
    doc.roundedRect(14, y, pageW - 28, 11, 2, 2, "F");
    doc.setTextColor(255);
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(11);
    const catLabel = grp.category === "company" ? "[บริษัท]" : "[ส่วนตัว]";
    doc.text(`${grp.plate}  ${catLabel}`, 18, y + 4, { baseline: "top" });
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(201, 169, 97);
    const sub = [grp.vehicle, grp.owner].filter(Boolean).join(" · ");
    if (sub) {
      doc.text(sub, pageW - 18, y + 4, { baseline: "top", align: "right" });
    }
    y += 13;

    // List records to do
    doc.setTextColor(60);
    doc.setFontSize(9);
    doc.setFont("Sarabun", "bold");
    doc.text("รายการที่ต้องดำเนินการ:", 18, y, { baseline: "top" });
    y += 5;
    doc.setFont("Sarabun", "normal");
    recs.forEach(r => {
      const d = new Date(r.end);
      const day = d.getDate();
      const dueStr = `${day} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
      const amt = Number(r.amount) > 0 ? fmtMoney(r.amount) : "—";
      doc.setTextColor(60);
      doc.text(`•  ${r.type}`, 22, y, { baseline: "top" });
      doc.text(`ครบ: ${dueStr}`, 88, y, { baseline: "top" });
      doc.text(`${r.company || "—"}`, 128, y, { baseline: "top" });
      doc.setFont("Sarabun", "bold");
      doc.text(amt, pageW - 18, y, { baseline: "top", align: "right" });
      doc.setFont("Sarabun", "normal");
      y += 5.5;
    });

    y += 2;

    // Documents checklist
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(9);
    doc.setTextColor(10, 31, 68);
    doc.text("เอกสารที่ต้องเตรียม:", 18, y, { baseline: "top" });
    y += 5;
    doc.setFont("Sarabun", "normal");
    doc.setTextColor(60);
    // 2-column checklist
    const colWidth = (pageW - 36) / 2;
    let col = 0;
    let rowY = y;
    docs.forEach((d) => {
      const x = 22 + col * colWidth;
      // Draw checkbox
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.rect(x, rowY + 0.5, 3, 3);
      // Doc text
      doc.text(d, x + 5, rowY, { baseline: "top" });
      col++;
      if (col >= 2) {
        col = 0;
        rowY += 6;
      }
    });
    if (col > 0) rowY += 6;
    y = rowY + 4;

    // Notes line
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(18, y, pageW - 18, y);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("หมายเหตุ / ผู้ดำเนินการ: _________________________________", 18, y + 4, { baseline: "top" });
    y += 12;
  }

  // Page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`หน้า ${i} / ${pageCount}`, pageW - 20, pageH - 8, { align: "right" });
    doc.text(`Black Chicken Farm — Sukmart Holding`, 20, pageH - 8);
  }

  const ts = new Date().toISOString().slice(0, 10);
  const monthName = THAI_MONTHS[cur.month] + "-" + (cur.year + 543);
  doc.save(`checklist-${monthName}-${ts}.pdf`);
  showToast(`สร้างใบเตรียมเอกสารเรียบร้อย (${groups.length} คัน)`);
}


function renderDashboard() {
  if (currentPage !== "dashboard") return;

  // Render monthly summary first
  renderMonthlySummary();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisYear = today.getFullYear();

  // Top stat cards
  const uniquePlates = new Set(records.map(r => r.plate));
  $("d_totalVehicles").textContent = uniquePlates.size;
  $("d_totalRecords").textContent = records.length + " รายการ";

  const buckets = { overdue: 0, urgent: 0, soon: 0, ok: 0 };
  let urgentAmt = 0;
  let yearAmt = 0;
  let yearCount = 0;

  records.forEach(r => {
    const s = statusOf(r);
    buckets[s]++;
    if (s === "urgent" || s === "overdue") {
      urgentAmt += Number(r.amount) || 0;
    }
    // ค่าใช้จ่ายปีนี้ (วันสิ้นสุดอยู่ในปีนี้)
    if (r.end) {
      const ed = new Date(r.end);
      if (!isNaN(ed.getTime()) && ed.getFullYear() === thisYear) {
        yearAmt += Number(r.amount) || 0;
        if (Number(r.amount) > 0) yearCount++;
      }
    }
  });

  $("d_overdue").textContent = buckets.overdue;
  $("d_urgent").textContent = buckets.urgent;
  $("d_urgentAmt").textContent = "ยอดรวม " + fmtMoney(urgentAmt);
  $("d_yearTotal").textContent = fmtMoney(yearAmt);
  $("d_yearCount").textContent = yearCount + " รายการในปีนี้";

  // Status pie
  renderChart("statusChart", "doughnut", {
    labels: ["ปกติ", "ใกล้ครบ", "ด่วน", "เลยกำหนด"],
    datasets: [{
      data: [buckets.ok, buckets.soon, buckets.urgent, buckets.overdue],
      backgroundColor: [COLORS.green, COLORS.yellow, COLORS.amber, COLORS.red],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }, {
    plugins: {
      legend: { position: 'bottom', labels: { font: { family: 'Sarabun', size: 12 }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
    },
    cutout: '60%',
  });

  // Type breakdown
  const typeCounts = {};
  records.forEach(r => {
    const key = r.type === "ต่อภาษี" ? "ต่อภาษี" : (r.type || "").startsWith("ประกันภัย") ? "ประกันภัย" : "พ.ร.บ.";
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  });
  renderChart("typeChart", "doughnut", {
    labels: Object.keys(typeCounts),
    datasets: [{
      data: Object.values(typeCounts),
      backgroundColor: [COLORS.blue, COLORS.gold, COLORS.green],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }, {
    plugins: {
      legend: { position: 'bottom', labels: { font: { family: 'Sarabun', size: 12 }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
    },
    cutout: '60%',
  });

  // Top 5 insurance companies
  const compCounts = {};
  records.forEach(r => {
    if (r.company && r.company !== "กรมขนส่ง") {
      compCounts[r.company] = (compCounts[r.company] || 0) + 1;
    }
  });
  const topCompanies = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  renderChart("companyChart", "bar", {
    labels: topCompanies.map(c => c[0]),
    datasets: [{
      label: "จำนวนรายการ",
      data: topCompanies.map(c => c[1]),
      backgroundColor: COLORS.navy,
      borderRadius: 6,
    }],
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { font: { family: 'Sarabun' }, stepSize: 1 }, grid: { color: '#f3f4f6' } },
      y: { ticks: { font: { family: 'Sarabun', size: 12 } }, grid: { display: false } },
    },
  });

  // Monthly Timeline (12 เดือนข้างหน้า)
  const monthLabels = [];
  const monthTotals = [];
  const monthCounts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    monthLabels.push(THAI_MONTHS_SHORT[m] + " " + (y + 543).toString().slice(-2));
    let total = 0, cnt = 0;
    records.forEach(r => {
      if (!r.end) return;
      const ed = new Date(r.end);
      if (isNaN(ed.getTime())) return;
      if (ed.getMonth() === m && ed.getFullYear() === y) {
        total += Number(r.amount) || 0;
        cnt++;
      }
    });
    monthTotals.push(total);
    monthCounts.push(cnt);
  }
  $("d_timelineBadge").textContent = monthCounts.reduce((a, b) => a + b, 0) + " รายการ";
  renderChart("monthlyChart", "bar", {
    labels: monthLabels,
    datasets: [
      {
        label: "ยอดเงิน (บาท)",
        data: monthTotals,
        backgroundColor: COLORS.gold,
        borderRadius: 6,
        yAxisID: 'y',
      },
      {
        label: "จำนวนรายการ",
        data: monthCounts,
        type: 'line',
        borderColor: COLORS.navy,
        backgroundColor: COLORS.navy,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: COLORS.navy,
        yAxisID: 'y1',
      },
    ],
  }, {
    plugins: {
      legend: { position: 'top', labels: { font: { family: 'Sarabun' }, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            if (ctx.dataset.label === "ยอดเงิน (บาท)") return "ยอดเงิน: " + fmtMoney(ctx.parsed.y);
            return "รายการ: " + ctx.parsed.y;
          },
        },
      },
    },
    scales: {
      x: { ticks: { font: { family: 'Sarabun' } }, grid: { display: false } },
      y: {
        position: 'left',
        ticks: {
          font: { family: 'Sarabun' },
          callback: v => '฿' + v.toLocaleString(),
        },
        grid: { color: '#f3f4f6' },
      },
      y1: {
        position: 'right',
        ticks: { font: { family: 'Sarabun' }, stepSize: 1 },
        grid: { display: false },
      },
    },
  });

  // Upcoming list (top 10 ที่ใกล้ครบที่สุด ที่ยังไม่ overdue หรือ overdue ไม่เกิน 90 วัน)
  const upcoming = records
    .filter(r => {
      const d = daysUntil(r.end);
      return d !== null && d <= 90;
    })
    .sort((a, b) => daysUntil(a.end) - daysUntil(b.end))
    .slice(0, 10);

  $("d_upcomingBadge").textContent = upcoming.length + " รายการ";
  const ul = $("d_upcomingList");
  if (upcoming.length === 0) {
    ul.innerHTML = `<div class="upcoming-empty"><div class="big">✨</div><div>ไม่มีรายการใกล้ครบกำหนด</div></div>`;
  } else {
    ul.innerHTML = upcoming.map(r => {
      const d = daysUntil(r.end);
      const cls = d < 0 ? "overdue" : d <= 30 ? "urgent" : "soon";
      const num = d < 0 ? Math.abs(d) : d;
      const lbl = d < 0 ? "วันเลย" : d === 0 ? "วันนี้" : "วัน";
      const sub = [r.vehicle, r.owner].filter(Boolean).join(" · ");
      return `
        <div class="upcoming-item" data-id="${escapeHtml(r.id)}">
          <div class="day-pill ${cls}">
            <span class="num">${num}</span>
            <span class="lbl">${lbl}</span>
          </div>
          <div class="info">
            <div class="pl">${escapeHtml(r.plate)} <span style="font-size:11px; font-weight:400; color:var(--gray); margin-left:6px;">${escapeHtml(r.type)}</span></div>
            <div class="meta">${escapeHtml(sub || r.company || "—")} · ${fmtDate(r.end)}</div>
          </div>
          <div class="amt">${fmtMoney(r.amount)}</div>
        </div>
      `;
    }).join("");
    ul.querySelectorAll(".upcoming-item").forEach(el => {
      el.addEventListener("click", () => {
        const id = el.dataset.id;
        switchPage("records");
        setTimeout(() => openModal(id), 300);
      });
    });
  }

  // Cost breakdown
  const costByType = { "ต่อภาษี": 0, "ประกันภัย": 0, "พ.ร.บ.": 0 };
  records.forEach(r => {
    const key = r.type === "ต่อภาษี" ? "ต่อภาษี" : (r.type || "").startsWith("ประกันภัย") ? "ประกันภัย" : "พ.ร.บ.";
    costByType[key] += Number(r.amount) || 0;
  });
  renderChart("costChart", "bar", {
    labels: Object.keys(costByType),
    datasets: [{
      label: "ยอดรวม (บาท)",
      data: Object.values(costByType),
      backgroundColor: [COLORS.blue, COLORS.gold, COLORS.green],
      borderRadius: 8,
    }],
  }, {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: ctx => "ยอดรวม: " + fmtMoney(ctx.parsed.y) },
      },
    },
    scales: {
      x: { ticks: { font: { family: 'Sarabun', size: 13 } }, grid: { display: false } },
      y: {
        ticks: {
          font: { family: 'Sarabun' },
          callback: v => '฿' + v.toLocaleString(),
        },
        grid: { color: '#f3f4f6' },
      },
    },
  });
}

function renderChart(canvasId, type, data, options = {}) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return;
  // Wait for parent layout to settle, then build chart
  requestAnimationFrame(() => {
    chartInstances[canvasId] = new Chart(ctx, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...options,
      },
    });
  });
}

// =========== Page Tabs ===========
// =========== History Page (หน้าประวัติ) ===========
let _histView = "time";   // "time" | "vehicle"
let _histFilter = { plate: "all", year: "all", type: "all" };

// รวมทุกรอบ (ปัจจุบัน + ประวัติ) ของทุก record เป็น list เดียว
function collectAllRounds() {
  const rounds = [];
  records.forEach(r => {
    const baseInfo = { recordId: r.id, plate: r.plate, vehicle: r.vehicle || "", type: r.type || "", category: r.category };
    // รอบปัจจุบัน
    rounds.push({
      ...baseInfo,
      isCurrent: true,
      start: toDateInputValue(r.start),
      end: toDateInputValue(r.end),
      amount: Number(r.amount) || 0,
      company: r.company || "",
      handler: r.handler || "",
      user: "",
      when: toDateInputValue(r.start) || toDateInputValue(r.end) || "",
    });
    // รอบเก่าจากประวัติ
    (Array.isArray(r.history) ? r.history : []).forEach(h => {
      rounds.push({
        ...baseInfo,
        isCurrent: false,
        start: toDateInputValue(h.start || ""),
        end: toDateInputValue(h.end || h.oldEnd || h.newEnd || ""),
        amount: Number(h.amount) || 0,
        company: h.company || "",
        handler: h.handler || "",
        user: h.user || "",
        when: h.archivedAt || h.date || "",
      });
    });
  });
  return rounds;
}

function roundYear(rd) {
  const d = rd.start || rd.end || rd.when;
  return d ? d.slice(0, 4) : "";
}

function renderHistoryPage() {
  const all = collectAllRounds();
  const archivedOnly = all.filter(r => !r.isCurrent);

  // ---------- เติมตัวกรอง (ครั้งแรกหรือเมื่อรายการเปลี่ยน) ----------
  const plateSel = $("histFilterPlate");
  const plates = [...new Set(all.map(r => r.plate))].sort((a, b) => a.localeCompare(b));
  const currentPlateVal = plateSel.value || "all";
  plateSel.innerHTML = `<option value="all">รถทุกคัน</option>` +
    plates.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  plateSel.value = plates.includes(currentPlateVal) ? currentPlateVal : "all";

  const yearSel = $("histFilterYear");
  const years = [...new Set(all.map(roundYear).filter(Boolean))].sort().reverse();
  const currentYearVal = yearSel.value || "all";
  yearSel.innerHTML = `<option value="all">ทุกปี</option>` +
    years.map(y => `<option value="${y}">พ.ศ. ${Number(y) + 543}</option>`).join("");
  yearSel.value = years.includes(currentYearVal) ? currentYearVal : "all";

  // ---------- สรุปภาพรวม ----------
  const thisYear = String(new Date().getFullYear());
  const lastYear = String(new Date().getFullYear() - 1);
  const sumYear = (y) => all.filter(r => roundYear(r) === y).reduce((s, r) => s + r.amount, 0);
  const spentThis = sumYear(thisYear);
  const spentLast = sumYear(lastYear);
  const diff = spentThis - spentLast;
  const diffPct = spentLast > 0 ? Math.round(Math.abs(diff) / spentLast * 100) : 0;
  $("histStats").innerHTML = `
    <div class="stat-card">
      <div class="stat-label">จ่ายปีนี้ (พ.ศ. ${Number(thisYear) + 543})</div>
      <div class="stat-value">${fmtMoney(spentThis)}</div>
      <div class="stat-sub">${diff === 0 || spentLast === 0 ? "" : diff > 0 ? `▲ เพิ่ม ${diffPct}% จากปีก่อน` : `▼ ลด ${diffPct}% จากปีก่อน`}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">จ่ายปีก่อน (พ.ศ. ${Number(lastYear) + 543})</div>
      <div class="stat-value">${fmtMoney(spentLast)}</div>
      <div class="stat-sub">เทียบเป็นฐาน</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">รอบที่บันทึกไว้ทั้งหมด</div>
      <div class="stat-value">${all.length}</div>
      <div class="stat-sub">ประวัติเก่า ${archivedOnly.length} รอบ · ปัจจุบัน ${all.length - archivedOnly.length}</div>
    </div>
  `;

  // ---------- กราฟรายปี ----------
  const byYear = {};
  all.forEach(r => {
    const y = roundYear(r);
    if (!y) return;
    byYear[y] = (byYear[y] || 0) + r.amount;
  });
  const chartYears = Object.keys(byYear).sort();
  const ctx = document.getElementById("histYearChart");
  if (ctx && typeof Chart !== "undefined") {
    if (chartInstances["histYearChart"]) chartInstances["histYearChart"].destroy();
    chartInstances["histYearChart"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: chartYears.map(y => "พ.ศ. " + (Number(y) + 543)),
        datasets: [{
          data: chartYears.map(y => byYear[y]),
          backgroundColor: chartYears.map(y => y === thisYear ? "#c9a961" : "#0a1f44"),
          borderRadius: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => fmtMoney(c.raw) } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => "฿" + (v >= 1000 ? (v / 1000) + "k" : v) } },
        },
      },
    });
  }

  // ---------- กรองรายการ ----------
  _histFilter.plate = plateSel.value;
  _histFilter.year = yearSel.value;
  _histFilter.type = $("histFilterType").value;
  let list = all.filter(r =>
    (_histFilter.plate === "all" || r.plate === _histFilter.plate) &&
    (_histFilter.year === "all" || roundYear(r) === _histFilter.year) &&
    (_histFilter.type === "all" || (r.type || "").startsWith(_histFilter.type))
  );

  const listEl = $("histList");
  const emptyEl = $("histEmpty");
  if (list.length === 0) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  // diff เทียบรอบก่อนของ record เดียวกัน
  const sortKey = r => r.start || r.end || r.when || "";
  const byRecord = {};
  all.forEach(r => { (byRecord[r.recordId] = byRecord[r.recordId] || []).push(r); });
  Object.values(byRecord).forEach(arr => arr.sort((a, b) => sortKey(b).localeCompare(sortKey(a))));
  const diffOf = (rd) => {
    const arr = byRecord[rd.recordId] || [];
    const i = arr.indexOf(rd);
    const prev = arr[i + 1];
    if (!prev || rd.amount <= 0 || prev.amount <= 0) return "";
    const d = rd.amount - prev.amount;
    if (Math.abs(d) < 0.01) return `<span class="tl-diff tl-same">= เท่าเดิม</span>`;
    const up = d > 0;
    return `<span class="tl-diff ${up ? "tl-up" : "tl-down"}">${up ? "▲ +" : "▼ −"}${fmtMoney(Math.abs(d)).replace("฿", "")}</span>`;
  };

  const cardOf = (rd) => {
    const range = rd.start && rd.end ? `${fmtDate(rd.start)} → ${fmtDate(rd.end)}` : rd.end ? `ถึง ${fmtDate(rd.end)}` : "—";
    const meta = [rd.company, rd.handler || rd.user].filter(Boolean).map(escapeHtml).join(" · ");
    return `
      <div class="hp-card ${rd.isCurrent ? "hp-current" : ""}" data-record="${escapeHtml(rd.recordId)}">
        <div class="hp-main">
          <div class="hp-plate">${escapeHtml(rd.plate)}
            ${typeBadge(rd.type)}
            ${rd.isCurrent ? '<span class="tl-badge-current">ปัจจุบัน</span>' : ""}
          </div>
          <div class="hp-range">📅 ${range}${meta ? " · " + meta : ""}</div>
        </div>
        <div class="hp-right">
          <div class="hp-amount">${rd.amount > 0 ? fmtMoney(rd.amount) : "—"}</div>
          <div>${diffOf(rd)}</div>
        </div>
      </div>
    `;
  };

  if (_histView === "time") {
    list.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    listEl.innerHTML = list.map(cardOf).join("");
  } else {
    // จัดกลุ่มตามรถ
    const groups = {};
    list.forEach(r => { (groups[r.plate] = groups[r.plate] || []).push(r); });
    listEl.innerHTML = Object.keys(groups).sort((a, b) => a.localeCompare(b)).map(plate => {
      const arr = groups[plate].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
      const total = arr.reduce((s, r) => s + r.amount, 0);
      const veh = arr.find(r => r.vehicle)?.vehicle || "";
      return `
        <div class="hp-group-head">
          <span>🚗 ${escapeHtml(plate)}${veh ? ` <span class="hp-group-sub">${escapeHtml(veh)}</span>` : ""}</span>
          <span class="hp-group-sub">${arr.length} รอบ · รวม ${fmtMoney(total)}</span>
        </div>
        ${arr.map(cardOf).join("")}
      `;
    }).join("");
  }

  // คลิกการ์ด → เปิดหน้าแก้ไข record นั้น
  listEl.querySelectorAll(".hp-card").forEach(el => {
    el.addEventListener("click", () => openModal(el.dataset.record));
  });
}

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll(".page-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.page === page);
  });
  document.querySelectorAll(".page-content").forEach(c => {
    c.classList.toggle("active", c.id === "page-" + page);
  });
  if (page === "dashboard") {
    setTimeout(renderDashboard, 50);
  }
  if (page === "history") {
    setTimeout(renderHistoryPage, 50);
  }
}

// =========== PDF Generation ===========
function openPdfModal() {
  pdfSelectedIds = new Set();
  renderPdfVehicleList();
  $("pdfOverlay").classList.add("show");
  isModalOpen = true;
}
function closePdfModal() {
  $("pdfOverlay").classList.remove("show");
  isModalOpen = false;
}
function renderPdfVehicleList() {
  // Group records by plate
  const byPlate = {};
  records.forEach(r => {
    if (!byPlate[r.plate]) {
      byPlate[r.plate] = { plate: r.plate, vehicle: r.vehicle, owner: r.owner, category: r.category, count: 0 };
    }
    byPlate[r.plate].count++;
    if (!byPlate[r.plate].vehicle && r.vehicle) byPlate[r.plate].vehicle = r.vehicle;
    if (!byPlate[r.plate].owner && r.owner) byPlate[r.plate].owner = r.owner;
  });
  const list = Object.values(byPlate).sort((a, b) => a.plate.localeCompare(b.plate));
  const wrap = $("vehicleListPdf");
  wrap.innerHTML = list.map(v => {
    const sub = [v.vehicle, v.owner].filter(Boolean).join(" · ");
    const cat = v.category === "company" ? "บริษัท" : "ส่วนตัว";
    return `
      <label class="vehicle-item ${pdfSelectedIds.has(v.plate) ? "selected" : ""}" data-plate="${escapeHtml(v.plate)}">
        <input type="checkbox" ${pdfSelectedIds.has(v.plate) ? "checked" : ""}>
        <div style="flex:1; min-width:0;">
          <div class="vplate">${escapeHtml(v.plate)} <span style="font-size:11px; font-weight:400; color:var(--gray); margin-left:6px;">${cat}</span></div>
          ${sub ? `<div class="vmeta">${escapeHtml(sub)} · ${v.count} รายการ</div>` : `<div class="vmeta">${v.count} รายการ</div>`}
        </div>
      </label>
    `;
  }).join("");
  wrap.querySelectorAll(".vehicle-item").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      const plate = el.dataset.plate;
      if (pdfSelectedIds.has(plate)) pdfSelectedIds.delete(plate);
      else pdfSelectedIds.add(plate);
      renderPdfVehicleList();
    });
  });
}

function pdfSelectAllPlates() {
  records.forEach(r => pdfSelectedIds.add(r.plate));
  renderPdfVehicleList();
}
function pdfSelectNonePlates() {
  pdfSelectedIds.clear();
  renderPdfVehicleList();
}
function pdfSelectByCategory(cat) {
  pdfSelectedIds.clear();
  records.forEach(r => { if (r.category === cat) pdfSelectedIds.add(r.plate); });
  renderPdfVehicleList();
}
function pdfSelectUrgentPlates() {
  pdfSelectedIds.clear();
  records.forEach(r => {
    const s = statusOf(r);
    if (s === "overdue" || s === "urgent") pdfSelectedIds.add(r.plate);
  });
  renderPdfVehicleList();
}

async function pdfGenerateFromSelected() {
  if (pdfSelectedIds.size === 0) {
    showToast("กรุณาเลือกรถอย่างน้อย 1 คัน", "error");
    return;
  }
  closePdfModal();
  await generatePDFForPlates([...pdfSelectedIds]);
}

async function generatePDFForPlates(plates) {
  if (typeof window.jspdf === "undefined") {
    showToast("กำลังโหลดไลบรารี กรุณาลองใหม่...", "warning");
    return;
  }
  const { jsPDF } = window.jspdf;
  showToast("กำลังสร้าง PDF...", "warning");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Load embedded Sarabun font for Thai support
  loadSarabunFontInPdf(doc);

  for (let idx = 0; idx < plates.length; idx++) {
    const plate = plates[idx];
    const platRecords = records.filter(r => r.plate === plate);
    if (platRecords.length === 0) continue;

    if (idx > 0) doc.addPage();
    renderPdfPage(doc, plate, platRecords, pageW, pageH);
  }

  // Footer page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`หน้า ${i} / ${pageCount}`, pageW - 20, pageH - 8, { align: "right" });
    doc.text(`Black Chicken Farm — Sukmart Holding`, 20, pageH - 8);
  }

  const ts = new Date().toISOString().slice(0, 10);
  const fname = plates.length === 1
    ? `report-${plates[0].replace(/[\/\\?%*:|"<>\s]+/g, "_")}-${ts}.pdf`
    : `report-${plates.length}-vehicles-${ts}.pdf`;
  doc.save(fname);
  showToast(`สร้าง PDF เรียบร้อย (${plates.length} คัน)`);
}

function loadSarabunFontInPdf(doc) {
  // Use embedded Sarabun base64 fonts (loaded from sarabun-font.js)
  if (window.SARABUN_FONT_REGULAR) {
    doc.addFileToVFS("Sarabun-Regular.ttf", window.SARABUN_FONT_REGULAR);
    doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
  }
  if (window.SARABUN_FONT_BOLD) {
    doc.addFileToVFS("Sarabun-Bold.ttf", window.SARABUN_FONT_BOLD);
    doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");
  }
  if (window.SARABUN_FONT_REGULAR) {
    doc.setFont("Sarabun");
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function renderPdfPage(doc, plate, recs, pageW, pageH) {
  // Header
  doc.setFillColor(10, 31, 68); // navy
  doc.rect(0, 0, pageW, 32, "F");

  doc.setTextColor(255);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(15);
  doc.text("รายงานข้อมูลภาษีรถยนต์", 14, 9, { baseline: "top" });

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.setTextColor(201, 169, 97); // gold
  doc.text("Black Chicken Farm — Sukmart Holding", 14, 18, { baseline: "top" });

  doc.setFontSize(8);
  doc.setTextColor(220);
  doc.text(`สร้างเมื่อ: ${new Date().toLocaleString("th-TH")}`, 14, 24, { baseline: "top" });

  // Vehicle Title Block
  let y = 45;
  doc.setTextColor(10, 31, 68);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(20);
  doc.text(plate, 14, y);

  // Subline
  const sample = recs[0];
  const sub = [sample.vehicle, sample.owner].filter(Boolean).join(" · ");
  if (sub) {
    y += 7;
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(sub, 14, y);
  }

  // Category badge
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(sample.category === "company" ? "หมวด: บริษัท" : "หมวด: ส่วนตัว", 14, y + 6);

  y += 14;

  // Summary stats box
  const totalAmt = recs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  let overdueCount = 0, urgentCount = 0;
  recs.forEach(r => {
    const s = statusOf(r);
    if (s === "overdue") overdueCount++;
    if (s === "urgent") urgentCount++;
  });

  // Summary box
  doc.setDrawColor(230);
  doc.setFillColor(247, 244, 236); // ivory
  doc.roundedRect(14, y, pageW - 28, 22, 2, 2, "FD");
  doc.setTextColor(10, 31, 68);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(10);

  const colW = (pageW - 28) / 4;
  const stats = [
    { label: "จำนวนรายการ", value: recs.length + "" },
    { label: "ยอดรวม", value: fmtMoney(totalAmt) },
    { label: "เลยกำหนด", value: overdueCount + "", color: [220, 38, 38] },
    { label: "ใกล้ครบ 30 วัน", value: urgentCount + "", color: [245, 158, 11] },
  ];
  stats.forEach((s, i) => {
    const x = 14 + colW * i + colW / 2;
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(s.label, x, y + 7, { align: "center" });
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(13);
    if (s.color) doc.setTextColor(s.color[0], s.color[1], s.color[2]);
    else doc.setTextColor(10, 31, 68);
    doc.text(s.value, x, y + 16, { align: "center" });
  });

  y += 30;

  // Records Table
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(12);
  doc.setTextColor(10, 31, 68);
  doc.text("รายละเอียดการต่อ", 14, y);
  y += 5;

  // Build table data
  const tableData = recs.map(r => {
    const d = daysUntil(r.end);
    let statusText = "—";
    if (d !== null) {
      if (d < 0) statusText = `เลยกำหนด ${Math.abs(d)} วัน`;
      else if (d === 0) statusText = "วันนี้";
      else if (d <= 30) statusText = `ด่วน ${d} วัน`;
      else if (d <= 90) statusText = `ใกล้ครบ ${d} วัน`;
      else statusText = `${d} วัน`;
    }
    return [
      r.type || "",
      r.company || "—",
      r.start ? fmtDate(r.start) : "—",
      r.end ? fmtDate(r.end) : "—",
      r.amount ? fmtMoney(r.amount) : "—",
      statusText,
    ];
  });

  doc.autoTable({
    startY: y,
    head: [["ประเภท", "บริษัท", "วันเริ่ม", "วันสิ้นสุด", "ยอดเงิน", "สถานะ"]],
    body: tableData,
    theme: "grid",
    styles: {
      font: "Sarabun",
      fontSize: 9,
      cellPadding: 3,
      lineColor: [220, 220, 220],
      textColor: [40, 40, 40],
    },
    headStyles: {
      fillColor: [10, 31, 68],
      textColor: [255, 255, 255],
      font: "Sarabun",
      fontStyle: "bold",
      fontSize: 10,
      halign: "left",
    },
    alternateRowStyles: { fillColor: [250, 248, 242] },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "center" },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 5) {
        const txt = hookData.cell.text[0] || "";
        if (txt.includes("เลยกำหนด")) hookData.cell.styles.textColor = [220, 38, 38];
        else if (txt.includes("ด่วน") || txt.includes("วันนี้")) hookData.cell.styles.textColor = [245, 158, 11];
      }
    },
  });

  let afterY = doc.lastAutoTable.finalY + 8;

  // Notes section
  const allNotes = recs.filter(r => r.notes).map(r => `• ${r.type}: ${r.notes}`);
  if (allNotes.length > 0 && afterY < pageH - 30) {
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(11);
    doc.setTextColor(10, 31, 68);
    doc.text("หมายเหตุ", 14, afterY);
    afterY += 5;
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    allNotes.forEach(n => {
      const lines = doc.splitTextToSize(n, pageW - 28);
      lines.forEach(line => {
        if (afterY > pageH - 20) return;
        doc.text(line, 14, afterY);
        afterY += 4.5;
      });
    });
  }
}


function renderAll() {
  renderStats();
  renderTable();
  renderDashboard();
}

function init() {
  loadRecords();

  // Show current user on header
  const userName = getCurrentUserName();
  $("userName").textContent = userName;
  $("userAvatar").textContent = userName.charAt(0);
  // Log first session entry once per session
  if (!sessionStorage.getItem("bcf_vt_logged_in")) {
    logActivity("login", `${userName} เข้าสู่ระบบ`);
    sessionStorage.setItem("bcf_vt_logged_in", "1");
  }

  // Initial sync status
  const s = loadSettings();
  if (s.webhookUrl) setSyncStatus("ok", "พร้อมใช้งาน");
  else setSyncStatus("offline", "ออฟไลน์");

  // Tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      currentFilter.cat = t.dataset.cat;
      renderTable();
    });
  });

  // Page Tabs (Dashboard / Records)
  document.querySelectorAll(".page-tab").forEach(t => {
    t.addEventListener("click", () => switchPage(t.dataset.page));
  });

  // หน้าประวัติ: สลับมุมมอง + ตัวกรอง
  document.querySelectorAll(".hist-view-btn").forEach(b => {
    b.addEventListener("click", () => {
      _histView = b.dataset.view;
      document.querySelectorAll(".hist-view-btn").forEach(x =>
        x.classList.toggle("active", x.dataset.view === _histView));
      renderHistoryPage();
    });
  });
  ["histFilterPlate", "histFilterYear", "histFilterType"].forEach(id => {
    $(id).addEventListener("change", renderHistoryPage);
  });

  // Monthly Summary navigation
  $("ms_prev").addEventListener("click", () => {
    const cur = getCurrentMsMonth();
    setMsMonth(cur.year, cur.month - 1);
  });
  $("ms_next").addEventListener("click", () => {
    const cur = getCurrentMsMonth();
    setMsMonth(cur.year, cur.month + 1);
  });
  $("ms_today").addEventListener("click", () => {
    msMonth = null;
    renderMonthlySummary();
  });
  $("ms_select").addEventListener("change", e => {
    const [y, m] = e.target.value.split("-").map(Number);
    setMsMonth(y, m);
  });
  $("ms_printChecklist").addEventListener("click", generateMonthlyChecklistPDF);

  // PDF
  $("btnPdfReport").addEventListener("click", openPdfModal);
  $("pdfClose").addEventListener("click", closePdfModal);
  $("pdfCancel").addEventListener("click", closePdfModal);
  $("pdfGenerate").addEventListener("click", pdfGenerateFromSelected);
  $("pdfSelectAll").addEventListener("click", pdfSelectAllPlates);
  $("pdfSelectNone").addEventListener("click", pdfSelectNonePlates);
  $("pdfSelectCompany").addEventListener("click", () => pdfSelectByCategory("company"));
  $("pdfSelectPersonal").addEventListener("click", () => pdfSelectByCategory("personal"));
  $("pdfSelectUrgent").addEventListener("click", pdfSelectUrgentPlates);
  $("pdfOverlay").addEventListener("click", e => {
    if (e.target.id === "pdfOverlay") closePdfModal();
  });

  // Renew modal
  $("renewClose").addEventListener("click", closeRenewModal);
  $("renewCancel").addEventListener("click", closeRenewModal);
  $("renewConfirm").addEventListener("click", confirmRenew);
  document.querySelectorAll(".renew-period-btn").forEach(btn => {
    btn.addEventListener("click", () => selectRenewPeriod(btn.dataset.period));
  });
  $("renewStart").addEventListener("change", recalcRenewEnd);
  $("renewOverlay").addEventListener("click", e => {
    if (e.target.id === "renewOverlay") closeRenewModal();
  });

  // Suspend buttons in edit modal
  $("btnToggleSuspendThis").addEventListener("click", () => {
    if (!editingId) return;
    toggleSuspend(editingId);
    // Re-render suspend section based on updated state
    const r = records.find(x => x.id === editingId);
    if (r) renderSuspendSection(r);
  });
  $("btnToggleSuspendVehicle").addEventListener("click", () => {
    if (!editingId) return;
    const r = records.find(x => x.id === editingId);
    if (!r) return;
    const allRecsForVehicle = records.filter(x => x.plate === r.plate);
    const allSuspended = allRecsForVehicle.length > 0 && allRecsForVehicle.every(x => x.suspended);
    const willSuspend = !allSuspended;
    const msg = willSuspend
      ? `ระงับเตือน "${r.plate}" ทั้งคัน?\n\nจะระงับ ${allRecsForVehicle.length} รายการ — ภาษี/ประกัน/พ.ร.บ. ทั้งหมด`
      : `เปิดเตือน "${r.plate}" ทั้งคันอีกครั้ง?\n\nจะเปิด ${allRecsForVehicle.length} รายการ`;
    if (!confirm(msg)) return;
    const count = suspendWholeVehicle(r.plate, willSuspend);
    renderAll();
    showToast(willSuspend
      ? `🔕 ระงับ ${r.plate} ทั้งคัน (${count} รายการ)`
      : `🔔 เปิดเตือน ${r.plate} ทั้งคัน (${count} รายการ)`);
    // Update modal display
    const updatedR = records.find(x => x.id === editingId);
    if (updatedR) renderSuspendSection(updatedR);
  });

  // File upload
  $("fileInput").addEventListener("change", e => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files);
      e.target.value = "";
    }
  });

  // Image viewer
  $("ivClose").addEventListener("click", hideImageViewer);
  $("imageViewer").addEventListener("click", e => {
    if (e.target.id === "imageViewer") hideImageViewer();
  });

  // Activity log
  $("btnActivityLog").addEventListener("click", openLogModal);
  $("logClose").addEventListener("click", closeLogModal);
  $("logCloseBtn").addEventListener("click", closeLogModal);
  $("logClear").addEventListener("click", clearLog);
  $("logRefresh").addEventListener("click", refreshLogs);
  $("logExport").addEventListener("click", exportLogsCSV);
  $("logFilterUser").addEventListener("change", e => { _logFilter.user = e.target.value; renderLogList(); });
  $("logFilterAction").addEventListener("change", e => { _logFilter.action = e.target.value; renderLogList(); });
  $("logFilterPlate").addEventListener("input", e => { _logFilter.plate = e.target.value; renderLogList(); });
  $("logFilterFrom").addEventListener("change", e => { _logFilter.dateFrom = e.target.value; renderLogList(); });
  $("logFilterTo").addEventListener("change", e => { _logFilter.dateTo = e.target.value; renderLogList(); });
  $("logFilterClear").addEventListener("click", () => {
    _logFilter = { user: "all", action: "all", plate: "", dateFrom: "", dateTo: "" };
    $("logFilterUser").value = "all";
    $("logFilterAction").value = "all";
    $("logFilterPlate").value = "";
    $("logFilterFrom").value = "";
    $("logFilterTo").value = "";
    renderLogList();
  });
  $("logOverlay").addEventListener("click", e => {
    if (e.target.id === "logOverlay") closeLogModal();
  });

  // Backup & Restore
  $("btnBackup").addEventListener("click", openBackupModal);
  $("backupClose").addEventListener("click", closeBackupModal);
  $("backupCancelBtn").addEventListener("click", closeBackupModal);
  $("backupRestoreBtn").addEventListener("click", confirmRestore);
  $("backupManualBtn").addEventListener("click", manualBackup);
  $("backupOverlay").addEventListener("click", e => {
    if (e.target.id === "backupOverlay") closeBackupModal();
  });

  // Search & filters
  $("searchInput").addEventListener("input", e => {
    currentFilter.search = e.target.value;
    renderTable();
  });
  $("filterStatus").addEventListener("change", e => {
    currentFilter.status = e.target.value;
    renderTable();
  });
  $("filterType").addEventListener("change", e => {
    currentFilter.type = e.target.value;
    renderTable();
  });

  // Buttons
  $("btnAdd").addEventListener("click", () => openModal(null));
  $("btnExport").addEventListener("click", exportCSV);
  $("btnSettings").addEventListener("click", openSettings);
  $("btnLogout").addEventListener("click", logout);

  // Modal
  $("modalClose").addEventListener("click", closeModal);
  $("btnCancel").addEventListener("click", closeModal);
  $("btnSave").addEventListener("click", saveRecord);
  $("modalOverlay").addEventListener("click", e => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  // Settings modal
  $("settingsClose").addEventListener("click", closeSettings);
  $("btnSaveSettings").addEventListener("click", saveSettingsForm);
  $("btnTestSync").addEventListener("click", testSync);
  $("btnPullData").addEventListener("click", pullFromSheets);
  $("btnPushAll").addEventListener("click", pushAllToSheets);
  $("btnResetData").addEventListener("click", resetData);
  $("btnHealthCheck").addEventListener("click", runDataHealthCheck);
  // คลิก sync badge → ส่งคิวค้างทันที
  $("syncStatus").addEventListener("click", () => {
    const q = loadPendingQueue();
    if (q.length > 0) {
      showToast(`กำลังส่ง ${q.length} รายการที่ค้าง...`, "warning");
      flushSyncQueue();
    } else {
      showToast("✓ ข้อมูลซิงค์ครบแล้ว");
    }
  });
  $("settingsOverlay").addEventListener("click", e => {
    if (e.target.id === "settingsOverlay") closeSettings();
  });
  // Master notification toggle
  $("masterNotifyToggle").addEventListener("click", () => {
    const willDisable = _cachedNotifyEnabled;
    const msg = willDisable
      ? "ปิดการส่งเมลแจ้งเตือนทั้งระบบ?\n\nรถทุกคันจะไม่ได้รับเมลเตือนจนกว่าจะเปิดอีกครั้ง"
      : "เปิดการส่งเมลแจ้งเตือนทั้งระบบอีกครั้ง?\n\nระบบจะเริ่มส่งเมลตามปกติ";
    if (!confirm(msg)) return;
    toggleMasterNotify();
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeModal();
      closeSettings();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      openModal(null);
    }
  });

  // Auto-sync on tab focus (เมื่อกลับมาที่แท็บ ดึงข้อมูลทันที)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      const settings = loadSettings();
      if (settings.webhookUrl) autoPullFromSheets();
    }
  });

  // เริ่ม auto-sync ถ้ามี webhook URL ตั้งไว้แล้ว
  startAutoSync();

  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
