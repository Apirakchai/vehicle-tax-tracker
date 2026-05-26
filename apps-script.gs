/**
 * Google Apps Script — Vehicle Tax Tracker for Black Chicken Farm
 * 
 * วิธีติดตั้ง:
 * 1. เปิด https://sheets.google.com แล้วสร้างไฟล์ใหม่ ตั้งชื่อเช่น "Vehicle Tax Tracker"
 * 2. ใน Sheet ที่สร้าง คลิก Extensions > Apps Script
 * 3. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดนี้ลงไป
 * 4. แก้ไขค่า CONFIG ด้านล่าง (NOTIFY_EMAIL ใส่อีเมลที่จะรับการแจ้งเตือน)
 * 5. คลิก Deploy > New deployment
 *    - Type: Web app
 *    - Description: Vehicle Tax Tracker
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. คลิก Deploy แล้ว Authorize
 * 7. คัดลอก Web app URL ไปวางในการตั้งค่าของระบบที่หน้าเว็บ
 * 8. ตั้งค่า Trigger สำหรับ Email แจ้งเตือนรายวัน (ทำในข้อ 9)
 * 9. กลับไปที่ Apps Script > Triggers (ไอคอนนาฬิกาด้านซ้าย)
 *    - Add Trigger
 *    - Function: dailyNotify
 *    - Event source: Time-driven
 *    - Type: Day timer
 *    - Time of day: 8am - 9am
 *    - Save
 */

// ============= CONFIG =============
const CONFIG = {
  SHEET_NAME: "ภาษีรถยนต์",
  LOG_SHEET_NAME: "Activity Log",
  FILES_SHEET_NAME: "Files",
  SETTINGS_SHEET_NAME: "Settings",
  BACKUP_PREFIX: "Backup_",
  BACKUP_RETENTION_DAYS: 30,
  DRIVE_FOLDER_ID: "1LfXzviwb_AWCSJgYpygSYx6RY0-5KObh",  // โฟลเดอร์ Google Drive สำหรับเก็บรูปเอกสาร
  NOTIFY_EMAIL: "bcf2546@gmail.com",         // อีเมลรับการแจ้งเตือน
  ALERT_DAYS_BEFORE: 30,                     // แจ้งเตือนล่วงหน้า (วัน)
  COMPANY_NAME: "Black Chicken Farm — Sukmart Holding"
};

const HEADERS = [
  "id", "category", "plate", "vehicle", "owner", "type", "company",
  "start", "end", "amount", "month", "prevPaid", "currPaid",
  "handler", "payStatus", "notes", "updated", "suspended"
];

const LOG_HEADERS = [
  "id", "timestamp", "date", "time", "user", "action", "plate", "type", "detail"
];

const FILES_HEADERS = [
  "id", "recordId", "plate", "fileName", "fileId", "url", "thumbnail",
  "size", "mimeType", "uploadedAt", "uploadedBy"
];

