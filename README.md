# ระบบจัดการภาษีรถยนต์ — Black Chicken Farm

ระบบติดตามการต่อภาษีรถยนต์, ประกันภัย, และ พ.ร.บ. สำหรับ Sukmart Holding / ฟาร์มไก่ดำ (กาญจนบุรี)

## คุณสมบัติ

- 🔐 **หน้าล็อกอินด้วย SHA-256** — รหัสผ่านไม่ปรากฏในซอร์สโค้ด
- 📊 **Dashboard สวยๆ** — กราฟ Donut, Bar, Line, Timeline 12 เดือน, Upcoming list
- 📋 **แท็บแยก** — Dashboard กับ รายการทั้งหมด สลับได้ง่าย
- 🚗 **รองรับรถ ~29 คัน** ทั้งบริษัทและส่วนตัว พร้อมข้อมูลครบจาก Excel
- 📋 **ฟอร์มเพิ่ม/แก้ไข** ครบทุกฟิลด์
- 🔍 **ค้นหาและกรอง** ตามทะเบียน, ประเภท, สถานะ, หมวด
- 📄 **สร้างรายงาน PDF** ภาษาไทยสมบูรณ์ ทั้งรายคันและหลายคันรวม
- 📧 **แจ้งเตือนผ่าน Email อัตโนมัติ** ผ่าน Google Apps Script (รายวัน)
- 🔄 **ซิงค์อัตโนมัติทุก 30 วินาที** กับ Google Sheets
- 📤 **ส่งออก CSV** สำหรับสำรองข้อมูล
- 📱 **รองรับมือถือ** Responsive design สมบูรณ์
- 🇹🇭 **ภาษาไทยเต็มระบบ** ฟอนต์ Noto Serif Thai + Sarabun

## ไฟล์ในระบบ

| ไฟล์ | คำอธิบาย |
|---|---|
| `index.html` | หน้าหลัก (Dashboard + ตาราง + ฟอร์ม) |
| `login.html` | หน้าล็อกอิน |
| `app.js` | Logic ของระบบ |
| `data.js` | ข้อมูลรถเริ่มต้น (จาก Excel) |
| `sarabun-font.js` | ฟอนต์ภาษาไทยสำหรับ PDF (216 KB, embed base64) |
| `logo.png` | โลโก้ Black Chicken Farm พื้นหลังโปร่งใส (500×500) |
| `favicon.png` | Favicon 32×32 |
| `favicon.ico` | Favicon multi-size |
| `apps-script.gs` | โค้ด Google Apps Script (สำหรับ Sheets + Email) |

---

## วิธีติดตั้ง (Deploy)

### ขั้นที่ 1: อัปโหลดขึ้น GitHub

1. สร้าง repository ใหม่ใน GitHub (เช่น `vehicle-tax-tracker` — ตั้งเป็น **Public** หรือ Private ก็ได้)
2. อัปโหลดไฟล์ทั้งหมดเหล่านี้ไปที่ root ของ repo:
   - `index.html`, `login.html`
   - `app.js`, `data.js`
   - `logo.png`, `favicon.png`, `favicon.ico`
3. **ห้ามอัปโหลด** `apps-script.gs` ขึ้น GitHub (ไม่จำเป็น เพราะรันบน Google เอง)

### ขั้นที่ 2: เปิด GitHub Pages

1. ไปที่ **Settings → Pages**
2. Source: เลือก **Deploy from a branch**
3. Branch: เลือก **main** / **(root)** → Save
4. รอประมาณ 1-2 นาที จะได้ URL เช่น `https://yourusername.github.io/vehicle-tax-tracker/login.html`

### ขั้นที่ 3: ตั้งค่า Google Sheets + Apps Script

1. เปิด https://sheets.google.com แล้วสร้างไฟล์ใหม่ ตั้งชื่อเช่น `Vehicle Tax Tracker`
2. คลิก **Extensions → Apps Script**
3. ลบโค้ดเดิมทั้งหมด แล้วคัดลอกเนื้อหาไฟล์ `apps-script.gs` ไปวาง
4. แก้ไข `CONFIG.NOTIFY_EMAIL` เป็นอีเมลที่ต้องการรับการแจ้งเตือน
5. คลิก **Save** (💾)
6. คลิก **Deploy → New deployment**
   - Type: **Web app**
   - Description: `Vehicle Tax Tracker API`
   - Execute as: **Me**
   - Who has access: **Anyone**
7. คลิก **Deploy** → Authorize เข้าสู่บัญชี Google
8. **คัดลอก Web app URL** (เช่น `https://script.google.com/macros/s/AKfycb.../exec`)

### ขั้นที่ 4: เชื่อมต่อระบบกับ Google Sheets

