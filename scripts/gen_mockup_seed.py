#!/usr/bin/env python3
# Generates supabase/seed_mockup_100.sql — ~100 realistic construction /
# hotel-maintenance materials, Thai-named, grouped into the app's existing
# category set plus five new categories (Electrical, Sanitary Ware, Paint,
# Lumber, Cleaning Supplies) that round out a store serving both a
# construction site and a hotel facilities department.
#
# sku_code prefixes are deliberately different from the schema.sql seed
# (CEM/REB/SND/PIP/NAI) so this can run alongside it with zero collisions.

import sys

# (sku_code, name, category, base_uom, alt_uom, conversion_factor, min_threshold)
ITEMS = [
    # ---- CMT: ปูนซีเมนต์และปูนสำเร็จรูป (Cement) ----
    ("CMT-001", "ปูนซีเมนต์ปอร์ตแลนด์ประเภท 1 ถุง 50 กก.", "Cement", "ถุง", "ตัน", 20, 200),
    ("CMT-002", "ปูนซีเมนต์ผสม ตราเสือ 50 กก.", "Cement", "ถุง", None, None, 150),
    ("CMT-003", "ปูนฉาบสำเร็จรูป", "Cement", "ถุง", None, None, 100),
    ("CMT-004", "ปูนก่อสำเร็จรูป", "Cement", "ถุง", None, None, 100),
    ("CMT-005", "ปูนกาวซีเมนต์ (กาวติดกระเบื้อง)", "Cement", "ถุง", None, None, 80),
    ("CMT-006", "ปูนขาว", "Cement", "ถุง", None, None, 40),
    ("CMT-007", "ปูนยาแนวกระเบื้อง", "Cement", "ถุง", None, None, 60),
    ("CMT-008", "คอนกรีตผสมเสร็จบรรจุถุง", "Cement", "ถุง", None, None, 100),
    ("CMT-009", "น้ำยาผสมคอนกรีต", "Cement", "แกลลอน", None, None, 20),
    ("CMT-010", "ปูนซ่อมโครงสร้าง (Non-Shrink Grout)", "Cement", "ถุง", None, None, 30),

    # ---- STL: เหล็กและโครงสร้างเหล็ก (Steel) ----
    ("STL-001", "เหล็กเส้นกลม RB6 มม.", "Steel", "เส้น", None, None, 200),
    ("STL-002", "เหล็กเส้นกลม RB9 มม.", "Steel", "เส้น", None, None, 200),
    ("STL-003", "เหล็กข้ออ้อย DB12 มม.", "Steel", "เส้น", "มัด", 10, 300),
    ("STL-004", "เหล็กข้ออ้อย DB16 มม.", "Steel", "เส้น", "มัด", 10, 200),
    ("STL-005", "เหล็กข้ออ้อย DB20 มม.", "Steel", "เส้น", "มัด", 10, 150),
    ("STL-006", "ตะแกรงไวร์เมช 6 มม.", "Steel", "แผ่น", None, None, 50),
    ("STL-007", "เหล็กฉาก 1 นิ้ว", "Steel", "เส้น", None, None, 60),
    ("STL-008", "เหล็กกล่องสี่เหลี่ยม 1x1 นิ้ว", "Steel", "เส้น", None, None, 60),
    ("STL-009", "เหล็กรางน้ำ C-Channel", "Steel", "เส้น", None, None, 40),
    ("STL-010", "ลวดผูกเหล็ก", "Steel", "ม้วน", None, None, 30),
    ("STL-011", "สกรูยิงปูน (ตะปูเกลียวปูน)", "Steel", "กล่อง", None, None, 40),
    ("STL-012", "แผ่นเหล็กรีดลอน (เมทัลชีท)", "Steel", "แผ่น", None, None, 50),

    # ---- AGG: ทราย หิน วัสดุมวลรวม (Aggregate) ----
    ("AGG-001", "ทรายหยาบ", "Aggregate", "ลบ.ม.", None, None, 15),
    ("AGG-002", "ทรายละเอียด", "Aggregate", "ลบ.ม.", None, None, 15),
    ("AGG-003", "ทรายถม", "Aggregate", "ลบ.ม.", None, None, 20),
    ("AGG-004", "หินคลุก", "Aggregate", "ลบ.ม.", None, None, 20),
    ("AGG-005", "หิน 3/4", "Aggregate", "ลบ.ม.", None, None, 15),
    ("AGG-006", "ลูกรัง", "Aggregate", "ลบ.ม.", None, None, 20),
    ("AGG-007", "กรวดล้าง", "Aggregate", "ลบ.ม.", None, None, 10),
    ("AGG-008", "ดินถม", "Aggregate", "ลบ.ม.", None, None, 20),

    # ---- PVC: ท่อและอุปกรณ์ประปา (Pipe & Fittings) ----
    ("PVC-001", "ท่อ PVC ขนาด 1/2 นิ้ว ชั้น 13.5", "Pipe & Fittings", "เส้น", "แพ็ค", 10, 60),
    ("PVC-002", "ท่อ PVC ขนาด 4 นิ้ว ชั้น 8.5", "Pipe & Fittings", "เส้น", None, None, 40),
    ("PVC-003", "ท่อ PVC ขนาด 6 นิ้ว ชั้น 8.5", "Pipe & Fittings", "เส้น", None, None, 20),
    ("PVC-004", "ท่อ PPR ขนาด 1/2 นิ้ว (น้ำร้อน)", "Pipe & Fittings", "เส้น", None, None, 30),
    ("PVC-005", "ข้องอ PVC 90 องศา 1/2 นิ้ว", "Pipe & Fittings", "ชิ้น", None, None, 100),
    ("PVC-006", "ข้อต่อตรง PVC 4 นิ้ว", "Pipe & Fittings", "ชิ้น", None, None, 50),
    ("PVC-007", "สามทาง PVC 1/2 นิ้ว", "Pipe & Fittings", "ชิ้น", None, None, 60),
    ("PVC-008", "วาล์วน้ำ (Gate Valve) 1/2 นิ้ว", "Pipe & Fittings", "ตัว", None, None, 20),
    ("PVC-009", "วาล์วกันกลับ (Check Valve) 1 นิ้ว", "Pipe & Fittings", "ตัว", None, None, 15),
    ("PVC-010", "กาวทาท่อ PVC", "Pipe & Fittings", "กระป๋อง", None, None, 20),
    ("PVC-011", "เทปพันเกลียว", "Pipe & Fittings", "ม้วน", None, None, 100),
    ("PVC-012", "ตะแกรงกันกลิ่นท่อระบายน้ำ", "Pipe & Fittings", "ตัว", None, None, 30),

    # ---- HDW: ฮาร์ดแวร์และอุปกรณ์ก่อสร้างทั่วไป (Hardware) ----
    ("HDW-001", "ตะปูเข็ม 2 นิ้ว", "Hardware", "กก.", "กระสอบ", 25, 30),
    ("HDW-002", "ตะปูคอนกรีต 3 นิ้ว", "Hardware", "กก.", "กระสอบ", 25, 30),
    ("HDW-003", "สกรูเกลียวปล่อย เบอร์ 8", "Hardware", "กล่อง", None, None, 40),
    ("HDW-004", "นอตตัวผู้-ตัวเมีย 1/4 นิ้ว", "Hardware", "กล่อง", None, None, 40),
    ("HDW-005", "บานพับประตู 4 นิ้ว", "Hardware", "ชิ้น", None, None, 60),
    ("HDW-006", "กุญแจลูกบิดประตู", "Hardware", "ชุด", None, None, 30),
    ("HDW-007", "กลอนประตูสแตนเลส", "Hardware", "ชิ้น", None, None, 30),
    ("HDW-008", "เทปกาวย่น", "Hardware", "ม้วน", None, None, 50),
    ("HDW-009", "เทปกาวผ้า (Duct Tape)", "Hardware", "ม้วน", None, None, 50),
    ("HDW-010", "ถุงมือผ้าเคลือบยาง", "Hardware", "คู่", None, None, 50),
    ("HDW-011", "กรรไกรตัดเหล็ก", "Hardware", "ตัว", None, None, 10),
    ("HDW-012", "เชือกฟาง", "Hardware", "ม้วน", None, None, 30),

    # ---- ELE: อุปกรณ์ไฟฟ้า (Electrical) ----
    ("ELE-001", "สายไฟ THW เบอร์ 2.5", "Electrical", "ม้วน", None, None, 20),
    ("ELE-002", "สายไฟ VCT 2x1.5", "Electrical", "ม้วน", None, None, 20),
    ("ELE-003", "เบรกเกอร์ 16A", "Electrical", "ตัว", None, None, 20),
    ("ELE-004", "เบรกเกอร์ 32A", "Electrical", "ตัว", None, None, 15),
    ("ELE-005", "ปลั๊กไฟ 3 ตา", "Electrical", "ชิ้น", None, None, 40),
    ("ELE-006", "สวิตช์ไฟทางเดียว", "Electrical", "ชิ้น", None, None, 40),
    ("ELE-007", "หลอดไฟ LED 9 วัตต์", "Electrical", "หลอด", "กล่อง", 10, 60),
    ("ELE-008", "หลอดไฟ LED หลอดยาว 18 วัตต์", "Electrical", "หลอด", "กล่อง", 10, 50),
    ("ELE-009", "ท่อร้อยสายไฟ PVC สีเหลือง 1/2 นิ้ว", "Electrical", "เส้น", None, None, 40),
    ("ELE-010", "เทปพันสายไฟ", "Electrical", "ม้วน", None, None, 60),
    ("ELE-011", "ตู้คอนซูมเมอร์ยูนิต 4 ช่อง", "Electrical", "ตู้", None, None, 10),
    ("ELE-012", "พัดลมระบายอากาศ", "Electrical", "ตัว", None, None, 15),

    # ---- SAN: สุขภัณฑ์ (Sanitary Ware) ----
    ("SAN-001", "โถสุขภัณฑ์แบบนั่งราบ", "Sanitary Ware", "ชุด", None, None, 10),
    ("SAN-002", "อ่างล้างหน้าแบบแขวน", "Sanitary Ware", "ชุด", None, None, 10),
    ("SAN-003", "ก๊อกน้ำอ่างล้างหน้า", "Sanitary Ware", "ตัว", None, None, 20),
    ("SAN-004", "ฝักบัวอาบน้ำ", "Sanitary Ware", "ชุด", None, None, 20),
    ("SAN-005", "สายฉีดชำระ", "Sanitary Ware", "ชุด", None, None, 30),
    ("SAN-006", "ที่กดโถส้วมอัตโนมัติ", "Sanitary Ware", "ชุด", None, None, 15),
    ("SAN-007", "ตะแกรงระบายน้ำพื้น", "Sanitary Ware", "ชิ้น", None, None, 30),
    ("SAN-008", "กระจกเงาห้องน้ำ", "Sanitary Ware", "บาน", None, None, 15),
    ("SAN-009", "ราวแขวนผ้าเช็ดตัว", "Sanitary Ware", "ชิ้น", None, None, 20),
    ("SAN-010", "ที่ใส่สบู่เหลวติดผนัง", "Sanitary Ware", "ชิ้น", None, None, 20),

    # ---- PNT: สีและอุปกรณ์ทาสี (Paint) ----
    ("PNT-001", "สีทาภายนอกสูตรน้ำ ถัง 5 แกลลอน", "Paint", "ถัง", "ลัง", 4, 20),
    ("PNT-002", "สีทาภายในสูตรน้ำ ถัง 5 แกลลอน", "Paint", "ถัง", "ลัง", 4, 20),
    ("PNT-003", "สีรองพื้นปูน", "Paint", "ถัง", None, None, 20),
    ("PNT-004", "สีน้ำมันทาเหล็ก", "Paint", "แกลลอน", None, None, 15),
    ("PNT-005", "สีกันสนิม", "Paint", "แกลลอน", None, None, 15),
    ("PNT-006", "ทินเนอร์ผสมสี", "Paint", "แกลลอน", None, None, 20),
    ("PNT-007", "แปรงทาสี 3 นิ้ว", "Paint", "ด้าม", None, None, 40),
    ("PNT-008", "ลูกกลิ้งทาสี", "Paint", "ชุด", None, None, 40),
    ("PNT-009", "เทปกาวกันสี (Masking Tape)", "Paint", "ม้วน", None, None, 40),
    ("PNT-010", "ผ้าใบคลุมกันสี", "Paint", "ผืน", None, None, 20),

    # ---- LUM: ไม้และวัสดุแผ่น (Lumber) ----
    ("LUM-001", "ไม้อัดยาง หนา 10 มม.", "Lumber", "แผ่น", None, None, 30),
    ("LUM-002", "ไม้อัดยาง หนา 15 มม.", "Lumber", "แผ่น", None, None, 30),
    ("LUM-003", "แผ่นยิปซัมบอร์ด หนา 9 มม.", "Lumber", "แผ่น", None, None, 40),
    ("LUM-004", "แผ่นสมาร์ทบอร์ด", "Lumber", "แผ่น", None, None, 30),
    ("LUM-005", "ไม้คิ้วบัว PVC", "Lumber", "เส้น", None, None, 40),
    ("LUM-006", "โครงคร่าวเบา (Light Gauge Steel)", "Lumber", "เส้น", None, None, 50),
    ("LUM-007", "ไม้เนื้อแข็งแปรรูป 2x4 นิ้ว", "Lumber", "ท่อน", None, None, 40),
    ("LUM-008", "ไม้ระแนงไม้เทียม", "Lumber", "เส้น", None, None, 30),

    # ---- CLN: อุปกรณ์ทำความสะอาด (Cleaning Supplies — hotel-relevant) ----
    ("CLN-001", "น้ำยาทำความสะอาดพื้นอเนกประสงค์", "Cleaning Supplies", "แกลลอน", None, None, 20),
    ("CLN-002", "น้ำยาล้างห้องน้ำ", "Cleaning Supplies", "แกลลอน", None, None, 20),
    ("CLN-003", "น้ำยาถูพื้นกลิ่นหอม", "Cleaning Supplies", "แกลลอน", None, None, 30),
    ("CLN-004", "ถุงขยะดำขนาดใหญ่", "Cleaning Supplies", "ม้วน", None, None, 40),
    ("CLN-005", "ไม้ถูพื้นพร้อมด้าม", "Cleaning Supplies", "ชุด", None, None, 20),
    ("CLN-006", "ไม้กวาดทางมะพร้าว", "Cleaning Supplies", "ด้าม", None, None, 20),
    ("CLN-007", "ผ้าไมโครไฟเบอร์เช็ดทำความสะอาด", "Cleaning Supplies", "ผืน", None, None, 50),
    ("CLN-008", "สเปรย์ปรับอากาศ", "Cleaning Supplies", "กระป๋อง", None, None, 30),
]


