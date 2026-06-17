# NES AI Platform — Bugs & Fixes Log

A running record of real production bugs found on this platform, their root causes, and how they were fixed. The goal is to recognize recurring patterns quickly instead of re-debugging the same class of problem from scratch each time.

Each entry should include: date, symptom, root cause, fix, and the general lesson (if any) that applies beyond this one bug.

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
