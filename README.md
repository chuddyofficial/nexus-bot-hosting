# Nexus Bot Hosting

Free public bot hosting for Python and Node.js bots. Users sign up, create up to 5 bots,
upload their code (drag-and-drop files/folders, .zip uploads with in-browser extraction,
or SFTP via WinSCP/FileZilla/etc.), edit files with a full Monaco (VS Code) editor, watch
a live streaming console, tune startup behavior and resource limits, and start/stop their
bot — each running as its own OS process with its own SQLite database. See "Bot isolation
model" below for what that does and doesn't guarantee.

## Structure

- `server/` — Express API (auth, bot lifecycle, file manager, process orchestration)
- `client/` — React (Vite) frontend
- `bots/` — per-user bot folders created at runtime (gitignored)
- `installer/install.bat` — one-shot Windows VPS installer/service setup
- `installer/linux/install-node.sh` — optional Linux bot node (bot files + Docker + SFTP)

## Bot isolation model

**Recommended: run bots on a Linux bot node** (see "Running bots on a separate Linux machine"
below). With `BOT_NODE_URL` set, bots run in real per-bot Docker containers on a Linux machine -
full filesystem isolation and kernel-enforced CPU/memory limits - while this Windows VPS keeps
hosting the website. Everything below describes the fallback used when no bot node is configured.

Bots originally ran in per-bot Docker containers. This VPS's host doesn't support nested
virtualization, which both WSL2 and Hyper-V require, so Docker Desktop can't run here at
all — `wsl -l -v` shows no distributions and `docker ps` fails with a pipe error no matter
how many times Docker Desktop is reinstalled. `server/src/process/processService.js` runs
each bot as a plain native child process instead (`server/src/docker/` no longer exists).

This is a real trade-off, not a transparent swap:

- **No filesystem isolation.** Every bot runs as the same Windows user as the app itself.
  There's no bind-mount/chroot equivalent for a plain child process — a bot's own code
  could read or write outside its folder if it tried to. `pathSafety.js`'s traversal
  guards still protect the file manager and SFTP endpoints, but they never protected
  what a bot's *own running code* can do, with Docker or without it.
- **Soft, not hard, resource limits.** CPU/memory limits are enforced by polling process
  usage every few seconds (`processService.js`) and killing the process if it's over
  budget for several consecutive polls — not a kernel-enforced cgroup cap. A bot can
  transiently spike above its configured limit between polls.
- **No process/PID isolation.** Bot processes are ordinary siblings of the Node app in
  the Windows process list, not contained in their own namespace.

If nested virtualization ever becomes available from the hosting provider, or this
platform needs to serve untrusted users at real scale, moving to a Linux VPS with real
Docker Engine (no nested virtualization required on Linux) restores full isolation.

## Design system

Two intentionally separate visual identities, scoped so neither leaks into the other:

- **Landing + auth pages** (`Landing.jsx`, `Signup.jsx`, `Login.jsx`, etc.) — a terminal/
  console aesthetic (amber-on-black, JetBrains Mono, command-style copy). Styled by
  `client/src/styles/global.css`, everything scoped under a `.landing-scope` wrapper class.
- **The logged-in app** (dashboard, bot pages, account, admin) — a dark technical console:
  indigo accent (`#6e76ff`) on graphite, Inter for UI chrome, monospace reserved for actual
  data (logs, code, credentials, env vars). Styled by `client/src/styles/app.css`, classes
  prefixed `app-*` (`.app-card`, `.app-btn-primary`, etc.), scoped under `.app-scope`.
  Persistent left sidebar (`AppShell.jsx`) with top-level nav (Dashboard, Admin, Account)
  plus each bot's own six tabs nested inline under it when you're inside that bot.

Do not mix classes between the two systems (`.card` vs `.app-card`) — they're deliberately
namespaced apart so a stray unscoped selector can't bleed from one identity into the other.

## Local development

**Prerequisites:** Node.js 20+, plus Python 3.x on PATH if you want to actually start
Python bots locally (Node bots just need Node, which you already have).