// ============= ENTRY POINTS =============
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result = { ok: true };

    if (action === "ping") {
      result.message = "Connected to " + CONFIG.COMPANY_NAME;
      logEvent("ping", "");
    } else if (action === "upsert") {
      upsertRecord(body.data);
      result.message = "บันทึกแล้ว: " + body.data.plate;
    } else if (action === "delete") {
      deleteRecord(body.data.id);
      result.message = "ลบแล้ว: " + body.data.id;
    } else if (action === "replaceAll") {
      replaceAll(body.data);
      result.message = "อัปโหลด " + body.data.length + " รายการแล้ว";
    } else if (action === "logEntry") {
      // เพิ่ม log entry ใหม่
      appendLog(body.data);
      result.message = "log บันทึกแล้ว";
    } else if (action === "uploadFile") {
      const file = uploadFileToDrive(body.data);
      result.message = "อัปโหลดสำเร็จ";
      result.file = file;
    } else if (action === "deleteFile") {
      deleteFileFromDrive(body.data.id);
      result.message = "ลบไฟล์แล้ว";
    } else if (action === "restoreBackup") {
      const restored = restoreFromBackup(body.data.backupName);
      result.message = "กู้คืน " + restored + " รายการแล้ว";
      result.count = restored;
    } else if (action === "createBackup") {
      const name = createBackup();
      result.message = "สร้าง backup " + name + " แล้ว";
      result.backupName = name;
    } else if (action === "setSetting") {
      setSetting(body.data.key, body.data.value);
      result.message = "บันทึก setting แล้ว";
    } else {
      result.ok = false;
      result.message = "Unknown action: " + action;
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || "list";
  if (action === "list") {
    return jsonResponse({ ok: true, data: listAll() });
  }
  if (action === "alerts") {
    return jsonResponse({ ok: true, data: getUpcoming() });
  }
  if (action === "logs") {
    const limit = parseInt(e.parameter.limit || "500", 10);
    return jsonResponse({ ok: true, data: listLogs(limit) });
  }
  if (action === "files") {
    const recordId = e.parameter.recordId || "";
    return jsonResponse({ ok: true, data: listFilesForRecord(recordId) });
  }
  if (action === "backups") {
    return jsonResponse({ ok: true, data: listBackups() });
  }
  if (action === "backupData") {
    const name = e.parameter.name || "";
    return jsonResponse({ ok: true, data: getBackupData(name) });
  }
  if (action === "settings") {
    return jsonResponse({ ok: true, data: getAllSettings() });
  }
  return jsonResponse({ ok: true, message: "Vehicle Tax Tracker API", actions: ["list", "alerts", "logs", "files", "backups", "backupData", "settings"] });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============= SHEET HELPERS =============
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setBackground("#0a1f44")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sh.autoResizeColumns(1, HEADERS.length);
  }
  return sh;
}

function recordToRow(r) {
  return HEADERS.map(h => h === "updated" ? new Date().toISOString() : (r[h] !== undefined ? r[h] : ""));
}

function rowToRecord(row) {
  const obj = {};
  HEADERS.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}

function findRowById(sh, id) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function upsertRecord(rec) {
  const sh = getSheet();
  const rowData = recordToRow(rec);
  const existingRow = findRowById(sh, rec.id);
  if (existingRow > 0) {
    sh.getRange(existingRow, 1, 1, HEADERS.length).setValues([rowData]);
  } else {
    sh.appendRow(rowData);
  }
}

function deleteRecord(id) {
  const sh = getSheet();
  const row = findRowById(sh, id);
  if (row > 0) sh.deleteRow(row);
}

function replaceAll(records) {
  const sh = getSheet();
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  if (records.length > 0) {
    const rows = records.map(recordToRow);
    sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }
}

function listAll() {
  const sh = getSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return data.filter(r => r[0]).map(rowToRecord);
}

// ============= ACTIVITY LOG =============
function getLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, LOG_HEADERS.length)
      .setBackground("#0a1f44")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    // Set column widths
    sh.setColumnWidth(1, 200);  // id
    sh.setColumnWidth(2, 170);  // timestamp
    sh.setColumnWidth(3, 100);  // date
    sh.setColumnWidth(4, 80);   // time
    sh.setColumnWidth(5, 100);  // user
    sh.setColumnWidth(6, 80);   // action
    sh.setColumnWidth(7, 120);  // plate
    sh.setColumnWidth(8, 110);  // type
    sh.setColumnWidth(9, 320);  // detail
  }
  return sh;
}

function appendLog(entry) {
  const sh = getLogSheet();
  const ts = entry.timestamp || new Date().toISOString();
  const dt = new Date(ts);
  const dateStr = Utilities.formatDate(dt, "Asia/Bangkok", "yyyy-MM-dd");
  const timeStr = Utilities.formatDate(dt, "Asia/Bangkok", "HH:mm:ss");
  const id = entry.id || (ts + "_" + Math.random().toString(36).slice(2, 6));
  const row = [
    id,
    ts,
    dateStr,
    timeStr,
    entry.user || "",
    entry.action || "",
    entry.plate || "",
    entry.type || "",
    entry.detail || ""
  ];
  sh.appendRow(row);
}

