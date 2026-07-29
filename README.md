# EVE Alliance Standings Diff Tool

Builds a master standings list (seeded from a character's contacts and/or
manual entry), then compares it against the alliance's *current* contacts
to produce an Add / Remove / Change checklist.

## Important: this cannot write alliance standings

ESI has a read endpoint for alliance contacts (`GET /alliances/{alliance_id}/contacts/`)
but **no write endpoint** - there's no POST/PUT/DELETE for corp- or
alliance-level contacts. CCP has had an open feature request for this since
2018 (esi-issues #751) that's never been implemented. So there is no way,
via this tool or any other, to programmatically set alliance-wide standings.

What this tool does instead: pulls the current alliance contacts (read-only)
and diffs them against your master list, then hands you a checklist to apply
by hand - someone with the Alliance Executor role, in the client, under
Corporation > Contacts.

If you want the "reset/conform" automation instead, that's what the
companion tool (eve-standings-tool) does at the *personal character* level,
since `esi-characters.write_contacts.v1` does exist.

## Setup

### 1. Register an EVE SSO application
https://developers.eveonline.com - create an application with:
- Callback URL: `https://<your-railway-domain>/auth/callback`
- Scopes: `esi-characters.read_contacts.v1`, `esi-alliances.read_contacts.v1`

### 2. Environment variables (Railway → Variables)
See `.env.example`:
- `EVE_CLIENT_ID`, `EVE_CLIENT_SECRET`, `EVE_CALLBACK_URL`
- `SESSION_SECRET` - any long random string
- `ADMIN_PASSWORD` - gates the whole admin panel, including the SSO connect
  button (so this app doesn't just hand out a "connect your EVE account"
  page to anyone who stumbles on the URL)
- `DATA_DIR` - set to `/data` once you add a Volume

### 3. Add a Railway Volume
Settings → Volumes → mount path `/data`. This is where the master list
(`standings-list.json`) persists across deploys/restarts.

### 4. Deploy
Push to GitHub, connect the repo in Railway, deploy.

## Using it

1. Go to `/admin.html`, log in with `ADMIN_PASSWORD`.
2. Click **Connect with EVE SSO** and log in as a character - ideally one
   whose personal contacts already reflect the standings you want (or just
   any alliance member, for the diff step).
3. **Import contacts as master list**: pulls that character's contacts in
   as your starting list. "Replace" wipes the existing list; "Merge" upserts
   on top of it.
4. Refine the list with **Paste a list** (bulk names + one standing) or
   **Add one at a time** (search + dropdown), same as the other tool.
5. Click **Generate Checklist** - pulls the alliance's current contacts
   (read-only) and shows what to Add / Remove / Change, plus a plain-text
   copyable checklist. Nothing from that alliance-contacts pull is stored;
   it's only used to compute the diff for that one request.
6. Apply the checklist manually in the client (Corporation > Contacts,
   Alliance tab - requires the Executor role).

## Notes
- Reading alliance contacts requires the connected character to have
  sufficient standing/role visibility into the alliance; if the diff step
  errors, that's most likely why.
- Session cookies expire after 4 hours (`server.js`).
- Single-instance in-memory sessions, same caveat as the other tool if you
  ever scale to multiple Railway instances.