def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    return "null" if v is None else str(v)


def main():
    lines = []
    lines.append("-- ============================================================================")
    lines.append("-- Demo / mockup catalog — ~100 realistic construction & hotel-facilities")
    lines.append("-- materials, Thai-named, covering ten categories (the five the schema already")
    lines.append("-- knows plus five more: Electrical, Sanitary Ware, Paint, Lumber, Cleaning")
    lines.append("-- Supplies) so the app has enough breadth to demo Stock filtering/search,")
    lines.append("-- category chips, and low-stock reporting realistically.")
    lines.append("--")
    lines.append("-- Safe to run after supabase/schema.sql, any number of times: every sku_code")
    lines.append("-- here (CMT-/STL-/AGG-/PVC-/HDW-/ELE-/SAN-/PNT-/LUM-/CLN-) is a prefix that")
    lines.append("-- does not collide with schema.sql's own 5-item seed (CEM-/REB-/SND-/PIP-/NAI-),")
    lines.append("-- so both can coexist, and `on conflict do nothing` makes re-running a no-op.")
    lines.append("-- ============================================================================")
    lines.append("")
    lines.append("insert into skus (sku_code, name, category, base_uom, alt_uom, conversion_factor, min_threshold) values")
    row_strs = []
    for code, name, cat, uom, alt_uom, conv, thresh in ITEMS:
        row_strs.append(
            f"  ({sql_str(code)}, {sql_str(name)}, {sql_str(cat)}, {sql_str(uom)}, {sql_str(alt_uom)}, {sql_num(conv)}, {thresh})"
        )
    lines.append(",\n".join(row_strs) + "\n")
    lines.append("on conflict (sku_code) do nothing;")
    lines.append("")

    out = "\n".join(lines)
    sys.stdout.write(out)
    print(f"-- generated {len(ITEMS)} rows", file=sys.stderr)


if __name__ == "__main__":
    main()