function listLogs(limit) {
  limit = limit || 500;
  const sh = getLogSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // Read all logs
  const numRows = lastRow - 1;
  const data = sh.getRange(2, 1, numRows, LOG_HEADERS.length).getValues();
  // Convert to objects, newest first
  const logs = data.filter(r => r[0]).map(function(row) {
    const obj = {};
    LOG_HEADERS.forEach((h, i) => { obj[h] = row[i]; });
    // ensure timestamp is ISO string
    if (obj.timestamp instanceof Date) {
      obj.timestamp = obj.timestamp.toISOString();
    }
    return obj;
  });
  // Sort by timestamp descending and limit
  logs.sort(function(a, b) {
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });
  return logs.slice(0, limit);
}

function logEvent(action, detail) {
  // optional: append to a log sheet
}

// ============= FILE ATTACHMENTS (Google Drive) =============
function getFilesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.FILES_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.FILES_SHEET_NAME);
    sh.getRange(1, 1, 1, FILES_HEADERS.length).setValues([FILES_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, FILES_HEADERS.length)
      .setBackground("#0a1f44")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sh.setColumnWidth(1, 200);  // id
    sh.setColumnWidth(2, 200);  // recordId
    sh.setColumnWidth(3, 120);  // plate
    sh.setColumnWidth(4, 240);  // fileName
    sh.setColumnWidth(5, 280);  // fileId
    sh.setColumnWidth(6, 280);  // url
    sh.setColumnWidth(7, 280);  // thumbnail
    sh.setColumnWidth(8, 80);   // size
    sh.setColumnWidth(9, 100);  // mimeType
    sh.setColumnWidth(10, 170); // uploadedAt
    sh.setColumnWidth(11, 100); // uploadedBy
  }
  return sh;
}

function getDriveFolder() {
  return DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
}

function uploadFileToDrive(data) {
  // data: { recordId, plate, fileName, mimeType, dataBase64, uploadedBy }
  const folder = getDriveFolder();
  const blob = Utilities.newBlob(
    Utilities.base64Decode(data.dataBase64),
    data.mimeType || "image/jpeg",
    data.fileName || "untitled.jpg"
  );
  const driveFile = folder.createFile(blob);
  // Make file viewable to anyone with the link (for embedding)
  try {
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // Some workspace policies disallow this — file still readable to owner
  }
  const fileId = driveFile.getId();
  const url = "https://drive.google.com/uc?id=" + fileId;
  const thumbnail = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w400";
  const id = "f_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const ts = new Date().toISOString();
  const size = blob.getBytes().length;

  // Append to sheet
  const sh = getFilesSheet();
  sh.appendRow([
    id,
    data.recordId || "",
    data.plate || "",
    data.fileName || "",
    fileId,
    url,
    thumbnail,
    size,
    data.mimeType || "",
    ts,
    data.uploadedBy || ""
  ]);

  return {
    id: id,
    recordId: data.recordId,
    plate: data.plate,
    fileName: data.fileName,
    fileId: fileId,
    url: url,
    thumbnail: thumbnail,
    size: size,
    mimeType: data.mimeType,
    uploadedAt: ts,
    uploadedBy: data.uploadedBy
  };
}

function deleteFileFromDrive(id) {
  const sh = getFilesSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const data = sh.getRange(2, 1, lastRow - 1, FILES_HEADERS.length).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      const fileId = data[i][4];
      // Try to delete from Drive (move to trash)
      try {
        if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
      } catch (e) {
        // File may not exist anymore
      }
      sh.deleteRow(i + 2);
      return;
    }
  }
}

function listFilesForRecord(recordId) {
  const sh = getFilesSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, FILES_HEADERS.length).getValues();
  return data
    .filter(row => row[0] && (!recordId || String(row[1]) === String(recordId)))
    .map(row => {
      const obj = {};
      FILES_HEADERS.forEach((h, i) => { obj[h] = row[i]; });
      if (obj.uploadedAt instanceof Date) obj.uploadedAt = obj.uploadedAt.toISOString();
      return obj;
    });
}

// ============= SETTINGS (Master Switches) =============
function getSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.SETTINGS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SETTINGS_SHEET_NAME);
    sh.getRange(1, 1, 1, 3).setValues([["key", "value", "updated"]]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 3)
      .setBackground("#0a1f44")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sh.setColumnWidth(1, 200);
    sh.setColumnWidth(2, 100);
    sh.setColumnWidth(3, 180);
    // Seed default values
    sh.appendRow(["notifications_enabled", "true", new Date().toISOString()]);
  }
  return sh;
}

