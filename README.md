# ระบบจัดการภาษีรถยนต์ — Black Chicken Farm

ระบบติดตามการต่อภาษีรถยนต์, ประกันภัย, และ พ.ร.บ. สำหรับ Sukmart Holding / ฟาร์มไก่ดำ (กาญจนบุรี)

---

## ✨ คุณสมบัติหลัก

### 🔐 ระบบล็อกอินหลายผู้ใช้
- รองรับผู้ใช้หลายคน (pattama, safe, bcf)
- รหัสผ่านเก็บเป็น SHA-256 hash ในโค้ด — รหัสจริงไม่ปรากฏใน GitHub
- บันทึกได้ว่าใครทำอะไรเมื่อไหร่

### 📊 Dashboard ครบถ้วน
- **สรุปรายเดือน** บนสุด — เลือกเดือนได้ พร้อม checklist เอกสาร
- **4 Stat cards**: รถทั้งหมด · เลยกำหนด · ครบใน 30 วัน · ค่าใช้จ่ายปีนี้
- **5 Charts**: Donut สถานะ · Donut ประเภท · Bar บริษัทประกัน · Timeline 12 เดือน · Bar ค่าใช้จ่าย
- **Upcoming list** Top 10 รายการใกล้ครบกำหนด

### 📅 สรุปรายเดือน + Checklist
- Filter เลือกได้ 36 เดือน (ย้อนหลัง 12 + ล่วงหน้า 24 เดือน)
- รวมรถคันเดียวกัน — ดูได้ว่าคันไหนต้องจ่ายอะไรบ้าง
- **Checklist เอกสารอัจฉริยะ** ตามประเภทรถ:
  - รถยนต์: เล่มทะเบียน, สำเนาบัตร, พ.ร.บ., ตรอ. (อายุเกิน 7 ปี)
  - มอเตอร์ไซค์: + ตรอ. (อายุเกิน 5 ปี)
  - รถบรรทุก: + ตรอ.ทุกปี + ใบ GPS
  - ประกัน: + กรมธรรม์เดิม + รูปถ่าย 4 มุม + เลขไมล์
- ติ๊กเอกสารได้ ระบบจำไว้แต่ละเดือน
- **PDF ใบเตรียมเอกสาร** ทั้งเดือน — พิมพ์เอาไปทำงานได้

### 🔄 Quick Renew (ต่ออายุด่วน)
- กดปุ่ม 🔄 ในแต่ละแถว
- เลือก **6 เดือน / 1 ปี / 2 ปี**
- ระบบเลื่อนวันสิ้นสุดให้อัตโนมัติ + บันทึกประวัติ

### 📜 ประวัติการต่ออายุ
- ทุกครั้งที่ต่อจะเก็บไว้ในรายการ
- ดูได้ว่าปีก่อนๆ จ่ายเท่าไหร่ บริษัทไหนปรับขึ้น

### 📎 แนบรูปเอกสาร (Google Drive)
- อัปโหลดได้หลายรูปต่อรายการ
- เก็บใน Google Drive folder กลาง — ทุกเครื่องเห็นเหมือนกัน
- รองรับสูงสุด 10 MB/ไฟล์
- คลิก thumbnail ดูรูปเต็มจอได้

### 📋 Activity Log แบบมีตัวกรอง
- บันทึกทุกการกระทำลง Google Sheets
- 5 Filters: ผู้ใช้, การกระทำ, ค้นหาทะเบียน, ตั้งแต่วันที่, ถึงวันที่
- ส่งออก CSV ได้
- ทุกเครื่องเห็นประวัติเหมือนกัน

### 📄 PDF รายงาน
- **PDF รายคัน** จากปุ่มในแต่ละแถว
- **PDF หลายคันรวม** จากปุ่ม "รายงาน PDF" — เลือกได้: ทั้งหมด/บริษัท/ส่วนตัว/เฉพาะใกล้ครบ
- รองรับภาษาไทยเต็มที่ (ฟอนต์ Sarabun embed)

### 📧 Email แจ้งเตือนอัตโนมัติ
ส่งไปที่ `bcf2546@gmail.com` ตามเงื่อนไข:
| สถานการณ์ | ความถี่ |
|---|---|
| 🔴 เลยกำหนด | ทุกวัน (จนกว่าจะจัดการ) |
| 🟠 เหลือ 15 วันพอดี | ส่งครั้งเดียว |
| 🟡 เหลือ 30 วันพอดี | ส่งครั้งเดียว |

