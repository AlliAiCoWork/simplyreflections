// Shared helpers for the Simply Reflections subcontractor registration functions.
// Files starting with "_" inside /api are not exposed as endpoints by Vercel.
const crypto = require('crypto');

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

function config() {
  const { GHL_API_KEY, GHL_LOCATION_ID, OTP_SECRET } = process.env;
  if (!GHL_API_KEY || !GHL_LOCATION_ID || !OTP_SECRET) return null;
  return { apiKey: GHL_API_KEY, locationId: GHL_LOCATION_ID, secret: OTP_SECRET };
}

async function ghl(cfg, method, path, body) {
  const res = await fetch(GHL_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + cfg.apiKey,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error('GHL ' + method + ' ' + path + ' -> ' + res.status + ': ' + String(data.message || text).slice(0, 300));
    err.status = res.status;
    throw err;
  }
  return data;
}

function readJson(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
  });
}

function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }

function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

function maskPhone(e164) {
  const d = String(e164).replace(/\D/g, '').slice(-10);
  return '(' + d.slice(0, 3) + ') ***-' + d.slice(6);
}

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + mac;
}

function unsign(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (expect.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(mac))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
}

// The 4-digit code never travels to the browser; only this keyed hash does.
function codeHash(secret, contactId, nonce, code) {
  return crypto.createHmac('sha256', secret).update(contactId + '|' + nonce + '|' + code).digest('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { config, ghl, readJson, clean, normalizePhone, maskPhone, sign, unsign, codeHash, safeEqual, sleep };
