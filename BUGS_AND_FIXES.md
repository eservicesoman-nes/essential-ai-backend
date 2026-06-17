# NES AI Platform — Bugs & Fixes Log

A running record of real production bugs found on this platform, their root causes, and how they were fixed. The goal is to recognize recurring patterns quickly instead of re-debugging the same class of problem from scratch each time.

Each entry should include: date, symptom, root cause, fix, and the general lesson (if any) that applies beyond this one bug.

---

## 2026-05-17 — Supabase auth completely broken at launch

**Symptom:** Signup/login failed outright when the platform was first being wired up.

**Root cause:** A typo in the Supabase project URL (missing a `j` in `sfpfjjdtczvuxyhjievt`), combined with an empty `SUPABASE_ANON` key. A separate, unrelated infinite loop bug in the frontend's `showPricing()` function compounded the confusion.

**Fix:** Corrected the project URL and populated the anon key. Fixed the infinite loop separately.

**General lesson:** When auth fails completely (not partially), check the most basic configuration values character-by-character before assuming the logic is wrong — a single missing letter in a project ref is easy to miss and impossible to catch by reading code logic alone.

---

## 2026-05-17 — CORS errors blocking all frontend-backend requests

**Symptom:** All API calls from the frontend failed with CORS errors.

**Root cause:** The backend's CORS config used a static `origin: FRONTEND_URL` value that didn't reliably match the actual deployed frontend origin (especially across Vercel preview URLs).

**Fix:** Replaced with `origin: function(origin, callback) { callback(null, true); }` — i.e. permissive CORS, reflecting any origin back. Acceptable here since the API requires its own auth token regardless of origin.

**General lesson:** For APIs that already enforce auth on every route, a static CORS allowlist often causes more outages than it prevents — permissive CORS plus real auth is usually safer in practice for a single-frontend SaaS like this.

---

## 2026-05-17 — Backend wouldn't start on Render (multiple stacked causes)

**Symptom:** Backend deploy failed/crashed on startup, sequentially, across several deploys.

**Root cause (stacked, fixed one at a time):** Missing service files (`services/image.js`, `services/router.js`) not committed to git; missing npm packages (`openai`, `@anthropic-ai/sdk`) not in `package.json`; a stale build cache on Render serving an old broken bundle even after fixes were pushed.

**Fix:** Committed the missing files, added the missing dependencies, and used Render's "Clear build cache & deploy" option to force a genuinely fresh build.

**General lesson:** When a fix is pushed but the deployed behavior doesn't change, check whether the host is serving a cached build before re-debugging the code itself.

---

## 2026-06-12 — Sara voice agent call loop (n8n workflow)

**Symptom:** Sara (the receptionist voice AI) was repeatedly re-calling the same leads instead of calling each one once.

**Root cause:** The `Get New Leads` node in the n8n workflow had no `status` filter at all — it pulled every lead regardless of status on every poll, including old leads already marked `call_failed` or `calling`. The `Dedup Check` node only deduplicated *within* a single batch, with no logic to act on a duplicate once found.

**Fix:** Added `status='new'` filter to `Get New Leads`. Added an `_dup_action` tag (`process`/`skip`) to `Dedup Check`, a new `Is Duplicate?` IF node, and a `Mark Duplicate Skipped` node that sets `status='duplicate_skipped'` so the same lead is never reprocessed.

**General lesson:** Any polling workflow that repeatedly queries a table needs an explicit status filter — "give me new work" queries that don't filter out already-processed rows will eventually loop on stale data once enough rows accumulate.

---

## 2026-06-14 — Adam's call outcomes never updating lead status

**Symptom:** Every call made by Adam (the enterprise voice agent) left the lead stuck on `call_failed`, regardless of how the call actually went.

**Root cause:** Adam's Vapi assistant was configured with a Server URL pointing to `.../webhook/adam-call-result` — an endpoint that was never built. Calls completed correctly in Vapi, but the result webhook had nowhere real to land.

**Fix (not yet applied — still open as of 2026-06-17):** Point Adam's Vapi Server URL to `.../webhook/sara-call-result` instead, the already-working Call Result Handler shared by Sara's pipeline.

**General lesson:** When a voice/call agent's outcomes never update downstream state, check the *receiving* webhook URL configured in the voice platform itself, not just the n8n/backend side — a typo'd or never-built endpoint there fails silently from the app's perspective (the call still "completes" from the agent's point of view).

---

## 2026-06-17 — Email Inbox: "No emails found" despite 5 configured accounts

**Symptom:** Inbox page showed "No emails found" indefinitely. All 5 configured `email_accounts` rows had `last_synced: null`, suggesting they had never successfully synced.

**Root cause (two separate, stacked bugs):**

1. The entire email feature (6 routes: accounts list, connect, inbox, send, delete, body) existed only in an orphaned top-level `router.js` file that `server.js` never mounted (it only requires `./services/router`). The feature had never been live in production at all, despite working code existing.
2. After moving the routes into the live `services/router.js`, the bug persisted with zero errors. Root cause: Row Level Security (RLS) on the `email_accounts` table silently blocked the anon key from reading rows. The exact same query returned 0 rows with the anon key and 5 rows with the service-role key — Supabase returns an empty array, not an error, when RLS blocks a key, making this look like "the table is empty" rather than "the request was blocked."

