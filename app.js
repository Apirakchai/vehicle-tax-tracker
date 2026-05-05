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
const AUTO_SYNC_INTERVAL = 30000; // 30 วินาที

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
const statusOf = (rec) => {
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
};
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
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch (e) { return {}; }
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// =========== Stats ===========
function renderStats() {
  const box = $("statsBox");
  const total = records.length;
  const byStatus = { overdue: 0, urgent: 0, soon: 0, ok: 0 };
  let totalDue30 = 0;
  records.forEach(r => {
    const s = statusOf(r);
    byStatus[s] = (byStatus[s] || 0) + 1;
    if (s === "urgent" || s === "overdue") {
      totalDue30 += Number(r.amount) || 0;
    }
  });
  box.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">รายการทั้งหมด</div>
      <div class="stat-value">${total}</div>
      <div class="stat-sub">รถ ${new Set(records.map(r => r.plate)).size} คัน</div>
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
    return `
      <tr data-id="${escapeHtml(r.id)}">
        <td>
          <div class="plate">${escapeHtml(r.plate)}</div>
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
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') openModal(id);
      else if (action === 'delete') deleteRecord(id);
      else if (action === 'pdf-row') {
        const plate = btn.dataset.plate;
        generatePDFForPlates([plate]);
      }
    });
  });
}

// =========== Modal ===========
function openModal(id) {
  editingId = id;
  isModalOpen = true;
  const overlay = $("modalOverlay");
  const title = $("modalTitle");
  if (id) {
    title.textContent = "แก้ไขรายการ";
    const r = records.find(x => x.id === id);
    if (!r) return;
    $("f_category").value = r.category;
    $("f_plate").value = r.plate || "";
    $("f_vehicle").value = r.vehicle || "";
    $("f_owner").value = r.owner || "";
    $("f_type").value = r.type || "ต่อภาษี";
    $("f_company").value = r.company || "";
    $("f_start").value = r.start || "";
    $("f_end").value = r.end || "";
    $("f_amount").value = r.amount || "";
    $("f_month").value = r.month || "";
    $("f_prevPaid").value = r.prevPaid || "";
    $("f_currPaid").value = r.currPaid || "";
    $("f_handler").value = r.handler || "";
    $("f_payStatus").value = r.payStatus || "";
    $("f_notes").value = r.notes || "";
  } else {
    title.textContent = "เพิ่มรายการใหม่";
    $("recordForm").reset();
    $("f_category").value = "company";
    $("f_type").value = "ต่อภาษี";
  }
  overlay.classList.add("show");
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
  if (editingId) {
    const idx = records.findIndex(r => r.id === editingId);
    if (idx >= 0) records[idx] = { ...records[idx], ...data };
    showToast("บันทึกการแก้ไขแล้ว");
  } else {
    data.id = `${data.category[0]}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    records.push(data);
    showToast("เพิ่มรายการใหม่แล้ว");
  }
  saveRecords();
  syncToSheets("upsert", data);
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
  el.classList.remove("offline", "syncing");
  if (state === "offline") el.classList.add("offline");
  if (state === "syncing") el.classList.add("syncing");
  $("syncText").textContent = text;
}
async function syncToSheets(action, data) {
  const settings = loadSettings();
  if (!settings.webhookUrl) return;
  setSyncStatus("syncing", "กำลังซิงค์...");
  try {
    // Apps Script Web Apps require POST with text content type to avoid CORS preflight
    await fetch(settings.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, data, ts: Date.now() }),
    });
    setSyncStatus("ok", "ซิงค์แล้ว");
  } catch (e) {
    setSyncStatus("offline", "ออฟไลน์");
  }
}
async function pushAllToSheets() {
  const settings = loadSettings();
  if (!settings.webhookUrl) {
    showToast("กรุณาตั้งค่า Web App URL ก่อน", "error");
    return;
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
  
  isSyncing = true;
  setSyncStatus("syncing", "กำลังซิงค์...");
  try {
    const url = settings.webhookUrl + (settings.webhookUrl.includes("?") ? "&" : "?") + "action=list&t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const result = await res.json();
    if (Array.isArray(result.data)) {
      // เปรียบเทียบกับข้อมูลปัจจุบัน — อัปเดตเฉพาะที่เปลี่ยน
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
  // ดึงครั้งแรกทันที
  autoPullFromSheets();
  // ตั้ง interval
  autoSyncTimer = setInterval(autoPullFromSheets, AUTO_SYNC_INTERVAL);
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
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
}

// =========== Dashboard ===========
function renderDashboard() {
  if (currentPage !== "dashboard") return;

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
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    monthLabels.push(thaiMonths[m] + " " + (y + 543).toString().slice(-2));
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
  $("settingsOverlay").addEventListener("click", e => {
    if (e.target.id === "settingsOverlay") closeSettings();
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
