const fs = require('fs');
const path = require('path');

const LEADS_PATH = path.join(__dirname, 'leads.json');
const ADMIN_PHONE = '918078426656';
const TRACK_URL = 'https://xevenzo-backend.onrender.com/track';
const UPI_ID = '8078426656@naviaxis';
const PAYEE_NAME = 'MOHAMMED RAFI K';

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
        paymentStatus: existing.paymentStatus || 'PENDING_ADDRESS_OR_QR',
        trackingInfo: existing.trackingInfo || '',
        updatedAt: new Date().toISOString()
    };

    if (idx >= 0) leads[idx] = record;
    else leads.push(record);

    saveLeads(leads);
    return record;
}

function buildQrPaymentPromptAfterAddress(record) {
    const hasAddressAndPhone = Boolean(record.address && record.pincode && record.phone);
    if (!hasAddressAndPhone) {
        return [
            `ഓർഡർ ഉറപ്പിക്കാൻ താഴെ പറയുന്ന വിവരങ്ങൾ കൂടി നൽകാമോ?`,
            `• *പൂർണ്ണ വിലാസം & പിൻകോഡ്*`,
            `• *ഫോൺ നമ്പർ* (ഡെലിവറി/OTP വിവരങ്ങൾക്കായി)`,
            `• *ആവശ്യമുള്ള എണ്ണം*`
        ].join('\n');
    }

    return [
        `നിങ്ങളുടെ അഡ്രസ്സും വിവരങ്ങളും രേഖപ്പെടുത്തിയിട്ടുണ്ട് (${record.id}). ✅`,
        `പേയ്‌മെന്റ് പൂർത്തിയാക്കാൻ താഴെ കാണുന്ന UPI വിവരങ്ങൾ ഉപയോഗിക്കുക:`,
        `• *പേര്:* ${PAYEE_NAME}`,
        `• *UPI ID:* \`${UPI_ID}\``,
        `പേയ്‌മെന്റ് ചെയ്ത ശേഷം സ്ക്രീൻഷോട്ട്/വിവരം ഇവിടെ അയക്കുക. പേയ്‌മെന്റ് വെരിഫൈ ചെയ്താലുടൻ ഓർഡർ കൺഫേം ചെയ്യും.`
    ].join('\n');
}

function markPaymentVerified(orderId, note = 'Verified via Admin/UPI') {
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
        `• *ഡെലിവറി നമ്പർ:* ${item.phone || 'രേഖപ്പെടുത്തിയ നമ്പർ'}`,
        ``,
        `🔗 *Track cheyyan:* ${TRACK_URL}`,
        `Order ID: ${item.id} + Phone-ന്റെ അവസാന 4 അക്കം കൊടുത്താൽ മതി`
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
        qrPrompt: buildQrPaymentPromptAfterAddress(sample),
        slip: buildAdminMeeshoSlip(sample),
        trackingMsg: tracked?.customerMessage
    }, null, 2));
}

module.exports = {
    ADMIN_PHONE,
    UPI_ID,
    PAYEE_NAME,
    readLeads,
    saveLeads,
    upsertMeeshoLead,
    buildQrPaymentPromptAfterAddress,
    markPaymentVerified,
    setTrackingWithoutPrice,
    buildAdminMeeshoSlip
};
