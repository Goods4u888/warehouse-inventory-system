// ============================================================================
// Minimal i18n: a flat dictionary, a t() lookup, and a DOM pass that fills
// in every element carrying data-i18n / data-i18n-placeholder. Language
// choice persists in localStorage. Default is Thai, since the people who
// actually operate this app day to day are warehouse staff — English is one
// tap away for anyone reviewing it in English.
// ============================================================================

const I18N = {
  en: {
    appTitle: 'Warehouse',
    headerSub: 'Receiving · Requisition',
    refresh: '↻ Refresh',

    tabStock: 'Stock', tabReceive: 'Receive', tabIssue: 'Scan', tabRequests: 'Requests', tabReports: 'Reports',

    onHandLabel: 'On hand · active SKUs',
    belowThresholdLabel: 'Below threshold',
    materialsOnHand: 'Materials on hand',
    manageItems: 'Manage items',
    facetAll: 'All',
    chipOk: 'OK',
    chipBelowThreshold: (min) => `Below threshold (${min})`,
    emptyStockCategory: 'No SKUs in this category yet.',
    searchStockPlaceholder: 'Search by SKU or name',
    searchRequestsPlaceholder: 'Search requester, item, or code',
    searchReportsPlaceholder: 'Search this report',
    emptySearchResults: (q) => `No results for "${q}".`,

    receiveTitle: 'Receive stock',
    receiveHint: "Log a new batch in. The system will generate a lot ID and QR sticker — print it and stick it on the batch.",
    fieldItem: 'Item',
    fieldQtyReceived: 'Quantity received',
    fieldUnit: 'Unit',
    fieldSupplierRef: 'Supplier reference (optional)',
    fieldSupplierRefPh: 'PO number, delivery note, etc.',
    fieldReceivedBy: 'Received by',
    fieldReceivedByPh: 'Staff name',
    btnGenerateLot: 'Generate lot & QR',
    btnGenerating: 'Generating…',
    stickerReady: 'Sticker ready to print',
    btnPrintSticker: 'Print sticker',
    toastLotReceived: (code) => `Lot ${code} received`,

    scanTitle: 'Scan to issue',
    scanHintDefault: "Point the camera at the lot's QR sticker to scan it, or enter the lot code below.",
    scanHintNoCamera: 'Camera unavailable — enter the lot code manually below.',
    scanLookingUp: (code) => `Looking up ${code}…`,
    fieldLotCode: 'Lot code',
    btnLookupLot: 'Look up lot',
    lotFound: 'Lot found',
    unitLeft: (qty, uom) => `${qty} ${uom} left`,
    fieldFulfillWhich: 'Fulfilling which request?',
    optionRequestLine: (code, name, qty, uom) => `${code} — ${name}, wants ${qty} ${uom}`,
    fieldActualQty: 'Actual quantity issued',
    hintRequested: (qty, uom) => `Requested: ${qty} ${uom}. Change this if the actual pick differs.`,
    fieldPickedUpBy: 'Picked up by',
    fieldPickedUpByRequired: 'Enter who is picking this up',
    pickedUpBy: (name) => `Picked up by ${name}`,
    btnConfirmIssue: 'Confirm issue',
    btnConfirming: 'Confirming…',
    btnScanDifferent: 'Scan a different lot',
    emptyNoOpenRequest: 'No open request for this item yet.',
    promptPerformedBy: 'Your name (for the transaction log):',
    toastIssuedDiscrepancy: (req, act) => `Issued, but flagged: requested ${req}, actual ${act}`,
    toastIssuedClean: 'Issued and request closed',
    toastNoLot: (code) => `No lot found for "${code}"`,

    requestsTitle: 'Requests',
    btnNewRequest: '+ New',
    statusAll: 'All', statusPending: 'Pending', statusPreparing: 'Preparing', statusReady: 'Ready', statusFulfilled: 'Fulfilled', statusCancelled: 'Cancelled',
    emptyRequests: (status) => `No ${status} requests.`,
    btnMarkStatus: (s) => `Mark ${s}`,
    neededBy: (d) => `needed ${d}`,
    newRequestTitle: 'New request',
    fieldRequesterName: 'Requester name',
    fieldQty: 'Quantity',
    fieldNeededBy: 'Needed by',
    fieldNotesOptional: 'Notes (optional)',
    btnSubmitRequest: 'Submit request',
    toastRequestSubmitted: 'Request submitted',
    toastStatusUpdated: (s) => `Marked ${s}`,

    reportsTitle: 'Reports',
    reportStock: 'Stock', reportMovement: 'Movement', reportDiscrepancy: 'Discrepancies', reportLowStock: 'Low stock',
    colSku: 'SKU', colName: 'Name', colCategory: 'Category', colOnHand: 'On hand', colThreshold: 'Threshold', colStatus: 'Status',
    colWhen: 'When', colType: 'Type', colLot: 'Lot', colQty: 'Qty', colBy: 'By', colRequest: 'Request',
    colRequested: 'Requested', colActual: 'Actual', colVariance: 'Variance',
    rowLow: 'Low',
    emptyDiscrepancies: 'No discrepancies recorded. Every issue has matched its request.',
    emptyLowStock: 'Nothing below threshold right now.',
    emptyGeneric: 'Nothing to show yet.',

    manageItemsTitle: 'Manage items',
    addItem: 'Add item', add: 'Add', saveChanges: 'Save changes', cancel: 'Cancel',
    fieldSkuCode: 'SKU code', fieldName: 'Name', fieldCategory: 'Category',
    fieldBaseUom: 'Base unit', fieldAltUom: 'Alternate unit (optional)', fieldConversionFactor: 'Conversion factor (1 alt = ? base)',
    fieldMinThreshold: 'Minimum threshold', btnEdit: 'Edit', btnDeactivate: 'Deactivate', btnActivate: 'Activate',
    activeItems: 'Active', inactiveItems: 'Inactive',
    toastItemCreated: 'Item created', toastItemUpdated: 'Item updated',
    toastItemDeactivated: 'Item deactivated', toastItemActivated: 'Item activated',
    skuCodeAutoPlaceholder: 'Assigned automatically on save',
    selectCategoryPlaceholder: 'Select a category…',
    addCategoryTitle: 'Add a new category',
    newCategoryPlaceholder: 'New category name',
    toastCategoryCreated: 'Category added',
    errorCategoryExists: 'That category already exists',

    langToggle: 'ไทย',
  },
  th: {
    appTitle: 'คลังวัสดุ',
    headerSub: 'รับของ · เบิกของ',
    refresh: '↻ รีเฟรช',

    tabStock: 'สต็อก', tabReceive: 'รับของ', tabIssue: 'สแกน', tabRequests: 'คำขอ', tabReports: 'รายงาน',

    onHandLabel: 'คงเหลือ · SKU ที่ใช้งาน',
    belowThresholdLabel: 'ต่ำกว่าเกณฑ์',
    materialsOnHand: 'วัสดุคงคลัง',
    manageItems: 'จัดการรายการสินค้า',
    facetAll: 'ทั้งหมด',
    chipOk: 'ปกติ',
    chipBelowThreshold: (min) => `ต่ำกว่าเกณฑ์ (${min})`,
    emptyStockCategory: 'ยังไม่มีสินค้าในหมวดนี้',
    searchStockPlaceholder: 'ค้นหาด้วยรหัส SKU หรือชื่อ',
    searchRequestsPlaceholder: 'ค้นหาผู้ขอ, สินค้า หรือรหัสคำขอ',
    searchReportsPlaceholder: 'ค้นหาในรายงานนี้',
    emptySearchResults: (q) => `ไม่พบผลลัพธ์สำหรับ "${q}"`,

    receiveTitle: 'รับของเข้าคลัง',
    receiveHint: 'บันทึกของที่รับเข้าใหม่ ระบบจะสร้างรหัสล็อตและ QR สติกเกอร์ให้ — พิมพ์แล้วนำไปแปะที่ของ',
    fieldItem: 'รายการสินค้า',
    fieldQtyReceived: 'จำนวนที่รับเข้า',
    fieldUnit: 'หน่วยนับ',
    fieldSupplierRef: 'อ้างอิงผู้จำหน่าย (ถ้ามี)',
    fieldSupplierRefPh: 'เลขที่ PO, ใบส่งของ ฯลฯ',
    fieldReceivedBy: 'ผู้รับของ',
    fieldReceivedByPh: 'ชื่อเจ้าหน้าที่',
    btnGenerateLot: 'สร้างล็อตและ QR',
    btnGenerating: 'กำลังสร้าง…',
    stickerReady: 'สติกเกอร์พร้อมพิมพ์',
    btnPrintSticker: 'พิมพ์สติกเกอร์',
    toastLotReceived: (code) => `รับเข้าล็อต ${code} แล้ว`,

    scanTitle: 'สแกนเพื่อเบิกของ',
    scanHintDefault: 'ส่องกล้องไปที่สติกเกอร์ QR บนล็อตเพื่อสแกน หรือกรอกรหัสล็อตด้านล่าง',
    scanHintNoCamera: 'ใช้กล้องไม่ได้ — กรอกรหัสล็อตด้านล่างแทน',
    scanLookingUp: (code) => `กำลังค้นหา ${code}…`,
    fieldLotCode: 'รหัสล็อต',
    btnLookupLot: 'ค้นหาล็อต',
    lotFound: 'พบล็อตแล้ว',
    unitLeft: (qty, uom) => `เหลือ ${qty} ${uom}`,
    fieldFulfillWhich: 'เบิกให้คำขอรายการไหน?',
    optionRequestLine: (code, name, qty, uom) => `${code} — ${name}, ต้องการ ${qty} ${uom}`,
    fieldActualQty: 'จำนวนที่เบิกจริง',
    hintRequested: (qty, uom) => `ขอไว้: ${qty} ${uom} — แก้ไขได้ถ้าจำนวนที่จ่ายจริงไม่ตรง`,
    fieldPickedUpBy: 'ผู้มารับของ',
    fieldPickedUpByRequired: 'กรุณาระบุชื่อผู้มารับของ',
    pickedUpBy: (name) => `รับของโดย ${name}`,
    btnConfirmIssue: 'ยืนยันการเบิก',
    btnConfirming: 'กำลังยืนยัน…',
    btnScanDifferent: 'สแกนล็อตอื่น',
    emptyNoOpenRequest: 'ยังไม่มีคำขอที่รอสำหรับสินค้านี้',
    promptPerformedBy: 'ชื่อของคุณ (สำหรับบันทึกรายการ):',
    toastIssuedDiscrepancy: (req, act) => `เบิกแล้ว แต่มีส่วนต่าง: ขอ ${req} จ่ายจริง ${act}`,
    toastIssuedClean: 'เบิกสำเร็จ ปิดคำขอแล้ว',
    toastNoLot: (code) => `ไม่พบล็อต "${code}"`,

    requestsTitle: 'คำขอเบิก',
    btnNewRequest: '+ สร้างใหม่',
    statusAll: 'ทั้งหมด', statusPending: 'รอดำเนินการ', statusPreparing: 'กำลังเตรียม', statusReady: 'พร้อมส่งมอบ', statusFulfilled: 'เสร็จสิ้น', statusCancelled: 'ยกเลิก',
    emptyRequests: (status) => `ไม่มีคำขอสถานะ${status}`,
    btnMarkStatus: (s) => `เปลี่ยนเป็น${s}`,
    neededBy: (d) => `ต้องการภายใน ${d}`,
    newRequestTitle: 'สร้างคำขอเบิกใหม่',
    fieldRequesterName: 'ชื่อผู้ขอเบิก',
    fieldQty: 'จำนวน',
    fieldNeededBy: 'ต้องการภายในวันที่',
    fieldNotesOptional: 'หมายเหตุ (ถ้ามี)',
    btnSubmitRequest: 'ส่งคำขอ',
    toastRequestSubmitted: 'ส่งคำขอแล้ว',
    toastStatusUpdated: (s) => `เปลี่ยนสถานะเป็น${s}แล้ว`,

    reportsTitle: 'รายงาน',
    reportStock: 'สต็อก', reportMovement: 'ความเคลื่อนไหว', reportDiscrepancy: 'ส่วนต่าง', reportLowStock: 'ใกล้หมด',
    colSku: 'รหัส SKU', colName: 'ชื่อสินค้า', colCategory: 'หมวดหมู่', colOnHand: 'คงเหลือ', colThreshold: 'เกณฑ์ขั้นต่ำ', colStatus: 'สถานะ',
    colWhen: 'เมื่อ', colType: 'ประเภท', colLot: 'ล็อต', colQty: 'จำนวน', colBy: 'โดย', colRequest: 'คำขอ',
    colRequested: 'จำนวนที่ขอ', colActual: 'จำนวนจริง', colVariance: 'ส่วนต่าง',
    rowLow: 'ต่ำ',
    emptyDiscrepancies: 'ไม่มีส่วนต่าง — ทุกการเบิกตรงกับคำขอ',
    emptyLowStock: 'ไม่มีสินค้าต่ำกว่าเกณฑ์ในขณะนี้',
    emptyGeneric: 'ยังไม่มีข้อมูล',

    manageItemsTitle: 'จัดการรายการสินค้า',
    addItem: 'เพิ่มรายการ', add: 'เพิ่ม', saveChanges: 'บันทึกการแก้ไข', cancel: 'ยกเลิก',
    fieldSkuCode: 'รหัส SKU', fieldName: 'ชื่อสินค้า', fieldCategory: 'หมวดหมู่',
    fieldBaseUom: 'หน่วยหลัก', fieldAltUom: 'หน่วยรอง (ถ้ามี)', fieldConversionFactor: 'อัตราแปลงหน่วย (1 หน่วยรอง = ? หน่วยหลัก)',
    fieldMinThreshold: 'เกณฑ์ขั้นต่ำ', btnEdit: 'แก้ไข', btnDeactivate: 'ปิดใช้งาน', btnActivate: 'เปิดใช้งาน',
    activeItems: 'ใช้งานอยู่', inactiveItems: 'ปิดใช้งาน',
    toastItemCreated: 'เพิ่มรายการแล้ว', toastItemUpdated: 'บันทึกการแก้ไขแล้ว',
    toastItemDeactivated: 'ปิดใช้งานรายการแล้ว', toastItemActivated: 'เปิดใช้งานรายการแล้ว',
    skuCodeAutoPlaceholder: 'ระบบจะกำหนดให้อัตโนมัติเมื่อบันทึก',
    selectCategoryPlaceholder: 'เลือกหมวดหมู่…',
    addCategoryTitle: 'เพิ่มหมวดหมู่ใหม่',
    newCategoryPlaceholder: 'ชื่อหมวดหมู่ใหม่',
    toastCategoryCreated: 'เพิ่มหมวดหมู่แล้ว',
    errorCategoryExists: 'มีหมวดหมู่นี้อยู่แล้ว',

    langToggle: 'EN',
  },
};

const I18n = {
  current: (localStorage.getItem('wh_lang')) || 'th',
  t(key, ...args) {
    const dict = I18N[I18n.current] || I18N.th;
    const val = dict[key] ?? I18N.th[key] ?? key;
    return typeof val === 'function' ? val(...args) : val;
  },
  setLang(lang) {
    I18n.current = lang;
    try { localStorage.setItem('wh_lang', lang); } catch (_) {}
    I18n.applyStatic();
    document.documentElement.lang = lang;
    if (typeof onLanguageChange === 'function') onLanguageChange();
  },
  applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = I18n.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', I18n.t(el.dataset.i18nPlaceholder));
    });
    const toggle = document.getElementById('lang-toggle');
    if (toggle) toggle.textContent = I18n.t('langToggle');
  },
};

function t(key, ...args) { return I18n.t(key, ...args); }