1. เข้าระบบที่ `https://yourusername.github.io/vehicle-tax-tracker/login.html`
2. ใส่รหัสผ่าน: `ID npjsk PS 0923` (รหัสที่กำหนดไว้)
3. กดปุ่ม **⚙ ตั้งค่า** ที่มุมขวาบน
4. วาง Web App URL ที่คัดลอกไว้
5. ใส่อีเมลรับการแจ้งเตือน
6. กด **บันทึกการตั้งค่า**
7. กด **ทดสอบเชื่อมต่อ** เพื่อยืนยันการเชื่อมต่อ
8. กด **ส่งข้อมูลขึ้น Sheets** เพื่ออัปโหลดข้อมูลเริ่มต้นทั้งหมด

### ขั้นที่ 5: ตั้งค่า Trigger สำหรับ Email แจ้งเตือนรายวัน

1. กลับไปที่ Apps Script
2. คลิก **Triggers** (ไอคอนนาฬิกา ⏰ ที่แถบซ้าย)
3. คลิก **+ Add Trigger**
4. ตั้งค่าดังนี้:
   - Function: `dailyNotify`
   - Event source: `Time-driven`
   - Type of time-based trigger: `Day timer`
   - Time of day: `8am - 9am` (หรือเวลาที่ต้องการ)
5. กด **Save**

> ระบบจะส่งอีเมลทุกวันแจ้งเตือนรายการที่ใกล้ครบกำหนดภายใน 30 วัน

---

## การใช้งาน

### เข้าสู่ระบบ
รหัสผ่าน: `ID npjsk PS 0923` (เก็บเป็น SHA-256 hash ในโค้ด ไม่สามารถถอดกลับได้)

### Tabs
- **ทั้งหมด** — รายการรถทั้งหมด
- **บริษัท** — รถของบริษัท
- **ส่วนตัว** — รถส่วนตัวของครอบครัว/พนักงาน

### Status (สี)
| สถานะ | ความหมาย |
|---|---|
| 🔴 **เลยกำหนด** | วันสิ้นสุดผ่านมาแล้ว |
| 🟠 **ด่วน** | ภายใน 30 วัน |
| 🟡 **ใกล้ครบ** | 31-90 วัน |
| 🟢 **ปกติ** | มากกว่า 90 วัน |

### Keyboard shortcuts
- `Ctrl+N` / `Cmd+N` — เพิ่มรายการใหม่
- `Esc` — ปิดหน้าต่าง

---

## การเปลี่ยนรหัสผ่าน

1. เปิด terminal บนเครื่อง รันคำสั่ง:
   ```bash
   echo -n "รหัสผ่านใหม่ของคุณ" | shasum -a 256
   ```
   (หรือบน Windows ใช้ PowerShell):
   ```powershell
   $bytes = [System.Text.Encoding]::UTF8.GetBytes("รหัสผ่านใหม่ของคุณ")
   $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
   ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
   ```
2. คัดลอก hash ที่ได้ (64 ตัวอักษร)
3. เปิดไฟล์ `login.html` หาบรรทัด:
   ```js
   const PW_HASH = "b51721f1d9517aadf7445c8734754f71a2b90d687c811a1b7473ace208684456";
   ```
4. แทนที่ด้วย hash ใหม่
5. Commit และ push ขึ้น GitHub

---

## ความปลอดภัย

- ✅ รหัสผ่านเก็บเป็น SHA-256 hash เท่านั้น — ไม่มีรหัสจริงในซอร์ส GitHub
- ✅ ข้อมูลในเครื่องเก็บใน `localStorage` ของผู้ใช้แต่ละคน
- ✅ การซิงค์กับ Google Sheets ผ่าน Apps Script Web App ที่ Authorize ไว้
- ⚠️ **ข้อจำกัด**: นี่เป็น client-side authentication เหมาะสำหรับใช้ภายในเท่านั้น  
  หากต้องการความปลอดภัยระดับสูงขึ้น แนะนำใช้ Cloudflare Access หรือ OAuth

---

## โครงสร้างข้อมูล

แต่ละรายการมีฟิลด์:

| ฟิลด์ | ประเภท | ตัวอย่าง |
|---|---|---|
| `id` | string | `c-bm5999-tax` |
| `category` | `company` หรือ `personal` | `company` |
| `plate` | ทะเบียนรถ | `บม5999 กจ` |
| `vehicle` | ประเภทรถ | `ISUZU ตู้เย็น` |
| `owner` | เจ้าของ (สำหรับส่วนตัว) | `ปัทมา` |
| `type` | ประเภท | `ต่อภาษี` / `ประกันภัย ป.1` / `พ.ร.บ.` |
| `company` | บริษัทประกัน/หน่วยงาน | `วิริยะ` |
| `start` | วันที่เริ่มต้น (ISO) | `2025-02-09` |
| `end` | วันที่สิ้นสุด (ISO) | `2026-02-09` |
| `amount` | ยอดเงิน (บาท) | `8652.56` |
| `month`, `prevPaid`, `currPaid`, `handler`, `payStatus`, `notes` | ข้อมูลเสริม | |

---

## ติดต่อ / Support

Sukmart Holding · Black Chicken Farm  
ฟาร์มไก่ดำ (กาญจนบุรี) · Since 2003
