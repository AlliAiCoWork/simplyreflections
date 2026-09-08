// POST /api/register
// Creates/updates the subcontractor in GoHighLevel (Simply Reflections sub-account),
// texts them a 4-digit verification code, and returns a signed token for /api/verify.
const crypto = require('crypto');
const lib = require('./_lib');

const OTP_TTL_MS = 10 * 60 * 1000;
const REQUIRED = ['firstName', 'lastName', 'companyName', 'address1', 'city', 'state', 'postalCode', 'ein', 'emergencyName', 'emergencyPhone'];
const CUSTOM_FIELDS = { ein: 'EIN', emergencyName: 'Emergency Contact Name', emergencyPhone: 'Emergency Contact Phone' };
const TAGS = ['subcontractor', 'sub-otp-pending'];

let fieldCache = { at: 0, map: {} };

async function customFieldMap(cfg) {
  if (Date.now() - fieldCache.at < 10 * 60 * 1000 && Object.keys(fieldCache.map).length) return fieldCache.map;
  const data = await lib.ghl(cfg, 'GET', '/locations/' + cfg.locationId + '/customFields?model=contact');
  const map = {};
  (data.customFields || []).forEach((f) => {
    if (f.name) map[String(f.name).toLowerCase()] = f.id;
    if (f.fieldKey) map[String(f.fieldKey).toLowerCase()] = f.id;
  });
  fieldCache = { at: Date.now(), map };
  return map;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const cfg = lib.config();
  if (!cfg) return res.status(503).json({ error: 'Online registration is temporarily unavailable.' });

  const b = await lib.readJson(req);
  const phone = lib.normalizePhone(b.phone);
  const missing = REQUIRED.filter((k) => !lib.clean(b[k]));
  if (missing.length || !phone) {
    return res.status(400).json({ error: 'Please complete all required fields with a valid 10-digit cell phone number.' });
  }
  const einDigits = lib.clean(b.ein, 20).replace(/\D/g, '');
  if (einDigits.length !== 9) return res.status(400).json({ error: 'An EIN is 9 digits (format 12-3456789).' });
  const ein = einDigits.slice(0, 2) + '-' + einDigits.slice(2);

  try {
    const fields = await customFieldMap(cfg).catch(() => ({}));
    const customFields = [];
    const add = (label, value) => {
      const id = fields[label.toLowerCase()];
      if (id && value) customFields.push({ id, field_value: value });
    };
    add(CUSTOM_FIELDS.ein, ein);
    add(CUSTOM_FIELDS.emergencyName, lib.clean(b.emergencyName, 120));
    add(CUSTOM_FIELDS.emergencyPhone, lib.normalizePhone(b.emergencyPhone) || lib.clean(b.emergencyPhone, 40));

    let website = lib.clean(b.website, 200);
    if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;

    const payload = {
      locationId: cfg.locationId,
      firstName: lib.clean(b.firstName, 80),
      lastName: lib.clean(b.lastName, 80),
      phone,
      companyName: lib.clean(b.companyName, 150),
      address1: lib.clean(b.address1, 200),
      city: lib.clean(b.city, 100),
      state: lib.clean(b.state, 40).toUpperCase(),
      postalCode: lib.clean(b.postalCode, 20),
      country: 'US',
      source: 'Website - Subcontractor Registration',
      tags: TAGS,
      customFields,
    };
    if (website) payload.website = website;

    const upsert = await lib.ghl(cfg, 'POST', '/contacts/upsert', payload);
    const contactId = upsert && upsert.contact && upsert.contact.id;
    if (!contactId) throw new Error('GHL upsert returned no contact id');

    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    await lib.ghl(cfg, 'POST', '/conversations/messages', {
      type: 'SMS',
      contactId,
      message: 'Simply Reflections: your verification code is ' + code + '. It expires in 10 minutes.',
    });

    const nonce = crypto.randomBytes(8).toString('hex');
    const token = lib.sign({
      cid: contactId,
      n: nonce,
      ch: lib.codeHash(cfg.secret, contactId, nonce, code),
      exp: Date.now() + OTP_TTL_MS,
      att: 0,
    }, cfg.secret);

    return res.status(200).json({ ok: true, token, phoneMasked: lib.maskPhone(phone) });
  } catch (e) {
    console.error('register error:', e.message);
    const authProblem = e.status === 401 || e.status === 403;
    return res.status(authProblem ? 503 : 502).json({
      error: authProblem
        ? 'Online registration is temporarily unavailable.'
        : 'We could not send your verification code. Please check the number and try again.',
    });
  }
};
