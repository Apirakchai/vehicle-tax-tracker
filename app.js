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
    });
  });
}

// =========== Modal ===========
function openModal(id) {
  editingId = id;
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
  const s = loadSettings();
  $("s_webhookUrl").value = s.webhookUrl || "";
  $("s_email").value = s.email || "";
  $("s_alertDays").value = s.alertDays || 30;
  $("recordCount").textContent = records.length;
  $("settingsOverlay").classList.add("show");
}
function closeSettings() {
  $("settingsOverlay").classList.remove("show");
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
  if (s.webhookUrl) setSyncStatus("ok", "พร้อมใช้งาน");
  else setSyncStatus("offline", "ออฟไลน์");
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

// =========== Main ===========
function renderAll() {
  renderStats();
  renderTable();
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

  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
