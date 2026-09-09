#!/usr/bin/env python3
# Generates supabase/seed_mockup_interior_100.sql — ~100 realistic interior /
# building-maintenance items (fit-out, repair, and upkeep work inside a
# building, as opposed to seed_mockup_100.sql's raw construction-site
# materials), Thai-named. Four brand-new categories (Flooring, Ceiling,
# Furniture, Curtains & Blinds) plus more items folded into six categories
# the schema already has (Hardware, Electrical, Sanitary Ware, Paint,
# Lumber, Cleaning Supplies) — those six continue each category's existing
# sku_code numbering rather than starting a new prefix.
#
# sku_code prefixes for the four new categories (FLR/CEI/FRN/CRT) are
# deliberately distinct from every prefix already in schema.sql or
# seed_mockup_100.sql, so all three seed files can run together with zero
# collisions.

import sys

# (sku_code, name, category, base_uom, alt_uom, conversion_factor, min_threshold)
ITEMS = [
    # ---- FLR: พื้นและวัสดุปูพื้น (Flooring) — new category ----
    ("FLR-001", "กระเบื้องยางลายไม้ (LVT)", "Flooring", "แผ่น", "กล่อง", 8, 100),
    ("FLR-002", "กระเบื้องเซรามิกปูพื้น 60x60 ซม.", "Flooring", "แผ่น", None, None, 100),
    ("FLR-003", "กระเบื้องยางแบบม้วน", "Flooring", "ม้วน", None, None, 20),
    ("FLR-004", "พรมแผ่นสำเร็จรูป (Carpet Tile)", "Flooring", "แผ่น", "กล่อง", 20, 100),
    ("FLR-005", "พรมม้วนสำนักงาน", "Flooring", "ม้วน", None, None, 10),
    ("FLR-006", "ลามิเนตปูพื้นลายไม้", "Flooring", "แผ่น", None, None, 80),
    ("FLR-007", "กาวปูกระเบื้องยาง", "Flooring", "ถัง", None, None, 20),
    ("FLR-008", "ยางยาแนวกระเบื้องสำเร็จรูป", "Flooring", "ถุง", None, None, 30),
    ("FLR-009", "แผ่นยางกันลื่นปูพื้น", "Flooring", "ม้วน", None, None, 20),
    ("FLR-010", "บัวเชิงผนัง PVC", "Flooring", "เส้น", None, None, 50),
    ("FLR-011", "น้ำยาเคลือบเงาพื้น", "Flooring", "แกลลอน", None, None, 15),
    ("FLR-012", "แผ่นยางรองพื้นกันกระแทก", "Flooring", "แผ่น", None, None, 40),

    # ---- CEI: ฝ้าเพดานและอุปกรณ์ (Ceiling) — new category ----
    ("CEI-001", "แผ่นฝ้ายิปซัมมาตรฐาน หนา 9 มม.", "Ceiling", "แผ่น", None, None, 60),
    ("CEI-002", "แผ่นฝ้าทีบาร์ลายเรียบ", "Ceiling", "แผ่น", None, None, 60),
    ("CEI-003", "โครงฉากทีบาร์ฝ้าเพดาน", "Ceiling", "เส้น", None, None, 60),
    ("CEI-004", "ฉากยึดโครงฝ้า", "Ceiling", "ชิ้น", None, None, 100),
    ("CEI-005", "คิ้วบัวฝ้าเพดาน PVC", "Ceiling", "เส้น", None, None, 40),
    ("CEI-006", "ตะขอแขวนฝ้าเพดาน", "Ceiling", "ชิ้น", None, None, 100),
    ("CEI-007", "สีทาฝ้าเพดานสูตรน้ำ", "Ceiling", "ถัง", None, None, 15),
    ("CEI-008", "แผ่นฝ้าอะคูสติกกันเสียง", "Ceiling", "แผ่น", None, None, 30),
    ("CEI-009", "ช่องเซอร์วิสฝ้าเพดาน (Access Panel)", "Ceiling", "ชิ้น", None, None, 20),
    ("CEI-010", "สายยึดโครงฝ้าเพดาน", "Ceiling", "ม้วน", None, None, 20),

    # ---- FRN: เฟอร์นิเจอร์และอุปกรณ์ตกแต่ง (Furniture & Fixtures) — new category ----
    ("FRN-001", "เก้าอี้สำนักงานพนักพิงตาข่าย", "Furniture", "ตัว", None, None, 10),
    ("FRN-002", "โต๊ะทำงานเหล็ก+ไม้", "Furniture", "ตัว", None, None, 5),
    ("FRN-003", "ตู้เอกสารเหล็ก 4 ลิ้นชัก", "Furniture", "ตู้", None, None, 5),
    ("FRN-004", "เก้าอี้พลาสติกอเนกประสงค์", "Furniture", "ตัว", None, None, 30),
    ("FRN-005", "โต๊ะพับอเนกประสงค์", "Furniture", "ตัว", None, None, 10),
    ("FRN-006", "ชั้นวางของเหล็กอเนกประสงค์", "Furniture", "ตัว", None, None, 10),
    ("FRN-007", "กระจกเงาติดผนังกรอบอลูมิเนียม", "Furniture", "บาน", None, None, 10),
    ("FRN-008", "พรมเช็ดเท้าทางเข้า", "Furniture", "ผืน", None, None, 20),
    ("FRN-009", "ถังขยะในอาคารพร้อมฝา", "Furniture", "ใบ", None, None, 20),
    ("FRN-010", "ป้ายอะคริลิกบอกทาง/ห้อง", "Furniture", "แผ่น", None, None, 20),
    ("FRN-011", "ล้อเลื่อนเฟอร์นิเจอร์", "Furniture", "ชุด", None, None, 40),
    ("FRN-012", "ชุดสกรูซ่อมเฟอร์นิเจอร์", "Furniture", "ชุด", None, None, 30),

    # ---- CRT: ผ้าม่านและมู่ลี่ (Curtains & Blinds) — new category ----
    ("CRT-001", "ผ้าม่านทึบแสงสำเร็จรูป", "Curtains & Blinds", "ผืน", None, None, 20),
    ("CRT-002", "ผ้าม่านโปร่งตาข่าย", "Curtains & Blinds", "ผืน", None, None, 20),
    ("CRT-003", "มู่ลี่อลูมิเนียมปรับแสง", "Curtains & Blinds", "ชุด", None, None, 15),
    ("CRT-004", "ม่านม้วนบังแดด (Roller Blind)", "Curtains & Blinds", "ชุด", None, None, 15),
    ("CRT-005", "รางม่านอลูมิเนียม", "Curtains & Blinds", "เส้น", None, None, 30),
    ("CRT-006", "ตะขอแขวนม่าน", "Curtains & Blinds", "แพ็ค", None, None, 40),
    ("CRT-007", "เชือกดึงม่านม้วน", "Curtains & Blinds", "ม้วน", None, None, 20),
    ("CRT-008", "ลูกล้อรางม่าน", "Curtains & Blinds", "ชิ้น", None, None, 100),

    # ---- HDW continued: ฮาร์ดแวร์ประตู/ตู้ภายในอาคาร (Hardware) ----
    ("HDW-013", "บานพับประตูสปริงในตัว (Door Closer)", "Hardware", "ชุด", None, None, 15),
    ("HDW-014", "กุญแจลูกบิดห้องน้ำพร้อมมือจับฉุกเฉิน", "Hardware", "ชุด", None, None, 20),
    ("HDW-015", "กลอนประตูกันเสียง (Door Silencer)", "Hardware", "ชิ้น", None, None, 60),
    ("HDW-016", "มือจับประตูสแตนเลส", "Hardware", "ชิ้น", None, None, 40),
    ("HDW-017", "รางเลื่อนบานประตู", "Hardware", "เส้น", None, None, 20),
    ("HDW-018", "ตัวล็อกหน้าต่างบานเลื่อน", "Hardware", "ชิ้น", None, None, 40),
    ("HDW-019", "ที่ดันประตูกันกระแทก (Door Stopper)", "Hardware", "ชิ้น", None, None, 60),
    ("HDW-020", "บานพับตู้เฟอร์นิเจอร์ (Soft Close)", "Hardware", "ชิ้น", None, None, 100),
    ("HDW-021", "มือจับลิ้นชัก/ตู้", "Hardware", "ชิ้น", None, None, 100),
    ("HDW-022", "รางลิ้นชักบอลแบริ่ง", "Hardware", "คู่", None, None, 40),
    ("HDW-023", "กุญแจล็อกตู้เอกสาร", "Hardware", "ชุด", None, None, 20),
    ("HDW-024", "ยางกันกระแทกขอบประตู", "Hardware", "ม้วน", None, None, 30),

    # ---- ELE continued: ไฟส่องสว่างภายในอาคาร (Electrical) ----
    ("ELE-013", "โคมไฟดาวน์ไลท์ LED 6 นิ้ว", "Electrical", "ดวง", None, None, 40),
    ("ELE-014", "โคมไฟติดผนังภายใน (Wall Sconce)", "Electrical", "ดวง", None, None, 20),
    ("ELE-015", "โคมไฟสนามหน้าอาคาร LED", "Electrical", "ดวง", None, None, 15),
    ("ELE-016", "ฟลูออเรสเซนต์ LED กันน้ำ 1.2 ม.", "Electrical", "ชุด", None, None, 20),
    ("ELE-017", "โคมไฟฉุกเฉิน (Emergency Light)", "Electrical", "ชุด", None, None, 20),
    ("ELE-018", "ป้ายทางออกฉุกเฉิน LED (Exit Sign)", "Electrical", "ป้าย", None, None, 15),
    ("ELE-019", "สวิตช์หรี่ไฟ (Dimmer Switch)", "Electrical", "ชิ้น", None, None, 20),
    ("ELE-020", "เซนเซอร์เปิดปิดไฟอัตโนมัติ", "Electrical", "ตัว", None, None, 15),
    ("ELE-021", "ปลั๊กไฟกันน้ำติดผนัง", "Electrical", "ชิ้น", None, None, 20),
    ("ELE-022", "รีโมทควบคุมไฟ/พัดลมเพดาน", "Electrical", "ชุด", None, None, 10),
    ("ELE-023", "พัดลมเพดานติดตั้งใน (Ceiling Fan)", "Electrical", "ตัว", None, None, 10),
    ("ELE-024", "บาลาสต์อิเล็กทรอนิกส์หลอดฟลูออเรสเซนต์", "Electrical", "ตัว", None, None, 20),

    # ---- SAN continued: สุขภัณฑ์และอุปกรณ์ห้องน้ำ (Sanitary Ware) ----
    ("SAN-011", "อ่างล้างหน้าแบบตั้งขาเดี่ยว", "Sanitary Ware", "ชุด", None, None, 8),
    ("SAN-012", "โถปัสสาวะชายติดผนัง", "Sanitary Ware", "ชุด", None, None, 8),
    ("SAN-013", "วาล์วฟลัชโถปัสสาวะ", "Sanitary Ware", "ชุด", None, None, 15),
    ("SAN-014", "ที่ใส่กระดาษชำระสแตนเลส", "Sanitary Ware", "ชิ้น", None, None, 30),
    ("SAN-015", "ราวจับผู้พิการในห้องน้ำ", "Sanitary Ware", "ชุด", None, None, 15),
    ("SAN-016", "ยางรองโถสุขภัณฑ์ (วงแหวน)", "Sanitary Ware", "ชิ้น", None, None, 40),
    ("SAN-017", "หัวก๊อกอ่างล้างจาน", "Sanitary Ware", "ตัว", None, None, 20),
    ("SAN-018", "สายน้ำดีสแตนเลสหุ้มเปีย", "Sanitary Ware", "เส้น", None, None, 40),
    ("SAN-019", "ที่แขวนอุปกรณ์ทำความสะอาดในห้องน้ำ", "Sanitary Ware", "ชุด", None, None, 15),
    ("SAN-020", "ฝารองนั่งโถสุขภัณฑ์", "Sanitary Ware", "ชิ้น", None, None, 20),

    # ---- PNT continued: วัสดุตกแต่งผนัง (Paint) ----
    ("PNT-011", "วอลเปเปอร์ลายเรียบ", "Paint", "ม้วน", None, None, 20),
    ("PNT-012", "กาวติดวอลเปเปอร์", "Paint", "ถุง", None, None, 15),
    ("PNT-013", "สีเทกซ์เจอร์ตกแต่งผนัง", "Paint", "ถัง", None, None, 15),
    ("PNT-014", "แผ่นไวนิลกันชื้นบุผนัง", "Paint", "ม้วน", None, None, 15),
    ("PNT-015", "น้ำยาเคลือบกันเชื้อราผนัง", "Paint", "แกลลอน", None, None, 15),
    ("PNT-016", "สีสเปรย์พ่นตกแต่ง", "Paint", "กระป๋อง", None, None, 30),
    ("PNT-017", "เกรียงโป๊วสีสแตนเลส", "Paint", "ด้าม", None, None, 20),
    ("PNT-018", "กระดาษทรายขัดผนัง", "Paint", "แผ่น", None, None, 60),

    # ---- LUM continued: ไม้และวัสดุแผ่นตกแต่งภายใน (Lumber) ----
    ("LUM-009", "ไม้บัวผนัง PVC (Skirting)", "Lumber", "เส้น", None, None, 50),
    ("LUM-010", "แผ่นไม้อัดปิดผิวเมลามีน", "Lumber", "แผ่น", None, None, 30),
    ("LUM-011", "ไม้คิ้วกรอบประตู-หน้าต่าง", "Lumber", "เส้น", None, None, 40),
    ("LUM-012", "แผ่นไม้ฝาซีเมนต์ (Fiber Cement Board)", "Lumber", "แผ่น", None, None, 30),
    ("LUM-013", "บานประตูไม้สำเร็จรูป", "Lumber", "บาน", None, None, 10),
    ("LUM-014", "วงกบประตู PVC", "Lumber", "ชุด", None, None, 15),
    ("LUM-015", "ไม้อัดยางกันน้ำ หนา 6 มม.", "Lumber", "แผ่น", None, None, 30),
    ("LUM-016", "น็อตยึดไม้/สกรูไม้ (กล่อง)", "Lumber", "กล่อง", None, None, 40),

    # ---- CLN continued: อุปกรณ์ดูแลรักษาภายในอาคาร (Cleaning Supplies) ----
    ("CLN-009", "น้ำยาเช็ดกระจก", "Cleaning Supplies", "แกลลอน", None, None, 20),
    ("CLN-010", "น้ำยาขัดพื้นกระเบื้อง", "Cleaning Supplies", "แกลลอน", None, None, 20),
    ("CLN-011", "แผ่นใยขัดพื้น (Scotch-Brite)", "Cleaning Supplies", "แผ่น", None, None, 40),
    ("CLN-012", "ผ้าม็อบถูพื้นสำรอง", "Cleaning Supplies", "ผืน", None, None, 30),
    ("CLN-013", "น้ำยาดับกลิ่นห้องน้ำอัตโนมัติ (รีฟิล)", "Cleaning Supplies", "กระป๋อง", None, None, 30),
    ("CLN-014", "ถุงมือยางทำความสะอาด", "Cleaning Supplies", "คู่", None, None, 40),
    ("CLN-015", "น้ำยาล้างแอร์/คอยล์เย็น", "Cleaning Supplies", "กระป๋อง", None, None, 20),
    ("CLN-016", "ไม้ปาดน้ำเช็ดกระจก (Squeegee)", "Cleaning Supplies", "ด้าม", None, None, 20),
]