### 🔄 Auto-Sync Real-time
- Sync กับ Google Sheets ทุก 30 วินาทีอัตโนมัติ
- หลายเครื่องเห็นข้อมูลล่าสุดเหมือนกัน
- ออฟไลน์ใช้งานได้ (ข้อมูลแคชใน localStorage)

### 📱 Responsive ทุกอุปกรณ์
- คอมพิวเตอร์, iPad, มือถือ — ทุกแนวตั้งแนวนอน
- เพิ่มเป็นแอปบน Home Screen ได้

---

## 📁 ไฟล์ในระบบ

| ไฟล์ | คำอธิบาย | ขึ้น GitHub |
|---|---|---|
| `index.html` | หน้าหลัก | ✅ |
| `login.html` | หน้าล็อกอิน multi-user | ✅ |
| `app.js` | Logic หลักของระบบ | ✅ |
| `data.js` | ข้อมูลรถเริ่มต้น (75 รายการ, 29 คัน) | ✅ |
| `sarabun-font.js` | ฟอนต์ภาษาไทยสำหรับ PDF (216 KB) | ✅ |
| `logo.png` | โลโก้พื้นหลังโปร่งใส | ✅ |
| `favicon.png`, `favicon.ico` | Favicon | ✅ |
| `apps-script.gs` | โค้ด Google Apps Script | ❌ (รันบน Google) |
| `README.md` | คู่มือ (ไฟล์นี้) | ✅ |

---

## 🚀 วิธีติดตั้ง (Deploy)

### ขั้นที่ 1: อัปไฟล์ขึ้น GitHub
1. สร้าง repository ใหม่ (Public หรือ Private ก็ได้)
2. อัปไฟล์ทั้งหมดยกเว้น `apps-script.gs`
3. Settings → Pages → Source: **Deploy from a branch** → main / (root) → Save
4. รอ 1-2 นาที ได้ URL `https://yourusername.github.io/repo-name/login.html`

### ขั้นที่ 2: ตั้งค่า Google Sheets + Apps Script
1. เปิด https://sheets.google.com → สร้าง spreadsheet ใหม่
2. **Extensions → Apps Script**
3. ลบโค้ดเดิม → คัดลอก `apps-script.gs` ทั้งหมดไปวาง
4. แก้ `CONFIG.NOTIFY_EMAIL` เป็นอีเมลที่ต้องการรับการแจ้งเตือน
5. แก้ `CONFIG.DRIVE_FOLDER_ID` เป็น Folder ID จาก Google Drive
6. กด **Save** (💾)
7. **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
8. **Deploy** → Authorize เข้าสู่บัญชี Google
9. คัดลอก **Web app URL** เก็บไว้

### ขั้นที่ 3: ตั้งค่า Google Drive folder (สำหรับเอกสารแนบ)
1. สร้าง Folder ใน Google Drive
2. คัดลอก **Folder ID** จาก URL: `https://drive.google.com/drive/folders/{FOLDER_ID}`
3. นำ Folder ID ไปใส่ใน `CONFIG.DRIVE_FOLDER_ID` ของ Apps Script
4. รัน function `getDriveFolder` ใน Apps Script editor เพื่อ Authorize Drive permission ครั้งแรก
5. กด **Deploy → Manage deployments → New version → Deploy**

### ขั้นที่ 4: ฝัง Web App URL ในโค้ด
แก้ที่ `app.js` ตอนต้นไฟล์:
```javascript
const DEFAULT_WEBHOOK_URL = "https://script.google.com/macros/s/.../exec";
const DEFAULT_NOTIFY_EMAIL = "your-email@gmail.com";
```
Push ขึ้น GitHub → ทุกเครื่องที่เปิดระบบจะใช้ URL นี้อัตโนมัติ

### ขั้นที่ 5: ตั้งค่า Email Trigger
ที่ Apps Script:
1. คลิกไอคอนนาฬิกา ⏰ ทางซ้าย (Triggers)
2. **+ Add Trigger**
   - Function: `dailyNotify`
   - Event source: `Time-driven`
   - Type: `Day timer`
   - Time: `8am - 9am`
