// POST /api/verify
// Checks the 4-digit code against the signed token. On success, tags the GHL contact
// "sub-verified" (the workflow that sends the Agreement + SOP eDocs triggers on that tag).
const lib = require('./_lib');

const MAX_ATTEMPTS = 5;

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
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('verify error:', e.message);
    return res.status(502).json({ error: 'You are verified, but we hit a snag releasing your documents. Text us at 602-999-3983 and we will send them right over.' });
  }
};
