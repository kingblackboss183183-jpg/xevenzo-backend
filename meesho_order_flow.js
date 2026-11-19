const fs = require('fs');
const path = require('path');

const LEADS_PATH = path.join(__dirname, 'leads.json');
const ADMIN_PHONE = '918078426656';

function readLeads() {
    try {
        if (!fs.existsSync(LEADS_PATH)) return [];
        const raw = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function saveLeads(list) {
    fs.writeFileSync(LEADS_PATH, JSON.stringify(list, null, 2), 'utf8');
}

function upsertMeeshoLead({
    customerJid,
    name = '',
    phone = '',
    address = '',
    pincode = '',
    productId = '',
    productName = '',
    qty = 1,
    sharedReel = false,
    groupLink = ''
}) {
    const leads = readLeads();
    const idx = leads.findIndex(l => l.customerJid === customerJid);
    const existing = idx >= 0 ? leads[idx] : {};

    const record = {
        ...existing,
        id: existing.id || `ORD-${Date.now().toString().slice(-6)}`,
        customerJid,
        name: name || existing.name || '',
        phone: phone || existing.phone || '',
        address: address || existing.address || '',
        pincode: pincode || existing.pincode || '',
        productId: productId || existing.productId || '',
        productName: productName || existing.productName || '',
        qty: qty || existing.qty || 1,
        sharedReel: typeof sharedReel === 'boolean' ? sharedReel : Boolean(existing.sharedReel),
        groupLink: groupLink || existing.groupLink || '',
        paymentStatus: existing.paymentStatus || 'AWAITING_QR_PAYMENT',
        trackingInfo: existing.trackingInfo || '',
        updatedAt: new Date().toISOString()
    };

    if (idx >= 0) leads[idx] = record;
    else leads.push(record);

    saveLeads(leads);
    return record;
}

function markPaymentVerified(orderId, note = 'Verified via GPay/Admin') {
    const leads = readLeads();
    const item = leads.find(l => l.id === orderId);
    if (!item) return null;
    item.paymentStatus = 'PAID_VERIFIED';
    item.paymentNote = note;
    item.verifiedAt = new Date().toISOString();
    saveLeads(leads);
    return item;
}

function setTrackingWithoutPrice(orderId, trackingStatus, courierName = '') {
    const leads = readLeads();
    const item = leads.find(l => l.id === orderId);
    if (!item) return null;
    item.trackingInfo = trackingStatus;
    item.courierName = courierName;
    item.trackedAt = new Date().toISOString();
    saveLeads(leads);

    // Strictly NO price or margin included in customer tracking message
    const msg = [
        `📦 *ഡെലിവറി ട്രാക്കിംഗ് അപ്‌ഡേറ്റ് (${item.id})*`,
        `• *ഉൽപ്പന്നം:* ${item.productName || item.productId || 'നിങ്ങളുടെ ഓർഡർ'}`,
        `• *അളവ്:* ${item.qty || 1}`,
        courierName ? `• *കൊറിയർ:* ${courierName}` : null,
        `• *നിലവിലെ സ്റ്റാറ്റസ്:* ${trackingStatus}`,
        `• *ഡെലിവറി നമ്പർ:* ${item.phone || 'രേഖപ്പെടുത്തിയ നമ്പർ'}`
    ].filter(Boolean).join('\n');

    return { record: item, customerMessage: msg };
}

function buildAdminMeeshoSlip(record) {
    return [
        `🛒 *XEVENZO MEESHO ORDER SLIP (${record.id})*`,
        `• *Customer Name:* ${record.name || '-'}`,
        `• *Customer Phone (OTP/Delivery):* ${record.phone || '-'}`,
        `• *Address:* ${record.address || '-'}`,
        `• *Pincode:* ${record.pincode || '-'}`,
        `• *Product:* ${record.productName || '-'} (${record.productId || '-'})`,
        `• *Qty:* ${record.qty || 1}`,
        `• *Reel Shared:* ${record.sharedReel ? 'Yes' : 'No'}`,
        `• *Payment Status:* ${record.paymentStatus}`
    ].join('\n');
}

if (require.main === module) {
    const sample = upsertMeeshoLead({
        customerJid: '919999999999@s.whatsapp.net',
        name: 'Test Customer',
        phone: '9876543210',
        address: 'House 12, Near Bus Stand',
        pincode: '679334',
        productId: 'XEV-104',
        productName: 'Smart Mini Blender',
        qty: 1,
        sharedReel: true
    });
    const tracked = setTrackingWithoutPrice(sample.id, 'Shipped / Out for Delivery', 'Meesho Express');
    console.log('✅ MEESHO FLOW TEST:', JSON.stringify({
        slip: buildAdminMeeshoSlip(sample),
        trackingMsg: tracked?.customerMessage
    }, null, 2));
}

module.exports = {
    ADMIN_PHONE,
    readLeads,
    saveLeads,
    upsertMeeshoLead,
    markPaymentVerified,
    setTrackingWithoutPrice,
    buildAdminMeeshoSlip
};
