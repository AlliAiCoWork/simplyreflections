# simplyreflections.co

Static site for Simply Reflections LLC (window cleaning, power washing, solar panel cleaning, bird guards, garbage can cleaning, junk removal, screens) with a subcontractor onboarding flow.

## Pages
- `/` home · `/screens` · `/sop` · `/agreement` (Independent Subcontractor Agreement, Appendices A–C)
- `/subcontractor-registration` (alias `/register`) — registration form → 4-digit SMS code → documents released

## Serverless functions (`/api`)
- `POST /api/register` — upserts the contact in GoHighLevel (Simply Reflections sub-account), tags `subcontractor` + `sub-otp-pending`, texts a 4-digit code
- `POST /api/verify` — checks the code, tags `sub-verified`, sends the Agreement (and SOP, if a template named *SOP* exists) from GHL Documents & Contracts, texts next steps
- `api/_lib.js` — shared helpers (not an endpoint)

## Environment variables (Vercel → Settings → Environment Variables, then Redeploy)
| Name | Value |
|---|---|
| `GHL_API_KEY` | Private Integration token — scopes: contacts read/write, custom fields read, conversations/message write, documents_contracts_template list + sendLink |
| `GHL_LOCATION_ID` | `7fSjxPg8lSVtLRGRMmEd` |
| `OTP_SECRET` | any long random string |
| `SITE_URL` | optional, defaults to `https://simplyreflections.co` |
| `GHL_SENDER_USER_ID` | optional GHL user id used as the document sender |

Until the three required variables exist, `/api/register` returns 503 and the page shows the "temporarily unavailable — text us" card.

## GHL custom fields used
`contact.ein`, `contact.emergency_contact_name`, `contact.emergency_contact_phone` (created 2026-09-08). Tags: `subcontractor`, `sub-otp-pending`, `sub-verified`.

## Deploy
Every push to `main` auto-deploys (Vercel project `simplyreflections-co`, team Alli AI - Claude Co Work). `vercel.json` enables clean URLs and the `/register` redirect.
