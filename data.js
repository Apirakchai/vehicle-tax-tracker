// ข้อมูลเริ่มต้นสกัดจาก Excel ภาษีรถยนต์ — Black Chicken Farm / Sukmart Holding
// Format: หนึ่งรายการต่อ ทะเบียน + ประเภท (ต่อภาษี / ประกันภัย ป.1 / พ.ร.บ.)
// id: ใช้รูปแบบ company-PLATE-TYPE หรือ personal-PLATE-TYPE
// dates: ISO yyyy-mm-dd

window.SEED_DATA = [
  // ============= บริษัท =============

  // บม5999 กจ
  { id:"c-bm5999-tax", category:"company", plate:"บม5999 กจ", vehicle:"", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-02-28", amount:1050, month:"กุมภาพันธ์", prevPaid:"2025-02-18", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-bm5999-ins", category:"company", plate:"บม5999 กจ", vehicle:"", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-02-09", end:"2026-02-09", amount:8652.56, month:"กุมภาพันธ์", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-bm5999-prb", category:"company", plate:"บม5999 กจ", vehicle:"", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-02-09", end:"2026-02-09", amount:958.24, month:"กุมภาพันธ์", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 2กล3777 กทม
  { id:"c-2kl3777-tax", category:"company", plate:"2กล3777 กทม", vehicle:"", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-02-24", amount:6896, month:"กุมภาพันธ์", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-2kl3777-ins", category:"company", plate:"2กล3777 กทม", vehicle:"", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-03-28", end:"2026-03-28", amount:15853.46, month:"มีนาคม", prevPaid:"2025-03-07", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงกับต่อภาษี" },
  { id:"c-2kl3777-prb", category:"company", plate:"2กล3777 กทม", vehicle:"", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-03-28", end:"2026-03-28", amount:639.18, month:"มีนาคม", prevPaid:"2025-03-07", currPaid:"", handler:"", payStatus:"", notes:"" },

  // บล1234 กจ — ISUZU ตู้เย็น
  { id:"c-bl1234-tax", category:"company", plate:"บล1234 กจ", vehicle:"ISUZU ตู้เย็น", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-03-23", amount:1650, month:"มีนาคม", prevPaid:"2025-03-21", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-bl1234-ins", category:"company", plate:"บล1234 กจ", vehicle:"ISUZU ตู้เย็น", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-03-23", end:"2026-03-23", amount:14072.59, month:"มีนาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-bl1234-prb", category:"company", plate:"บล1234 กจ", vehicle:"ISUZU ตู้เย็น", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-03-23", end:"2026-03-23", amount:958.24, month:"มีนาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 81-3279 กจ — รถ 6 ล้อ
  { id:"c-81-3279-tax", category:"company", plate:"81-3279 กจ", vehicle:"รถ 6 ล้อ", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-03-31", amount:2200, month:"มีนาคม", prevPaid:"2025-03-21", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-81-3279-ins", category:"company", plate:"81-3279 กจ", vehicle:"รถ 6 ล้อ", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-03-31", end:"2026-03-31", amount:4654.02, month:"มีนาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-81-3279-prb", category:"company", plate:"81-3279 กจ", vehicle:"รถ 6 ล้อ", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-03-31", end:"2026-03-31", amount:1394.96, month:"มีนาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 82-9933 กจ — รถ 6 ล้อ ห้องเย็น
  { id:"c-82-9933-tax", category:"company", plate:"82-9933 กจ", vehicle:"รถ 6 ล้อ ห้องเย็น", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-03-31", amount:0, month:"มีนาคม", prevPaid:"2025-03-21", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-82-9933-ins", category:"company", plate:"82-9933 กจ", vehicle:"รถ 6 ล้อ ห้องเย็น", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-03-31", end:"2026-03-31", amount:14035.13, month:"มีนาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-82-9933-prb", category:"company", plate:"82-9933 กจ", vehicle:"รถ 6 ล้อ ห้องเย็น", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-03-31", end:"2026-03-31", amount:1394.96, month:"มีนาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // บร4888 กจ — Toyota
  { id:"c-br4888-tax", category:"company", plate:"บร4888 กจ", vehicle:"Toyota", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-04-27", amount:1050, month:"เมษายน", prevPaid:"2025-04-23", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-br4888-ins", category:"company", plate:"บร4888 กจ", vehicle:"Toyota", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-04-19", end:"2026-02-19", amount:0, month:"เมษายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-br4888-prb", category:"company", plate:"บร4888 กจ", vehicle:"Toyota", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-04-19", end:"2026-04-19", amount:0, month:"เมษายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // ตห2394 กทม
  { id:"c-th2394-tax", category:"company", plate:"ตห2394 กทม", vehicle:"", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-07-06", amount:1050, month:"กรกฎาคม", prevPaid:"2025-07-02", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงต่อภาษี / พรบ.อย่างเดียว" },
  { id:"c-th2394-prb", category:"company", plate:"ตห2394 กทม", vehicle:"", owner:"", type:"พ.ร.บ.", company:"ไทยไพบูลย์", start:"2025-04-04", end:"2026-04-04", amount:967.28, month:"เมษายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // บม9555 กจ — Toyota
  { id:"c-bm9555-tax", category:"company", plate:"บม9555 กจ", vehicle:"Toyota", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-04-05", amount:1050, month:"เมษายน", prevPaid:"2025-04-04", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงกับต่อภาษี" },
  { id:"c-bm9555-ins", category:"company", plate:"บม9555 กจ", vehicle:"Toyota", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-06-05", end:"2026-06-05", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-bm9555-prb", category:"company", plate:"บม9555 กจ", vehicle:"Toyota", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-06-05", end:"2026-06-05", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 2ขณ8888 กทม — TESLA 3 PFM แม่
  { id:"c-2kn8888-tax", category:"company", plate:"2ขณ8888 กทม", vehicle:"TESLA 3 PFM (แม่)", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-10-03", amount:3200, month:"ตุลาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-2kn8888-ins", category:"company", plate:"2ขณ8888 กทม", vehicle:"TESLA 3 PFM (แม่)", owner:"", type:"ประกันภัย ป.1", company:"ธนชาติ", start:"2025-07-06", end:"2026-07-06", amount:0, month:"กรกฎาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงกับต่อภาษี" },
  { id:"c-2kn8888-prb", category:"company", plate:"2ขณ8888 กทม", vehicle:"TESLA 3 PFM (แม่)", owner:"", type:"พ.ร.บ.", company:"ธนชาติ", start:"2025-07-06", end:"2026-07-06", amount:0, month:"กรกฎาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // บบ 8999 กจ
  { id:"c-bb8999-tax", category:"company", plate:"บบ 8999 กจ", vehicle:"", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-08-11", amount:1050, month:"สิงหาคม", prevPaid:"2025-08-01", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงกับต่อภาษี" },
  { id:"c-bb8999-ins", category:"company", plate:"บบ 8999 กจ", vehicle:"", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-07-21", end:"2026-07-21", amount:0, month:"กรกฎาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-bb8999-prb", category:"company", plate:"บบ 8999 กจ", vehicle:"", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-07-21", end:"2026-07-21", amount:0, month:"กรกฎาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 5กญ3777 กทม — MG ZS EV
  { id:"c-5kn3777-tax", category:"company", plate:"5กญ3777 กทม", vehicle:"MG ZS EV", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-10-21", amount:1600, month:"ตุลาคม", prevPaid:"2025-10-07", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงกับต่อภาษี" },
  { id:"c-5kn3777-ins", category:"company", plate:"5กญ3777 กทม", vehicle:"MG ZS EV", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-08-25", end:"2026-08-25", amount:0, month:"สิงหาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-5kn3777-prb", category:"company", plate:"5กญ3777 กทม", vehicle:"MG ZS EV", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-08-25", end:"2026-08-25", amount:0, month:"สิงหาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // บบ7632 กจ
  { id:"c-bb7632-tax", category:"company", plate:"บบ7632 กจ", vehicle:"", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-11-04", amount:1350, month:"พฤศจิกายน", prevPaid:"2025-10-17", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงกับต่อภาษี" },
  { id:"c-bb7632-ins", category:"company", plate:"บบ7632 กจ", vehicle:"", owner:"", type:"ประกันภัย ป.1", company:"", start:"2025-09-13", end:"2026-09-13", amount:0, month:"กันยายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-bb7632-prb", category:"company", plate:"บบ7632 กจ", vehicle:"", owner:"", type:"พ.ร.บ.", company:"", start:"2025-09-13", end:"2026-09-13", amount:0, month:"กันยายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 82-4701 กจ — สิบล้อ เบอร์ 1
  { id:"c-82-4701-tax", category:"company", plate:"82-4701 กจ", vehicle:"สิบล้อ เบอร์ 1", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-09-30", amount:3600, month:"กันยายน", prevPaid:"2025-10-15", currPaid:"", handler:"", payStatus:"", notes:"พรบ.อย่างเดียว" },
  { id:"c-82-4701-prb", category:"company", plate:"82-4701 กจ", vehicle:"สิบล้อ เบอร์ 1", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-09-30", end:"2026-09-30", amount:0, month:"กันยายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 82-4702 กจ — สิบล้อ เบอร์ 2
  { id:"c-82-4702-tax", category:"company", plate:"82-4702 กจ", vehicle:"สิบล้อ เบอร์ 2", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-09-30", amount:3600, month:"กันยายน", prevPaid:"2025-10-15", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-82-4702-ins", category:"company", plate:"82-4702 กจ", vehicle:"สิบล้อ เบอร์ 2", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-09-08", end:"2026-09-08", amount:0, month:"กันยายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-82-4702-prb", category:"company", plate:"82-4702 กจ", vehicle:"สิบล้อ เบอร์ 2", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-09-08", end:"2026-09-08", amount:0, month:"กันยายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // ตฬ8231 กทม
  { id:"c-tl8231-tax", category:"company", plate:"ตฬ8231 กทม", vehicle:"", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-09-04", amount:1050, month:"กันยายน", prevPaid:"2025-06-14", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงต่อภาษี / พรบ.อย่างเดียว" },
  { id:"c-tl8231-prb", category:"company", plate:"ตฬ8231 กทม", vehicle:"", owner:"", type:"พ.ร.บ.", company:"Tokio Marine", start:"2025-10-25", end:"2026-10-25", amount:1310.75, month:"ตุลาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // สน3777 กทม — BENZ A CLASS
  { id:"c-sn3777-tax", category:"company", plate:"สน3777 กทม", vehicle:"BENZ A CLASS", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-01-03", amount:3036, month:"มกราคม", prevPaid:"2024-12-24", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงกับต่อภาษี" },
  { id:"c-sn3777-ins", category:"company", plate:"สน3777 กทม", vehicle:"BENZ A CLASS", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-11-30", end:"2026-11-30", amount:0, month:"พฤศจิกายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-sn3777-prb", category:"company", plate:"สน3777 กทม", vehicle:"BENZ A CLASS", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-11-30", end:"2026-11-30", amount:0, month:"พฤศจิกายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 1กฌ 99 กทม — มอเตอร์ไซค์
  { id:"c-1k99-tax", category:"company", plate:"1กฌ 99 กทม", vehicle:"มอเตอร์ไซค์", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2025-11-16", amount:100, month:"พฤศจิกายน", prevPaid:"2024-10-31", currPaid:"", handler:"", payStatus:"", notes:"พรบ.อย่างเดียว" },
  { id:"c-1k99-prb", category:"company", plate:"1กฌ 99 กทม", vehicle:"มอเตอร์ไซค์", owner:"", type:"พ.ร.บ.", company:"บ.กลาง", start:"2025-11-20", end:"2026-11-20", amount:0, month:"พฤศจิกายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // บล123 กจ — 4 ล้อ ตู้เย็น
  { id:"c-bl123-tax", category:"company", plate:"บล123 กจ", vehicle:"4 ล้อ ตู้เย็น", owner:"", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-10-07", amount:1350, month:"ตุลาคม", prevPaid:"2025-10-08", currPaid:"", handler:"", payStatus:"", notes:"รอบไม่ตรงกับต่อภาษี" },
  { id:"c-bl123-ins", category:"company", plate:"บล123 กจ", vehicle:"4 ล้อ ตู้เย็น", owner:"", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-11-11", end:"2026-11-11", amount:0, month:"พฤศจิกายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"c-bl123-prb", category:"company", plate:"บล123 กจ", vehicle:"4 ล้อ ตู้เย็น", owner:"", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-11-11", end:"2026-11-11", amount:0, month:"พฤศจิกายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // ============= ส่วนตัว =============

  // ถบ3777 กทม — NISSAN NAVARA — ปัทมา
  { id:"p-tb3777-tax", category:"personal", plate:"ถบ3777 กทม", vehicle:"NISSAN NAVARA", owner:"ปัทมา", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-06-15", amount:1050, month:"มิถุนายน", prevPaid:"2025-06-13", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-tb3777-ins", category:"personal", plate:"ถบ3777 กทม", vehicle:"NISSAN NAVARA", owner:"ปัทมา", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-02-18", end:"2026-02-18", amount:0, month:"กุมภาพันธ์", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-tb3777-prb", category:"personal", plate:"ถบ3777 กทม", vehicle:"NISSAN NAVARA", owner:"ปัทมา", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-02-18", end:"2026-02-18", amount:0, month:"กุมภาพันธ์", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 4กช 183 กทม — BENZ E200 — ฤทธิชัย
  { id:"p-4k183-ins", category:"personal", plate:"4กช 183 กทม", vehicle:"BENZ E200", owner:"ฤทธิชัย", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-04-01", end:"2026-04-01", amount:21408.84, month:"เมษายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-4k183-prb", category:"personal", plate:"4กช 183 กทม", vehicle:"BENZ E200", owner:"ฤทธิชัย", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-04-01", end:"2026-04-01", amount:645.21, month:"เมษายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // ขงค899 กจ — มอเตอร์ไซค์ HONDA — นิคม
  { id:"p-khngk899-tax", category:"personal", plate:"ขงค899 กจ", vehicle:"มอเตอร์ไซค์ HONDA", owner:"นิคม", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-04-19", amount:100, month:"เมษายน", prevPaid:"2025-03-28", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 7กญ3939 กทม — TESLA 3 LR — อลิส
  { id:"p-7k3939-ins", category:"personal", plate:"7กญ3939 กทม", vehicle:"TESLA 3 LR", owner:"อลิส", type:"ประกันภัย ป.1", company:"", start:"2025-06-05", end:"2026-06-05", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-7k3939-prb", category:"personal", plate:"7กญ3939 กทม", vehicle:"TESLA 3 LR", owner:"อลิส", type:"พ.ร.บ.", company:"", start:"2025-06-05", end:"2026-06-05", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 1กข8888 กทม — TESLA 3 PFM — โชติวิทย์
  { id:"p-1kk8888-tax", category:"personal", plate:"1กข8888 กทม", vehicle:"TESLA 3 PFM", owner:"โชติวิทย์", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-06-05", amount:1600, month:"มิถุนายน", prevPaid:"2025-06-26", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-1kk8888-ins", category:"personal", plate:"1กข8888 กทม", vehicle:"TESLA 3 PFM", owner:"โชติวิทย์", type:"ประกันภัย ป.1", company:"LMG", start:"2025-06-11", end:"2026-06-11", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-1kk8888-prb", category:"personal", plate:"1กข8888 กทม", vehicle:"TESLA 3 PFM", owner:"โชติวิทย์", type:"พ.ร.บ.", company:"LMG", start:"2025-06-11", end:"2026-06-11", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 1ขก9999 กทม — TESLA 3 PFM — อภิรักษ์ชัย
  { id:"p-1kk9999-tax", category:"personal", plate:"1ขก9999 กทม", vehicle:"TESLA 3 PFM", owner:"อภิรักษ์ชัย", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-06-05", amount:1600, month:"มิถุนายน", prevPaid:"2025-06-26", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-1kk9999-ins", category:"personal", plate:"1ขก9999 กทม", vehicle:"TESLA 3 PFM", owner:"อภิรักษ์ชัย", type:"ประกันภัย ป.1", company:"LMG", start:"2025-06-11", end:"2026-06-11", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-1kk9999-prb", category:"personal", plate:"1ขก9999 กทม", vehicle:"TESLA 3 PFM", owner:"อภิรักษ์ชัย", type:"พ.ร.บ.", company:"LMG", start:"2025-06-11", end:"2026-06-11", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // บบ3777 กจ — ISUZU SPARK — เกรียงไกร
  { id:"p-bb3777-ins", category:"personal", plate:"บบ3777 กจ", vehicle:"ISUZU SPARK", owner:"เกรียงไกร", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-06-24", end:"2026-06-24", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-bb3777-prb", category:"personal", plate:"บบ3777 กจ", vehicle:"ISUZU SPARK", owner:"เกรียงไกร", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-06-24", end:"2026-06-24", amount:0, month:"มิถุนายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // บร6899 กจ — ISUZU — ยศวีร์
  { id:"p-br6899-tax", category:"personal", plate:"บร6899 กจ", vehicle:"ISUZU", owner:"ยศวีร์", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2026-08-11", amount:1050, month:"สิงหาคม", prevPaid:"2025-08-01", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-br6899-ins", category:"personal", plate:"บร6899 กจ", vehicle:"ISUZU", owner:"ยศวีร์", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-08-03", end:"2026-08-03", amount:0, month:"สิงหาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-br6899-prb", category:"personal", plate:"บร6899 กจ", vehicle:"ISUZU", owner:"ยศวีร์", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-08-03", end:"2026-08-03", amount:0, month:"สิงหาคม", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 1กก183 กทม — BENZ C200 — สุภาพร
  { id:"p-1kk183-ins", category:"personal", plate:"1กก183 กทม", vehicle:"BENZ C200", owner:"สุภาพร", type:"ประกันภัย ป.1", company:"วิริยะ", start:"2025-08-27", end:"2026-08-27", amount:12303, month:"สิงหาคม", prevPaid:"2025-08-01", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-1kk183-prb", category:"personal", plate:"1กก183 กทม", vehicle:"BENZ C200", owner:"สุภาพร", type:"พ.ร.บ.", company:"วิริยะ", start:"2025-08-27", end:"2026-08-27", amount:645.21, month:"สิงหาคม", prevPaid:"2025-08-01", currPaid:"", handler:"", payStatus:"", notes:"" },

  // ขนฉ377 กจ — มอเตอร์ไซค์ SUZUKI — นิคม
  { id:"p-khncho377-tax", category:"personal", plate:"ขนฉ377 กจ", vehicle:"มอเตอร์ไซค์ SUZUKI", owner:"นิคม", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2024-11-20", amount:100, month:"พฤศจิกายน", prevPaid:"2023-11-14", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-khncho377-prb", category:"personal", plate:"ขนฉ377 กจ", vehicle:"มอเตอร์ไซค์ SUZUKI", owner:"นิคม", type:"พ.ร.บ.", company:"บ.กลาง", start:"2023-11-14", end:"2024-11-14", amount:323.14, month:"พฤศจิกายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },

  // 1กฐ2 กจ — มอเตอร์ไซค์ SUZUKI — นิคม
  { id:"p-1ko2-tax", category:"personal", plate:"1กฐ2 กจ", vehicle:"มอเตอร์ไซค์ SUZUKI", owner:"นิคม", type:"ต่อภาษี", company:"กรมขนส่ง", start:"", end:"2024-08-08", amount:100, month:"สิงหาคม", prevPaid:"2023-11-14", currPaid:"", handler:"", payStatus:"", notes:"" },
  { id:"p-1ko2-prb", category:"personal", plate:"1กฐ2 กจ", vehicle:"มอเตอร์ไซค์ SUZUKI", owner:"นิคม", type:"พ.ร.บ.", company:"บ.กลาง", start:"2023-11-14", end:"2024-11-14", amount:323.14, month:"พฤศจิกายน", prevPaid:"", currPaid:"", handler:"", payStatus:"", notes:"" },
];
