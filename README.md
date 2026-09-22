# Nexus Bot Hosting

Free public bot hosting for Python and Node.js bots. Users sign up, create up to 5 bots,
upload their code (drag-and-drop files/folders, .zip uploads with in-browser extraction,
or SFTP via WinSCP/FileZilla/etc.), edit files with a full Monaco (VS Code) editor, watch
a live streaming console, tune startup behavior and resource limits, and start/stop their
bot — each running in its own isolated Docker container with its own SQLite database.

## Structure

- `server/` — Express API (auth, bot lifecycle, file manager, Docker orchestration)
- `client/` — React (Vite) frontend, dark neon "Nexus" branding
- `bots/` — per-user bot folders created at runtime (gitignored)
- `installer/install.bat` — one-shot Windows VPS installer/service setup

## Local development

**Prerequisites:** Node.js 20+, Docker Desktop (for actually starting/stopping bots).

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

Without Docker running, everything except actually starting a bot container works
(signup, login, file manager, editor). `docker` calls will error if the daemon isn't running.

Without `RESEND_API_KEY` set, emails are skipped (logged to console) instead of failing.

## Production deploy (Windows VPS)

1. Copy this whole folder onto the Windows VPS.
2. Right-click `installer\install.bat` → **Run as administrator**.
3. Follow the prompts (domain defaults to `bot.chnexus.net`, port defaults to `4000`).
4. In Cloudflare DNS, point your domain at the VPS's public IP with an **A record**,
   proxy (orange cloud) **on**.
5. In Cloudflare, set **SSL/TLS → Overview → encryption mode** to **Flexible**.

The installer:
- Installs Node.js and Docker Desktop if missing
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
  polled every 2s from `docker stats`
- **startup** — custom start command (overrides the default `python <entry>` / `node <entry>`),
  an optional pre-start hook (e.g. `pip install -r requirements.txt`, runs once before the
  main process and aborts the start on failure), restart policy (never / on-crash / always,
  mapped to Docker's own `RestartPolicy`), and an auto-start-on-server-boot toggle
- **settings** — rename, per-bot CPU/memory limit overrides (capped by `BOT_MAX_CPU_LIMIT` /
  `BOT_MAX_MEMORY_LIMIT_MB`), and environment variables injected into the container at start
- **sftp** — generate/rotate this bot's SFTP credentials

Restart counts are tracked automatically via a Docker event-stream listener
(`server/src/services/containerEvents.js`), which also keeps bot status in sync when a
container dies or restarts outside of a direct API call (a crash, an OOM kill, Docker's own
restart policy firing).

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

- Each bot runs in its own Docker container (CPU/memory/PID limited, isolated filesystem
  bind-mounted only to that bot's own folder).
- File manager and SFTP operations are guarded against path traversal
  (`server/src/services/pathSafety.js`) and zip-slip during extraction.
- Certain executable extensions (`.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.msi`, `.sys`, `.scr`)
  are blocked from upload/creation, since bots only need interpretable source + data files.
- Passwords (account and SFTP) are hashed with bcrypt; JWTs are used for session auth.
- Disabled accounts are rejected at login and on every subsequent authenticated request
  (and their running bots are force-stopped the moment an admin disables the account).
- Every Docker call on a delete/stop path is caught individually so a container-runtime
  hiccup degrades that one request instead of crashing the whole process for every user;
  top-level `unhandledRejection`/`uncaughtException` handlers are a last-resort backstop.

## New environment variables (this round)

```
SFTP_PORT=2222                # already documented above
BOT_MAX_CPU_LIMIT=2           # ceiling a user can set via the settings tab
BOT_MAX_MEMORY_LIMIT_MB=1024  # ceiling a user can set via the settings tab
```