function getSetting(key, defaultValue) {
  const sh = getSettingsSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return defaultValue;
  const data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      return data[i][1];
    }
  }
  return defaultValue;
}

function setSetting(key, value) {
  const sh = getSettingsSheet();
  const lastRow = sh.getLastRow();
  const now = new Date().toISOString();
  if (lastRow >= 2) {
    const keys = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === String(key)) {
        sh.getRange(i + 2, 2).setValue(String(value));
        sh.getRange(i + 2, 3).setValue(now);
        return;
      }
    }
  }
  sh.appendRow([key, String(value), now]);
}

function getAllSettings() {
  const sh = getSettingsSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {};
  const data = sh.getRange(2, 1, lastRow - 1, 3).getValues();
  const result = {};
  data.forEach(function(row) {
    if (row[0]) {
      result[String(row[0])] = {
        value: String(row[1]),
        updated: row[2] instanceof Date ? row[2].toISOString() : String(row[2])
      };
    }
  });
  return result;
}

function isNotificationsEnabled() {
  const v = getSetting("notifications_enabled", "true");
  return String(v).toLowerCase() === "true";
}

// ============= BACKUP & RESTORE =============
function createBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = getSheet();
  const lastRow = sourceSheet.getLastRow();
  const lastCol = sourceSheet.getLastColumn();
  if (lastRow < 2) return null; // No data to backup

  // Generate backup sheet name with date (Bangkok timezone)
  const now = new Date();
  const dateStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd");
  const backupName = CONFIG.BACKUP_PREFIX + dateStr;

  // If backup for today exists, delete it (replace with latest)
  const existing = ss.getSheetByName(backupName);
  if (existing) ss.deleteSheet(existing);

  // Create new backup sheet
  const backupSheet = ss.insertSheet(backupName);
  // Copy all data
  const data = sourceSheet.getRange(1, 1, lastRow, lastCol).getValues();
  backupSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  // Format header
  backupSheet.setFrozenRows(1);
  backupSheet.getRange(1, 1, 1, lastCol)
    .setBackground("#16a34a")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  // Add metadata note in A1 cell
  backupSheet.getRange(1, 1).setNote(
    "Backup created: " + Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss") +
    "\nRecords: " + (lastRow - 1)
  );
  // Hide the backup sheet to avoid clutter
  backupSheet.hideSheet();

  // Cleanup old backups
  cleanupOldBackups();

  return backupName;
}

function dailyBackup() {
  // Wrapper for time-driven trigger
  try {
    const name = createBackup();
    if (name) {
      Logger.log("Daily backup created: " + name);
    }
  } catch (e) {
    Logger.log("Backup failed: " + e.toString());
    // Optionally notify admin
    try {
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL,
        subject: "[BCF] Backup failed — " + new Date().toLocaleDateString("th-TH"),
        body: "Backup failed with error:\n\n" + e.toString()
      });
    } catch (e2) {}
  }
}

function cleanupOldBackups() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.BACKUP_RETENTION_DAYS);

  sheets.forEach(function(sh) {
    const name = sh.getName();
    if (name.indexOf(CONFIG.BACKUP_PREFIX) !== 0) return;
    const dateStr = name.substring(CONFIG.BACKUP_PREFIX.length); // "yyyy-MM-dd"
    const dt = new Date(dateStr + "T00:00:00");
    if (isNaN(dt.getTime())) return;
    if (dt < cutoff) {
      ss.deleteSheet(sh);
      Logger.log("Deleted old backup: " + name);
    }
  });
}

function listBackups() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const backups = [];
  sheets.forEach(function(sh) {
    const name = sh.getName();
    if (name.indexOf(CONFIG.BACKUP_PREFIX) !== 0) return;
    const dateStr = name.substring(CONFIG.BACKUP_PREFIX.length);
    const lastRow = sh.getLastRow();
    const recordCount = lastRow > 1 ? lastRow - 1 : 0;
    // Get backup creation time from note on A1
    let createdAt = "";
    try {
      const note = sh.getRange(1, 1).getNote();
      const match = note.match(/Backup created: ([\d\-: ]+)/);
      if (match) createdAt = match[1].trim();
    } catch (e) {}
    backups.push({
      name: name,
      date: dateStr,
      recordCount: recordCount,
      createdAt: createdAt || dateStr
    });
  });
  // Sort newest first
  backups.sort(function(a, b) {
    return b.date.localeCompare(a.date);
  });
  return backups;
}

