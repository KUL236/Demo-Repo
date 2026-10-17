# MailSecure (SecureMailScope) — Netlify Demo Prototype

This is a **frontend-only, deployable prototype** of SecureMailScope, built
from the original `frontend/` app in the project export. It keeps the full
UI (dark mode, all 9 workspace pages, the assistant widget) and swaps the
FastAPI cookie-auth for **real Supabase email/password authentication**, so
you can deploy it to Netlify on its own — no backend server required.

Everywhere else (sessions, findings, investigations, reports, the chatbot)
the app tries the real API first and — since there's no backend behind a
static Netlify site — gracefully falls back to a **real, bundled sample
analysis** (`src/sampleAnalysis.js`), so the workspace is never empty or
showing invented numbers. That's the "demo mode" you'll see throughout.

---

## 1. Set up Supabase (5 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **Authentication → Providers → Email** and make sure Email is
   enabled. Under **Authentication → Settings**, decide whether "Confirm
   email" is ON (safer, but sign-up won't log the user in immediately — the
   app handles this with a "check your inbox" screen) or OFF (instant
   sign-up → logged in, better for a live demo/judge walkthrough).
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

These are the public, browser-safe keys (not the service-role key) — fine
to put in Netlify's environment variables.

## 2. Run it locally (optional, to preview before deploying)

```bash
npm install
cp .env.example .env      # then paste your two Supabase values into it
npm run dev
```

Opens at `http://localhost:5173`. Sign up, then explore the sidebar —
Overview, PCAP Analysis, Analytics, Sessions, Findings, Threat Intel,
Reports, Tools, Settings.

## 3. Deploy to Netlify

