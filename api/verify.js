// POST /api/verify
// Checks the 4-digit code against the signed token. On success:
//   1. tags the GHL contact "sub-verified" (workflow-compatible),
//   2. sends the Subcontractor Agreement (and SOP, if a template exists) from
//      GoHighLevel Documents & Contracts via the API,
//   3. texts the subcontractor a confirmation with the next steps.
// Everything in step 2/3 degrades gracefully: if templates or scopes are missing,
// the sub still gets a text with links to the agreement and SOP pages.
const lib = require('./_lib');

const MAX_ATTEMPTS = 5;
const SITE = process.env.SITE_URL || 'https://simplyreflections.co';
const SOP_LINK = SITE + '/sop.html';
const AGREEMENT_LINK = SITE + '/agreement.html';

async function releaseDocuments(cfg, contactId) {
  const report = { agreement: 'not sent', sop: 'not sent' };
  let templates = [];
  try {
    const t = await lib.ghl(cfg, 'GET', '/proposals/templates?locationId=' + encodeURIComponent(cfg.locationId) + '&limit=50');
    templates = (t.data || t.templates || []).filter((x) => x && !x.deleted);
  } catch (e) {
    report.templates = 'unavailable: ' + e.message;
  }
  const pick = (re) => templates.find((x) => re.test(String(x.name || '')));
  const agreement = pick(/agreement/i);
  const sop = pick(/\bsop\b|standard[ _-]?operating/i);
  const userId = process.env.GHL_SENDER_USER_ID
    || (agreement && (agreement.updatedBy || agreement.createdBy))
    || (templates[0] && (templates[0].updatedBy || templates[0].createdBy));

  async function sendTemplate(tpl) {
    return lib.ghl(cfg, 'POST', '/proposals/templates/send', {
      templateId: tpl.id || tpl._id, userId, contactId, sendDocument: true,
    });
  }
  if (agreement && userId) {
    try { await sendTemplate(agreement); report.agreement = 'sent: ' + agreement.name; }
    catch (e) { report.agreement = 'failed: ' + e.message; }
  }
  if (sop && userId) {
    try { await sendTemplate(sop); report.sop = 'sent: ' + sop.name; }
    catch (e) { report.sop = 'failed: ' + e.message; }
  }

  const parts = ['Simply Reflections: you are verified!'];
  parts.push(report.agreement.startsWith('sent')
    ? 'Your Subcontractor Agreement is on its way to e-sign - watch for the signing link from Simply Reflections. You can read it any time here: ' + AGREEMENT_LINK
    : 'Step 1: read and be ready to sign the Subcontractor Agreement: ' + AGREEMENT_LINK);
  parts.push(report.sop.startsWith('sent')
    ? 'Our Standard Operating Procedures will follow separately for your acknowledgment.'
    : 'Step 2: review our Standard Operating Procedures: ' + SOP_LINK);
  parts.push('Questions? Just reply to this text.');
  try {
    await lib.ghl(cfg, 'POST', '/conversations/messages', { type: 'SMS', contactId, message: parts.join(' ') });
    report.sms = 'sent';
  } catch (e) {
    report.sms = 'failed: ' + e.message;
  }
  return report;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const cfg = lib.config();
  if (!cfg) return res.status(503).json({ error: 'Online registration is temporarily unavailable.' });

  const b = await lib.readJson(req);
  const p = lib.unsign(b.token, cfg.secret);
  if (!p || !p.cid || !p.ch || !p.n) return res.status(400).json({ error: 'This verification session is invalid. Tap "Resend code" to start again.' });
  if (Date.now() > Number(p.exp || 0)) return res.status(410).json({ error: 'That code expired. Tap "Resend code" to get a new one.' });
  if (Number(p.att || 0) >= MAX_ATTEMPTS) return res.status(410).json({ error: 'Too many attempts. Tap "Resend code" to get a new one.' });

  const submitted = String(b.code || '').replace(/\D/g, '');
  const ok = submitted.length === 4 && lib.safeEqual(lib.codeHash(cfg.secret, p.cid, p.n, submitted), p.ch);
  if (!ok) {
    await lib.sleep(500);
    const att = Number(p.att || 0) + 1;
    const left = MAX_ATTEMPTS - att;
    return res.status(400).json({
      error: left > 0
        ? 'That code did not match. ' + left + (left === 1 ? ' attempt' : ' attempts') + ' left.'
        : 'Too many attempts. Tap "Resend code" to get a new one.',
      token: lib.sign(Object.assign({}, p, { att }), cfg.secret),
    });
  }

  try {
    await lib.ghl(cfg, 'POST', '/contacts/' + p.cid + '/tags', { tags: ['sub-verified'] });
    await lib.ghl(cfg, 'DELETE', '/contacts/' + p.cid + '/tags', { tags: ['sub-otp-pending'] }).catch(() => {});
  } catch (e) {
    console.error('verify tag error:', e.message);
    return res.status(502).json({ error: 'You are verified, but we hit a snag releasing your documents. Text us at 602-999-3983 and we will send them right over.' });
  }

  const report = await releaseDocuments(cfg, p.cid);
  console.log('documents released for', p.cid, JSON.stringify(report));
  return res.status(200).json({ ok: true, documents: { agreement: report.agreement.split(':')[0], sop: report.sop.split(':')[0] } });
};