function getBackupData(backupName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(backupName);
  if (!sh) return null;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return data.filter(r => r[0]).map(rowToRecord);
}

function restoreFromBackup(backupName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(backupName);
  if (!sh) throw new Error("Backup sheet not found: " + backupName);

  // First, create a safety backup of current state
  const safetyName = createBackup();
  Logger.log("Safety backup before restore: " + safetyName);

  // Copy data from backup to main sheet
  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    // Empty backup - clear main sheet only
    const mainSheet = getSheet();
    const mainLastRow = mainSheet.getLastRow();
    if (mainLastRow > 1) mainSheet.getRange(2, 1, mainLastRow - 1, HEADERS.length).clearContent();
    return 0;
  }

  const data = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const records = data.filter(r => r[0]).map(rowToRecord);

  // Use replaceAll to swap data
  replaceAll(records);

  return records.length;
}


function getUpcoming(daysBefore) {
  daysBefore = daysBefore || CONFIG.ALERT_DAYS_BEFORE;
  const all = listAll();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = [];
  all.forEach(r => {
    if (!r.end) return;
    // Skip suspended records — ไม่แจ้งเตือนรายการที่ถูกระงับ
    if (r.suspended === true || r.suspended === "true" || r.suspended === "TRUE") return;
    const end = new Date(r.end);
    if (isNaN(end.getTime())) return;
    end.setHours(0, 0, 0, 0);
    const days = Math.round((end - today) / 86400000);
    if (days <= daysBefore) {
      upcoming.push(Object.assign({}, r, { daysRemaining: days }));
    }
  });
  upcoming.sort(function(a, b) { return a.daysRemaining - b.daysRemaining; });
  return upcoming;
}

function dailyNotify() {
  // Master switch: ถ้าปิดการแจ้งเตือนทั้งระบบ ไม่ส่งเมล
  if (!isNotificationsEnabled()) {
    Logger.log("Notifications disabled via master switch — skipping email");
    return;
  }

  const upcoming = getUpcoming();
  if (upcoming.length === 0) return;

  // เลยกำหนด: ส่งทุกวัน
  // ด่วน: ส่งครั้งเดียวตอนเหลือพอดี 15 วัน
  // ใกล้ครบ: ส่งครั้งเดียวตอนเหลือพอดี 30 วัน
  const overdue = upcoming.filter(function(r) { return r.daysRemaining < 0; });
  const urgent = upcoming.filter(function(r) { return r.daysRemaining === 15; });
  const soon = upcoming.filter(function(r) { return r.daysRemaining === 30; });

  // ถ้าไม่มีรายการในวันนั้นเลย → ไม่ส่งเมล (ประหยัด inbox)
  if (overdue.length === 0 && urgent.length === 0 && soon.length === 0) return;

  const totalCount = overdue.length + urgent.length + soon.length;
  const subject = "[แจ้งเตือน] ภาษีรถยนต์ใกล้ครบกำหนด — " + CONFIG.COMPANY_NAME;

  let html = ''
    + '<div style="font-family: Sarabun, Arial, sans-serif; max-width:680px; margin:0 auto; background:#f7f4ec; padding:24px;">'
    + '  <div style="background:linear-gradient(135deg, #0a1f44 0%, #0066b3 100%); color:white; padding:24px; border-radius:12px 12px 0 0; text-align:center;">'
    + '    <h1 style="margin:0; font-size:22px;">🚗 แจ้งเตือนภาษีรถยนต์</h1>'
    + '    <p style="margin:6px 0 0; opacity:0.85; font-size:13px;">' + CONFIG.COMPANY_NAME + '</p>'
    + '  </div>'
    + '  <div style="background:white; padding:24px; border-radius:0 0 12px 12px; border:1px solid #e5e7eb; border-top:none;">'
    + '    <p style="margin:0 0 16px; color:#374151;">'
    + '      ระบบตรวจพบรถยนต์ <strong>' + totalCount + '</strong> รายการที่ต้องดำเนินการ'
    + '    </p>';

  if (overdue.length > 0) {
    html += renderSection("🔴 เลยกำหนด (" + overdue.length + ")", overdue, "#dc2626");
  }
  if (urgent.length > 0) {
    html += renderSection("🟠 ด่วน — เหลือ 15 วัน (" + urgent.length + ")", urgent, "#f59e0b");
  }
  if (soon.length > 0) {
    html += renderSection("🟡 ใกล้ครบ — เหลือ 30 วัน (" + soon.length + ")", soon, "#eab308");
  }

  html += ''
    + '    <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; text-align:center;">'
    + '      ส่งโดยระบบจัดการภาษีรถยนต์ · ' + new Date().toLocaleDateString("th-TH") + ''
    + '    </div>'
    + '  </div>'
    + '</div>';

  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: subject,
    htmlBody: html
  });
}

