# simplyreflections.co

Static site for Simply Reflections LLC (window cleaning, power washing, solar panel cleaning, bird guards, garbage can cleaning, junk removal, screens).

## Pages
- `/` home · `/screens` · `/sop` · `/agreement` (Independent Subcontractor Agreement, Appendices A–C)
- `/subcontractor-registration` (alias `/register`) — embeds the GoHighLevel form **Sub-Contractor Registration** (form id `cmluepKoUFj467gwgBaP`, Simply Reflections sub-account). Submissions go straight into GHL; the agreement/SOP e-sign texts and the signed-notification are GHL workflows.

No serverless functions and no environment variables — the site is pure static HTML/CSS/JS.

## Deploy
Vercel auto-deploys every push to `main` (`cleanUrls` and the `/register` redirect live in `vercel.json`).