```bash
# Backend
cd server
copy .env.example .env      # fill in RESEND_API_KEY, JWT_SECRET, etc.
npm install
npm run dev                 # http://localhost:4000

# Frontend (separate terminal)
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

If `python`/`node` aren't on PATH, everything except actually starting that runtime's
bots works (signup, login, file manager, editor) — the start call fails with a spawn
error instead. Override the binaries used with `PYTHON_BIN`/`NODE_BIN` in `.env` if
they're not on PATH under their default names.

Without `RESEND_API_KEY` set, emails are skipped (logged to console) instead of failing.

## Production deploy (Windows VPS)

1. Copy this whole folder onto the Windows VPS.
2. Right-click `installer\install.bat` → **Run as administrator**.
3. Follow the prompts (domain defaults to `bot.chnexus.net`, port defaults to `4000`).
4. In Cloudflare DNS, point your domain at the VPS's public IP with an **A record**,
   proxy (orange cloud) **on**.
5. In Cloudflare, set **SSL/TLS → Overview → encryption mode** to **Flexible**.

The installer:
- Installs Node.js if missing, and checks for Python on PATH (Python bots need it)
- Installs server + client dependencies and builds the production client
- Writes `server/.env` with a generated `JWT_SECRET` and your chosen domain/port
- Installs [Caddy](https://caddyserver.com) as a reverse proxy listening on port 80
- Opens the Windows Firewall for the app port plus 80/443
- Installs two Windows services via NSSM, so both survive reboots:
  - `NexusBotHosting` — the Node app (internal port, default 4000)
  - `NexusBotHostingWeb` — Caddy, forwarding port 80 → the Node app

**Why Caddy is needed:** Cloudflare's proxy (orange cloud) always connects to your origin
server on port 80 or 443 — never a custom app port — unless you're on Cloudflare Spectrum.
Caddy sits in front of the Node app so something is actually listening on port 80. Without
this, requests through Cloudflare fail with a 522 (connection timed out) even though the
app works fine on `localhost:<port>`.

**Why Flexible mode:** Cloudflare terminates HTTPS for visitors and talks plain HTTP to
Caddy on port 80 — visitors always see a padlock, but the Cloudflare-to-origin leg is
unencrypted. This is the simplest working setup and fine for most cases. To upgrade to
end-to-end HTTPS later, install a free [Cloudflare Origin Certificate](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)
on the VPS, point Caddy at it, and switch Cloudflare to "Full (strict)".

## Running bots on a separate Linux machine (bot node)

The website (panel: UI, accounts, database, emails) can stay on the Windows VPS while the
bots themselves — their files, their Docker containers, and SFTP — live on a Linux machine.
This avoids running Docker Desktop on Windows Server.

```
 users ──HTTPS──> Cloudflare ──> Windows: Caddy + panel ──HTTPS (pinned cert + token)──> Linux bot node
 users ──SFTP (port 2222)──────────────────────────────────────────────────────────────> Linux bot node