function renderSection(title, items, color) {
  let html = ''
    + '<div style="margin:20px 0;">'
    + '  <h2 style="margin:0 0 12px; padding:8px 12px; background:' + color + '15; border-left:4px solid ' + color + '; color:' + color + '; font-size:15px;">'
    + '    ' + title
    + '  </h2>'
    + '  <table style="width:100%; border-collapse:collapse; font-size:13px;">'
    + '    <thead>'
    + '      <tr style="background:#f3f4f6;">'
    + '        <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">ทะเบียน</th>'
    + '        <th style="padding:8px; text-align:left; border-bottom:2px solid #e5e7eb;">ประเภท</th>'
    + '        <th style="padding:8px; text-align:right; border-bottom:2px solid #e5e7eb;">วันสิ้นสุด</th>'
    + '        <th style="padding:8px; text-align:right; border-bottom:2px solid #e5e7eb;">คงเหลือ</th>'
    + '      </tr>'
    + '    </thead>'
    + '    <tbody>';
  items.forEach(function(r) {
    const sub = [r.vehicle, r.owner].filter(Boolean).join(" · ");
    const days = r.daysRemaining;
    const remainText = days < 0 ? Math.abs(days) + " วันที่แล้ว" : days === 0 ? "วันนี้" : days + " วัน";
    const endStr = r.end ? new Date(r.end).toLocaleDateString("th-TH") : "—";
    html += ''
      + '<tr>'
      + '  <td style="padding:8px; border-bottom:1px solid #f3f4f6;">'
      + '    <strong>' + r.plate + '</strong>'
      + (sub ? '<div style="font-size:11px; color:#6b7280;">' + sub + '</div>' : '')
      + '  </td>'
      + '  <td style="padding:8px; border-bottom:1px solid #f3f4f6;">' + r.type + '</td>'
      + '  <td style="padding:8px; text-align:right; border-bottom:1px solid #f3f4f6;">' + endStr + '</td>'
      + '  <td style="padding:8px; text-align:right; border-bottom:1px solid #f3f4f6; color:' + color + '; font-weight:600;">' + remainText + '</td>'
      + '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

// ============= MANUAL TEST =============
function testNotification() {
  // ใช้สำหรับทดสอบส่งอีเมลแจ้งเตือน
  dailyNotify();
}

function testSetup() {
  // ทดสอบว่า Sheet ถูกสร้างหรือยัง
  const sh = getSheet();
  Logger.log("Sheet ready: " + sh.getName() + ", rows: " + sh.getLastRow());
}

function testLog() {
  // ทดสอบสร้าง log entry
  appendLog({
    user: "test",
    action: "test",
    plate: "TEST123",
    type: "ทดสอบ",
    detail: "ทดสอบ Activity Log"
  });
  Logger.log("Test log added");
}

function testBackup() {
  // ทดสอบสร้าง backup ทันที
  const name = createBackup();
  Logger.log("Backup created: " + name);
  // List backups
  const backups = listBackups();
  Logger.log("Total backups: " + backups.length);
  backups.forEach(function(b) {
    Logger.log("  " + b.name + " - " + b.recordCount + " records - " + b.createdAt);
  });
}