# Four brand-new categories this seed introduces. Inserted before the SKU
# rows since skus.category is a foreign key into categories(name) — see
# "1b. Categories" in schema.sql. sort_order continues from the ten the
# schema already seeds (1-10).
NEW_CATEGORIES = [
    ("Flooring", 11), ("Ceiling", 12), ("Furniture", 13), ("Curtains & Blinds", 14),
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
    lines.append("-- Demo / mockup catalog — ~100 interior / building-maintenance items, Thai-")
    lines.append("-- named: fit-out and repair materials for the inside of a building (flooring,")
    lines.append("-- ceilings, furniture, curtains, interior lighting, door/cabinet hardware,")
    lines.append("-- bathroom fixtures, wall finishing, interior wood trim, and upkeep supplies)")
    lines.append("-- as opposed to seed_mockup_100.sql's raw construction-site materials.")
    lines.append("--")
    lines.append("-- Adds four new categories (Flooring, Ceiling, Furniture, Curtains & Blinds)")
    lines.append("-- and folds the rest into six categories the schema already has (Hardware,")
    lines.append("-- Electrical, Sanitary Ware, Paint, Lumber, Cleaning Supplies), continuing")
    lines.append("-- each one's existing sku_code numbering.")
    lines.append("--")
    lines.append("-- Safe to run after supabase/schema.sql (and independently of")
    lines.append("-- seed_mockup_100.sql, any order), any number of times: the new categories")
    lines.append("-- use `on conflict (name) do nothing` and every sku_code here is either a new")
    lines.append("-- prefix (FLR-/CEI-/FRN-/CRT-) or continues past the highest number")
    lines.append("-- seed_mockup_100.sql uses for that prefix, so nothing collides.")
    lines.append("-- ============================================================================")
    lines.append("")
    lines.append("insert into categories (name, sort_order) values")
    lines.append(",\n".join(f"  ({sql_str(name)}, {order})" for name, order in NEW_CATEGORIES))
    lines.append("on conflict (name) do nothing;")
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
    print(f"-- generated {len(ITEMS)} rows across {len(NEW_CATEGORIES)} new categories", file=sys.stderr)


if __name__ == "__main__":
    main()