**Option A — drag & drop (fastest for a one-off demo):**
```bash
npm install
npm run build
```
Then drag the generated `dist/` folder onto
[app.netlify.com/drop](https://app.netlify.com/drop). Afterwards, open
**Site configuration → Environment variables**, add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and trigger a redeploy
(drag-and-drop deploys don't rebuild automatically on env changes, so
you'll need to rebuild locally and re-drag, or switch to Option B).

**Option B — connect the Git repo (recommended, rebuilds automatically):**
1. Push this folder to a GitHub/GitLab repo.
2. In Netlify: **Add new site → Import an existing project**, pick the
   repo. Build settings are already in `netlify.toml`
   (`npm install && npm run build`, publish `dist`) — Netlify will detect
   them automatically.
3. Add the two `VITE_SUPABASE_*` env vars under **Site configuration →
   Environment variables** *before* the first deploy (or trigger a
   redeploy after adding them).
4. Deploy. You'll get a `*.netlify.app` URL you can share or screenshot
   for your PPT.

`public/_redirects` + the `[[redirects]]` block in `netlify.toml` both
route all paths to `index.html`, so client-side navigation and page
refreshes work correctly on Netlify's static hosting.

---

## What's real vs. simulated in this build

| Area | Status |
|---|---|
| Auth (sign up / sign in / sign out / forgot password / profile update) | **Real** — Supabase Auth |
| UI (all 9 pages, dark/light theme, responsive layout, animations) | **Real** — same React/Vite app as the full project |
| PCAP upload → analysis pipeline, live sessions/findings, report generation, assistant chatbot | **Simulated** — these call `/api/...` routes that only exist on the FastAPI backend (`../backend` in the original export). With no backend deployed, the UI catches the failed request and falls back to the bundled sample investigation below. Point `vite.config.js`'s dev proxy (or a production reverse proxy) at a running backend to make these live. |

---

## The 4 findings in the bundled sample investigation

The sample capture (`public/sample-data/sample_traffic.pcap`, 4 packets)
was actually run through the real parsing code
(`tcp_reassembly.py` + `smtp_starttls.py`) — nothing in the results below
is invented. This is what populates the Findings page (and the Overview /
Analytics / Sessions pages) by default, and it's a good, honest 4-item demo
to talk through slide-by-slide:

1. **Cleartext HTTP request observed — Medium severity, 95% confidence**
   A plaintext HTTP `GET / HTTP/1.1` for `example.com` was captured on port
   80 (session `sess-2`, `192.168.1.10 → 93.184.216.34`). Because it's
   unencrypted, anything sent on that connection — including any
   credentials — would be visible to anyone on the network path. This is
   the one clearly actionable finding in the set.

2. **Incomplete TCP capture (port 443) — Low severity, 100% confidence**
   Session `sess-1` only captured the TCP `SYN` and `SYN-ACK`; no TLS
   `ClientHello`/`ServerHello` or certificate data followed. The tool is
   explicit that this session *cannot* be evaluated for TLS version,
   cipher suite, or certificate validity — it reports the gap instead of
   guessing.

3. **Incomplete TCP capture (port 80) — Low severity, 100% confidence**
   Session `sess-2` (the same one as finding #1) has no handshake
   (SYN/SYN-ACK) or teardown (FIN/RST) around the HTTP request — the
   capture window only covers one mid-stream packet, so the session is
   flagged as structurally incomplete on top of being cleartext.

4. **No email-protocol sessions in this capture — Info severity, 100% confidence**
   None of the 3 reconstructed streams matched SMTP, IMAP, or POP3 (with
   or without STARTTLS) — the sample is a generic connectivity capture,
   not mail traffic. This finding is here on purpose: it shows the tool
   correctly saying "there's nothing for me to analyze here" rather than
   forcing a mail-security verdict onto non-mail traffic. Upload a capture
   with port 25/143/110/465/587/993/995 sessions to actually exercise the
   STARTTLS/TLS/certificate rule engine end to end.

Together these 4 findings walk through the tool's core value props in one
tiny capture: it flags real cleartext exposure, it's honest about
incomplete evidence instead of fabricating a verdict, and it correctly
scopes itself to email-protocol traffic. That's a natural narrative for a
PPT: **Finding 1** = "here's a real risk we catch," **Findings 2–3** =
"here's how we handle incomplete evidence honestly," **Finding 4** =
"here's how we scope the tool correctly."

(Separately, the backend's automated test suite — not part of this
frontend demo — has 41 unit tests across parsing, certificate/TLS rules,
cipher-suite/forward-secrecy logic, and the ML model; see the original
project's `docs/TESTING.md` if you need those numbers too.)

---

## Files added/changed for this demo vs. the original `frontend/`

- `src/supabaseClient.js` — new Supabase client (reads `VITE_SUPABASE_*`)
- `src/api.js` — `authApi` now calls Supabase instead of `/api/auth/*`
- `src/sampleAnalysis.js` — added `SAMPLE_THREAT_INTEL` (indicators
  correlated from the 4 sample findings, grouped by session) and
  `ASSISTANT_KB` (glossary + findings + threat intel, used by the
  chatbot's offline fallback)
- `src/App.jsx` — signup now sends the real name field, added a "confirm
  your email" screen, wired "Forgot password" to a real Supabase reset
  email, sidebar status widget now reports Supabase connectivity instead
  of backend health, top-bar shows the signed-in user's name/initials,
  upload-error copy updated to explain the no-backend demo mode; Threat
  Intelligence now always shows the sample-derived indicators + a scope
  note instead of an empty state when there's no live investigation; the
  assistant chatbot answers from `ASSISTANT_KB` locally when
  `/api/assistant` isn't reachable, instead of just saying it can't connect
- `src/styles.css` — added `.grid-4` (Threat Intel's 4 severity tiles) and
  `white-space: pre-line` on chatbot bubbles (so the assistant's
  multi-line answers render with line breaks)
- `netlify.toml`, `public/_redirects`, `.env.example` — new, for deploy

## Threat Intelligence page in this demo build

Instead of requiring a live investigation (which this static build never
has), the page now always shows something, correlated from the same 4
sample findings:

- **MEDIUM** — `192.168.1.10 → 93.184.216.34:80`: combines Finding 1
  (cleartext HTTP) + Finding 3 (incomplete capture on that same session)
- **LOW** — `192.168.1.10 → 93.184.216.34:443`: Finding 2 (incomplete
  TCP/TLS capture)
- A separate **Scope note** card carries Finding 4 (no email-protocol
  sessions in this capture) — it isn't tied to one session, so it's shown
  on its own rather than forced into a fake indicator.

## The chatbot now explains all 4 findings + threat intel offline

Since `/api/assistant` isn't reachable from a static Netlify deploy, the
widget answers from a small local knowledge base instead of just failing.
Try:
- **"Summarize all 4 findings"** — full detail on every finding
- **"Finding 1"** … **"Finding 4"** — any single finding by number
- **"Threat intel indicators"** — the 2 correlated indicators + scope note
- **STARTTLS / self-signed / forward secrecy / expired certificate** —
  glossary definitions
(Point a real backend at `/api/assistant` to replace this with the live,
LLM-backed assistant from the original project.)