3. **Save**

---

## 👥 ผู้ใช้ในระบบ

| ผู้ใช้ | รหัสผ่าน |
|---|---|
| pattama | `0923` |
| safe | `0936` |
| bcf | `2546` |

### วิธีเปลี่ยนรหัสผ่าน / เพิ่มผู้ใช้
1. คอมพิวต์ SHA-256 hash ที่ https://emn178.github.io/online-tools/sha256/
2. เปิด `login.html` หา `const USERS = [...]`
3. เพิ่ม/แก้ไขบรรทัด:
   ```javascript
   { name: "ชื่อผู้ใช้", hash: "hash-64-ตัวอักษร" }
   ```
4. Push ขึ้น GitHub

---

## ⌨️ Keyboard Shortcuts

- `Ctrl+N` / `Cmd+N` — เพิ่มรายการใหม่
- `Esc` — ปิดหน้าต่าง

---

## 🎨 สถานะรายการ (สี)

| สี | สถานะ | เงื่อนไข |
|---|---|---|
| 🔴 แดง | เลยกำหนด | วันสิ้นสุดผ่านมาแล้ว |
| 🟠 ส้ม | ด่วน | ภายใน 30 วัน |
| 🟡 เหลือง | ใกล้ครบ | 31-90 วัน |
| 🟢 เขียว | ปกติ | มากกว่า 90 วัน |

---

## 📑 Google Sheets — โครงสร้าง

### Sheet 1: `ภาษีรถยนต์` (ข้อมูลหลัก)
17 คอลัมน์: id, category, plate, vehicle, owner, type, company, start, end, amount, month, prevPaid, currPaid, handler, payStatus, notes, updated

### Sheet 2: `Activity Log`
9 คอลัมน์: id, timestamp, date, time, user, action, plate, type, detail

### Sheet 3: `Files`
11 คอลัมน์: id, recordId, plate, fileName, fileId, url, thumbnail, size, mimeType, uploadedAt, uploadedBy

> Sheet ที่ 2 และ 3 ถูกสร้างอัตโนมัติเมื่อมีกิจกรรมแรก

---

## 🛡️ ความปลอดภัย

- ✅ รหัสผ่านเก็บเป็น SHA-256 hash เท่านั้น
- ✅ Web App URL ฝังในโค้ดแต่ Apps Script ตรวจ Authorization ที่ Google
- ✅ ข้อมูลในเครื่องเก็บใน localStorage แยกตามผู้ใช้แต่ละคน
- ✅ Activity log เก็บกลางใน Google Sheets ตรวจสอบย้อนหลังได้

> **หมายเหตุ:** ระบบนี้เป็น client-side authentication เหมาะสำหรับใช้ภายในองค์กร  
> ถ้าต้องการความปลอดภัยระดับสูงขึ้น แนะนำใช้ Cloudflare Access หรือ OAuth

---

## 🐛 Troubleshooting

### "ออฟไลน์" ค้างอยู่ ไม่ sync
- ตรวจสอบที่ `app.js` ว่า `DEFAULT_WEBHOOK_URL` ถูกต้อง
- เปิด Apps Script → Deployments → ตรวจสอบว่า Web App ยัง active

### อัปโหลดรูปไม่สำเร็จ
- รัน function `getDriveFolder` ใน Apps Script เพื่อ Authorize Drive
- ตรวจสอบว่า folder ID ใน CONFIG ถูกต้องและบัญชีมีสิทธิ์ Editor

### Email ไม่ส่ง
- ไปที่ Triggers → ตรวจว่า `dailyNotify` ถูกตั้งไว้
- รัน function `testNotification` ทดสอบส่งทันที

### ข้อมูลไม่ตรงกันระหว่างเครื่อง
- กดปุ่ม **🔄 โหลดใหม่** ใน Settings → ดึงข้อมูลจาก Google Sheets
- หรือรอ 30 วินาทีให้ auto-sync

### หลัง update โค้ดแล้วยังเห็นเวอร์ชันเก่า
- กด **Ctrl+Shift+R** (Mac: **Cmd+Shift+R**) เพื่อ hard reload เบราว์เซอร์

---

## 📞 ติดต่อ

Sukmart Holding · Black Chicken Farm  
ฟาร์มไก่ดำ (กาญจนบุรี) · Since 2003