**Fix:**
- Moved all 6 routes + `encryptPassword`/`decryptPassword` helpers into `services/router.js`, importing the existing (and correct) `emailService.js`.
- Switched all `email_accounts` queries from the anon-key `supabase` client to the service-role `supabaseAdmin` client.
- Also fixed along the way: the inbox route never updated `last_synced` after a successful fetch; `/email/body` had duplicated inline decryption logic instead of reusing the shared helper.

**General lesson:** An empty array result from Supabase with no error is not proof a table is empty or unlinked — it can mean RLS silently filtered the key being used. Whenever a query that should return rows comes back empty with zero errors, test the same query with both the anon key and the service-role key directly (e.g. via a quick `node -e "..."` script) before concluding anything about the data itself. Also check whether the code path was even reached at all (look for expected `console.log`/`console.error` lines in `pm2 logs`) — a route that returns early on an empty result will never log anything, masking the real problem upstream.

---

## 2026-06-17 — CEO Dashboard Intelligence Feed links going to wrong articles (regression of a May 29 fix)

**Symptom:** Links on CEO Dashboard feed items led to unrelated/wrong articles. This is a regression — `source_url` had already been fixed once before, on 2026-05-29.

**Root cause:** The n8n "Intelligence Feed" workflow's `Code in JavaScript` node determined `source_url` two ways, in order: (1) extract a URL from a `🔗 [link]` line inside the AI's own generated briefing text, or (2) fall back to a substring match between the AI's story title and the original RSS item title (checking if the first 30 characters of one title appeared inside the other). Both paths depend on the AI (Claude Haiku) faithfully reproducing exact text it was given — the verbatim URL, or a title close enough for a naive substring match to succeed. When the AI paraphrased a title more than usual or omitted the `🔗` line on a given run, both paths silently produced an empty string, which the frontend then treated as "find the link yourself" and fell back to scraping random URLs out of the content field.

**Why the original May 29 fix didn't last:** That fix was probabilistic, not deterministic — it worked exactly as long as the AI's free-text output reliably matched the assumptions baked into the parsing code. There was no validation step confirming `source_url` was actually non-empty before insert, so the failure was completely silent: no error, no crash, `ceo_feed` rows just slowly accumulated with `source_url: null` again over time, with nothing flagging it until someone manually noticed wrong links weeks later.

**Fix (applied and confirmed live 2026-06-17):** Rewrote the matching logic to never depend on the AI's echoed text for the source URL. It now matches the AI-generated story title against the real RSS item titles (the ones actually fetched from Google News RSS, never touched by the AI) using word-overlap scoring (shared significant words / total words, ≥40% required to accept a match) instead of a fragile substring check. The AI's own `🔗` line is now only a last-resort fallback, not the primary path. Verified via a manual workflow execution: fresh `ceo_feed` rows now show real article URLs, and the CEO Dashboard correctly displays working links.

**General lesson:** Any pipeline step that asks an LLM to faithfully echo back exact data it was given (a URL, an ID, an exact title) rather than just reason over it, is a latent reliability bug — LLMs paraphrase by default. Wherever possible, match back to the original structured data instead of parsing the LLM's free-text restatement of it. Also: fields like `source_url` that silently default to an empty string on failure should have a periodic check (e.g. "alert if >X% of this week's feed items have empty source_url") since this class of bug produces no error and can sit unnoticed indefinitely.

---

## 2026-06-17 — Backend crash-loop after deploying a new Supabase client

**Symptom:** `pm2 describe nes-backend` showed 14 unstable restarts, 0s uptime, immediately after deploying a new feature (the `create-login` endpoint, which introduced a second `supabaseAdmin` Supabase client).

**Root cause:** Node.js 20 doesn't have native WebSocket support, which Supabase's realtime client requires. The original `supabase` client had already been fixed earlier the same night by passing the `ws` package via `realtime: { transport: ws }`. A git auto-merge silently dropped that fix from the original client, and the newly added `supabaseAdmin` client was created without it either — so creating *either* client crashed the process on startup.

**Fix:** Restored `require('ws')` and `realtime: { transport: ws }` on both Supabase client instantiations. Verified via `pm2 describe` (0 unstable restarts) and a live `curl` request.

**General lesson:** A clean git merge (no conflict markers) does not guarantee no logic was lost — it only guarantees no *textual* conflict. After any merge that touches a file with environment-specific fixes (like this one), explicitly `grep` for the fix by name before considering a deploy complete. Don't trust "Auto-merging... Merge made by the 'ort' strategy" as proof that everything is intact.

---

## Template for new entries

```
## YYYY-MM-DD — Short title

**Symptom:** What the user/observer actually saw.

**Root cause:** What was actually wrong, in plain terms.

**Fix:** What was changed to resolve it.

**General lesson:** (optional) A reusable principle for next time, if one exists.
```