```

**On the Linux machine** (Ubuntu/Debian/RHEL-family):

```bash
git clone https://github.com/chuddyofficial/nexus-bot-hosting.git
cd nexus-bot-hosting
sudo PANEL_IP=<windows-vps-public-ip> bash installer/linux/install-node.sh
```

It installs Docker + Node 20, runs `server/src/botnode/agent.js` as the `nexus-node`
systemd service, opens ports 8443 (only from `PANEL_IP`, if given) and 2222, and prints
`BOT_NODE_URL`, `BOT_NODE_TOKEN`, `BOT_NODE_CA` and `SFTP_HOST` (also saved to
`/etc/nexus-node/panel-settings.txt`).

**On the Windows panel:** paste those lines into `server\.env` and restart the
`NexusBotHosting` service (or re-run `install.bat` and choose the remote-node option).

What the node does (`server/src/botnode/`):
- `agent.js` — HTTPS server. `/agent/*` handles bot folder create/delete and the whole file
  manager (same code as local mode, `services/fileRoutes.js`); every other path is a
  **filtered** pass-through to the local Docker socket (`dockerGuard.js`): only `nexus-bot-*`
  containers, only the two runtime images, and container specs that bind-mount nothing but
  that bot's own folder, with no privileged flags/devices/extra mounts. Raw Docker access is
  root-equivalent, so this keeps a leaked token from becoming full control of the Linux box.
- Runs the SFTP server next to the files. The panel pushes SFTP logins (username + bcrypt
  hash) to the node on change and every 5 minutes.
- Auth is a 64-hex-char bearer token; TLS uses a self-signed cert generated at install that
  the panel pins via `BOT_NODE_CA`.

Existing bots: their files stay on Windows under `bots\`. To move them, copy
`bots\<userId>\<botId>` to `/var/lib/nexus/bots/<userId>/<botId>` on the node.

Updating the node: `git pull && sudo bash installer/linux/install-node.sh` (keeps the token
and cert, so the panel's settings stay valid).

## SFTP access

Each bot can generate its own SFTP credentials (dashboard → bot → SFTP tab) for use with
WinSCP, FileZilla, or any SFTP client. Credentials are per-bot (not per-user) and chrooted:
connecting only exposes that bot's own folder, with no visibility into other bots or other
users' files. The SFTP server is embedded directly in the Node app (via `ssh2`, no OS-level
service to configure) and listens on port 2222. Passwords are shown once at generation time
and stored only as a bcrypt hash — regenerate from the dashboard if lost.

**Important — Cloudflare and SFTP don't mix.** If your domain is proxied through Cloudflare
(orange cloud), only HTTP/HTTPS traffic is forwarded — SFTP on port 2222 will hang/timeout
if a user tries to connect to the domain itself. The dashboard's SFTP tab shows the correct
host to use (from `SFTP_HOST` in `.env`, which the installer auto-detects as the VPS's public
IP), not the site's domain. Don't change the SFTP tab to show the domain unless that domain
is DNS-only (grey cloud) or you're on Cloudflare Spectrum.

The firewall rule for port 2222 (`Nexus Bot Hosting SFTP`) is only created by a full
`install.bat` run. If you deploy updates by hand (`git pull` + rebuild, skipping the
installer), that rule won't exist on a fresh VPS — add it manually if needed:
```
netsh advfirewall firewall add rule name="Nexus Bot Hosting SFTP" dir=in action=allow protocol=TCP localport=2222
```

## Per-bot dashboard tabs

Each bot's detail page has six tabs:

- **editor** — Monaco file tree/editor, drag-and-drop upload, zip extract
- **console** — live streaming logs over WebSocket (`/ws/console`), not polling; auto-scrolls,
  shows connection state, reconnects per-visit
- **metrics** — live CPU %, memory, and uptime while the bot is running, sparkline charts
  polled every 2s (soft usage estimates from `processService.js` — see "Bot isolation
  model" above)
- **startup** — custom start command (overrides the default `python <entry>` / `node <entry>`),
  an optional pre-start hook (e.g. `pip install -r requirements.txt`, runs once before the
  main process and aborts the start on failure), restart policy (never / on-crash / always —
  `always`/`on-crash` are applied by `containerEvents.js` reacting to the process's own exit
  event, since there's no container runtime to delegate the policy to), and an
  auto-start-on-server-boot toggle
- **settings** — rename, per-bot CPU/memory limit overrides (capped by `BOT_MAX_CPU_LIMIT` /
  `BOT_MAX_MEMORY_LIMIT_MB`, enforced as a soft poll-and-kill limit), and environment
  variables injected into the process at start
- **sftp** — generate/rotate this bot's SFTP credentials

Restart counts are tracked automatically via `processService.js`'s exit events
(`server/src/services/containerEvents.js`), which also keeps bot status in sync when a
process dies outside of a direct API call (a crash, or being killed for exceeding its
resource limit).

## Account settings

`/account` lets a signed-in user change their display name/username, request an email change
(sends a confirmation link to the new address before it takes effect), change their password,
and permanently delete their account (cascades to all owned bots and containers).

## Admin panel

`server/src/scripts/seedAdmin.js <email> <password> [username]` creates or promotes an
admin account directly against the database (bypasses the public signup form, which has
no way to grant admin). Admins get an `/admin` link in the nav leading to a platform-wide
panel: view all users with bot counts, disable/enable accounts, override a user's bot
limit, delete users (cascades to their bots and containers), and force-stop or delete any
bot across the platform.

## Security notes

- Each bot runs as its own OS process with soft CPU/memory limits — **not** the container-
  level filesystem/process isolation this platform originally had. See "Bot isolation
  model" above for the full trade-off.
- File manager and SFTP operations are guarded against path traversal
  (`server/src/services/pathSafety.js`) and zip-slip during extraction. This protects the
  app's own file-manager/SFTP endpoints; it does not sandbox what a bot's own running code
  can read or write on disk.
- Certain executable extensions (`.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.msi`, `.sys`, `.scr`)
  are blocked from upload/creation, since bots only need interpretable source + data files.
- Passwords (account and SFTP) are hashed with bcrypt; JWTs are used for session auth.
- Disabled accounts are rejected at login and on every subsequent authenticated request
  (and their running bots are force-stopped the moment an admin disables the account).
- Every process-lifecycle call on a delete/stop path is caught individually so a spawn/kill
  hiccup degrades that one request instead of crashing the whole process for every user;
  top-level `unhandledRejection`/`uncaughtException` handlers are a last-resort backstop.

## New environment variables (this round)

```
SFTP_PORT=2222                # already documented above
BOT_MAX_CPU_LIMIT=2           # ceiling a user can set via the settings tab
BOT_MAX_MEMORY_LIMIT_MB=1024  # ceiling a user can set via the settings tab
```
