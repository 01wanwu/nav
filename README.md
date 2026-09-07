# Conan Nav

A clean and modern link navigation system built with Next.js 15, Prisma, and shadcn/ui.

[![GitHub stars](https://img.shields.io/github/stars/kenanlabs/nav?style=social)](https://github.com/kenanlabs/nav/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/kenanlabs/nav?style=social)](https://github.com/kenanlabs/nav/network/members)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Languages**: [简体中文](./README.zh-CN.md)

## ✨ Features

### Frontend
- 📂 **Category Navigation** - shadcn/ui Tabs style, sites organized by category
- 🔍 Real-time Search - millisecond response, no page reload
- 📱 Responsive Design - perfectly adapted for mobile
- 🎨 Clean & Elegant - strictly follows shadcn/ui design guidelines
- 🖼️ Smart Icons - auto-fetches site favicons, falls back to the first letter on failure
- 🌓 Dark Mode - one-click toggle (Light / Dark / System)
- 📜 **Daily Poetry** - fetches a poem of the day with elegant vertical layout

### Admin Dashboard
- 📊 Statistics - visit frequency charts, site rankings
- 🌐 Site Management - CRUD, publish status, icon display, **health checks**
- 📁 Category Management - custom categories and sorting
- 🗂️ **Multi-Workspace** - bind domains per workspace and route subdomains to dedicated content, falling back to the default workspace
- 📦 **Data Management** - import/export bookmarks, supports JSON and Chrome bookmark formats
  - JSON format: complete data backup (description, ordering, publish status, and all fields)
  - Full backup: includes workspace structures and domain bindings for site migration
  - Chrome bookmarks: browser-compatible format (name, URL, and icon only)
- 👤 Admin System - single-admin design, edit profile from the sidebar avatar
- ⚙️ System Settings - site name, logo, favicon, GitHub link, ICP filing, etc.
- 📈 Visit Tracking - optional site visit statistics
- 🧩 **Plugin System** - builtin collection/browser-extension plugins plus user-uploaded declarative plugins; see the [Plugin Development Guide](docs/plugin-development.md)

### Technical Highlights
- **Single-admin architecture** - no complex user permission system needed
- **Dynamic configuration** - modify site settings in real time from the dashboard
- **Pagination** - all list pages support pagination
- **Type safety** - full TypeScript typings, zero `any`
- **Production optimization** - unified logging, silent in production
- **Data visualization** - visit frequency charts with Recharts
- **Performance** - database index optimization, client-side real-time search (< 10ms response)
- **Smart icons** - user config > smart favicon > first-letter icon (graceful degradation)
- **ICP filing support** - optional ICP filing number and link in the frontend footer
- **Subdomain workspace routing** - exact domain matching with isolated content and per-workspace branding overrides
- **shadcn/ui best practices** - complete composition patterns (Card + CardHeader + CardTitle + CardAction)

## 📸 Screenshots

<table>
  <tr>
    <td><img src="screenshots/01-home.png" alt="Home" /></td>
    <td><img src="screenshots/02-search.png" alt="Search" /></td>
  </tr>
  <tr>
    <td><img src="screenshots/03-dashboard.png" alt="Dashboard" /></td>
    <td><img src="screenshots/04-data.png" alt="Edit admin info" /></td>
  </tr>
  <tr>
    <td><img src="screenshots/05-sites.png" alt="Site management" /></td>
    <td><img src="screenshots/06-category.png" alt="Category management" /></td>
  </tr>
  <tr>
    <td><img src="screenshots/07-system.png" alt="System settings" /></td>
    <td><img src="screenshots/08-login.png" alt="Login page" /></td>
  </tr>
</table>

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **UI**: shadcn/ui, Tailwind CSS, Lucide Icons
- **Charts**: Recharts
- **Backend**: Next.js Server Actions, Prisma ORM
- **Database**: SQLite (default, zero-config) / PostgreSQL (optional)
- **Auth**: Simple cookie-based auth (single admin)
- **Deployment**: Docker, GitHub Actions CI/CD

## 🚀 Quick Start

### Local Development

```bash
# 1. Install dependencies (also generates the dual sqlite/postgres Prisma clients)
npm install

# 2. Configure environment variables (optional: SQLite works with zero config)
cp .env.example .env
# Edit .env only if you want PostgreSQL instead of the default SQLite

# 3. Initialize the SQLite database (auto-seeds basic data)
npm run db:push  # creates ./data/nav.db with 4 categories + 4 sample sites

# For more sample data:
npm run db:seed:full  # 10 categories + 50+ curated sites

# 4. Start the dev server
npm run dev
```

🌐 **Access**:
- Frontend: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

**Default admin account**:
- Email: `admin@example.com`
- Password: `admin123`

💡 Customize the initial admin account via the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables in `.env` (applies to the first seed only).

⚠️ **Important**: the default password is public knowledge. For public deployments, set the credentials via environment variables or change the password immediately after the first login!

## 🗂️ Multi-Workspace & Subdomain Routing

A workspace is an independent content space: each workspace has its own categories, sites, and display config (title, description, logo, favicon), and can be bound to one or more domains. Visiting different subdomains renders the matching workspace; unmatched domains fall back to the default workspace.

```
Browser visits zh.example.com ──┐
Browser visits en.example.com ──┼──> Exact domain matching ──> Render the bound workspace
Browser visits nav.example.com ─┘   (unmatched/unpublished) ──> Render the default workspace
```

### Usage

1. Open **Workspaces** in the admin dashboard and create workspaces (e.g. Chinese site `zh`, English site `en`)
2. Bind a domain to each workspace (e.g. `zh.example.com`) and point its DNS to your server
3. Switch the workspace context in the top bar to manage categories and sites per workspace
4. Edit display fields per workspace in **System Settings → Basic Info** (empty values fall back to global)
5. Turn on the **publish switch** to go live; unpublished workspaces fall back to the default workspace even with bound domains

### Scope Reference

| Content | Scope |
|---------|-------|
| Categories, sites | Isolated per workspace |
| Title, description, logo, favicon | Per-workspace override, empty falls back to global |
| Category slug uniqueness | Unique within a workspace, reusable across workspaces |
| sitemap / robots | Output per visiting domain's workspace |
| Feature switches, footer, ICP filing, etc. | Globally shared |
| Visit statistics (dashboard) | Site-wide aggregate |

The workspace switcher in the admin top bar indicates the current page scope: switchable = content follows the workspace; disabled "Global" = site-wide, unaffected by the workspace switcher.

### Local Development

Without subdomains locally, dev mode supports query-parameter simulation:

```bash
# Preview the workspace with slug "zh"
# Visit http://localhost:3000/?__workspace=zh

# Or simulate a domain via the Host header
curl -H "Host: zh.example.com" http://localhost:3000/
```

Preview environments can enable the query parameter with `ENABLE_WORKSPACE_PREVIEW=true` (ignored in production, which matches by domain only).

### Data Persistence

Workspaces, categories, and sites are persisted in a database. **SQLite is the default storage**: with no PostgreSQL connection configured, the app stores everything in a local SQLite file (`SQLITE_PATH`, default `./data/nav.db` in dev and `/app/data/nav.db` in Docker) — tables and seed data are created automatically on first start, and the file persists across restarts.

Configure `POSTGRES_URL` (or a `postgres://` prefixed `DATABASE_URL`) to switch to PostgreSQL. On Serverless platforms (Vercel / Cloudflare Workers) there is no persistent local filesystem, so an external PostgreSQL (e.g. Neon / Supabase / RDS) is required — local SQLite files are not an option there.

## 📦 Production Deployment

### Option 1: Docker (Recommended)

This project ships a complete Docker deployment setup with an optimized multi-stage build and a docker-compose configuration.

#### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/kenanlabs/nav.git
cd nav

# 2. Configure environment variables
cp .env.example .env
# Edit .env to set SESSION_SECRET (or NEXTAUTH_SECRET)
# Database: zero config — SQLite is used by default (data persisted in the nav-data volume)

# 3. Start the service (uses the image built by GitHub Actions)
docker compose up -d

# 4. View logs
docker compose logs -f nav
```

🌐 **Access** (depends on the `PORT` env var, default 3000):
- Local: `http://localhost:3000`
- Remote: `http://your-server-ip:3000` or `http://your-domain.com`
- Admin: `http://localhost:3000/admin` or `http://your-domain.com/admin`

#### Optional: PostgreSQL mode

```bash
# 1. Enable the postgres profile in .env
#    DB_PROVIDER=postgres
#    POSTGRES_PASSWORD=your-database-password-here

# 2. Start with the profile (starts PostgreSQL alongside the app)
docker compose --profile postgres up -d
```

#### Environment Variables (Docker)

```bash
# Core config (required)
SESSION_SECRET=your-session-secret-here # session signing key, falls back to NEXTAUTH_SECRET
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=http://localhost:3000 # use your real domain in production

# Database (all optional — SQLite by default)
DB_PROVIDER=sqlite # sqlite | postgres; unset = auto-detect from connection strings
POSTGRES_URL=postgresql://nav:password@postgresql:5432/nav # only needed for PostgreSQL
SQLITE_PATH=/app/data/nav.db # SQLite file location (mounted volume)

# Docker config
PORT=3000
# PostgreSQL profile only (docker compose --profile postgres):
POSTGRES_USER=nav
POSTGRES_PASSWORD=your-database-password-here # required when the postgres profile is enabled
POSTGRES_DB=nav
POSTGRES_PORT=5432

# Initial admin account (optional, first seed only)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-admin-password-here
```

#### Common Commands

```bash
# Pull the latest image and restart
docker compose pull && docker compose up -d

# Check service status
docker compose ps

# View logs
docker compose logs -f nav

# Stop the service
docker compose down

# Stop and remove data volumes (⚠️ deletes database data)
docker compose down -v
```

#### GitHub Actions CI/CD

Docker images are built automatically by GitHub Actions and pushed to the GitHub Container Registry:

- **Image**: `ghcr.io/kenanlabs/nav:latest`
- **Trigger**: Git tag push (format: `v*.*.*`)
- **Result**: pushes both `version` and `latest` tags

**Publishing a new release**:

```bash
# Create and push a git tag (triggers GitHub Actions)
git tag v1.0.0
git push origin v1.0.0
```

### Option 2: PM2 + Nginx

```bash
# 1. Clone the repo
git clone https://github.com/kenanlabs/nav.git
cd nav

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env to set NEXTAUTH_SECRET (SQLite needs no database config)

# 4. Initialize the SQLite database
npm run db:push

# 5. Build and start
npm run build
npm start

# Or manage with PM2
npm install -g pm2
pm2 start npm --name "nav" -- start
pm2 startup  # enable auto-start on boot
pm2 save
```

## ⚙️ Environment Variables

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `DB_PROVIDER` | Explicit database type: `sqlite` or `postgres`; unset = auto-detect from connection strings | `sqlite` | ❌ |
| `POSTGRES_URL` | PostgreSQL connection string (highest priority for auto-detection) | `postgresql://user:pass@localhost:5432/nav` | ❌ (PostgreSQL mode only) |
| `DATABASE_URL` | Legacy compat: a `postgres://` prefixed value is treated as `POSTGRES_URL` | `postgresql://user:pass@host:5432/nav` | ❌ |
| `SQLITE_PATH` | SQLite database file path (directory and file are created automatically) | `./data/nav.db` | ❌ (default) |
| `SESSION_SECRET` | Session signing key (HMAC), falls back to `NEXTAUTH_SECRET` | random string (`openssl rand -base64 32`) | ✅ in production (server refuses to start without it; dev/build fall back to a per-build random key) |
| `NEXTAUTH_SECRET` | Encryption key (also used as session signing fallback) | random string (`openssl rand -base64 32`) | ❌ (one of the two; Docker generates a fallback) |
| `NEXTAUTH_URL` | Full app URL | `http://localhost:3000` or `https://your-domain.com` | ❌ (Docker default) |
| `POSTGRES_PASSWORD` | PostgreSQL password for the `postgres` compose profile | random long string | ✅ (postgres profile only) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Initial admin account (first seed only) | email / strong password | ❌ |

**Docker**: configure `SESSION_SECRET` (or `NEXTAUTH_SECRET`); SQLite is used by default with no database config. Add `DB_PROVIDER=postgres` + `POSTGRES_PASSWORD` to switch to the PostgreSQL profile.

**Local dev**: SQLite works out of the box; set `POSTGRES_URL` only if you prefer a local PostgreSQL instance.

## 📁 Project Structure

```
.
├── app/                  # Next.js App Router
│   ├── (public)/         # Frontend pages
│   ├── admin/            # Admin dashboard
│   └── api/              # API routes
├── components/           # React components
│   ├── ui/              # shadcn/ui components
│   ├── layout/          # Layout components
│   │   ├── jinrishici-card.tsx         # Daily poetry card
│   │   └── jinrishici-card-wrapper.tsx # Poetry card wrapper (animations)
│   ├── admin/           # Admin components
│   ├── poetry-toggle.tsx         # Poetry toggle button
│   └── theme-provider/  # Theme provider
├── hooks/
│   └── use-poetry-toggle.ts  # Poetry visibility state hook
├── lib/                 # Utilities and Server Actions
├── prisma/              # Database models and seed data
├── public/              # Static assets
└── screenshots/         # Project screenshots
```

## 🔄 Upgrade Guide

Versioned automatic database migrations are supported since **v0.0.8**.

### Upgrading from v0.0.8 (and later)

**Docker** (automatic):
```bash
docker compose pull && docker compose up -d
# entrypoint.sh syncs the SQLite schema (or runs PostgreSQL migrations) automatically
# ✅ no manual steps needed
```

**npm**:
```bash
git pull && npm install && npm start
# SQLite (default): schema is synced on startup-equivalent via `npm run db:push` if needed
# PostgreSQL: run `npm run db:migrate:deploy` before starting
```

---

## 🔧 FAQ

### What's the difference between `npm install` and `npm run db:push`?

- **`npm install`**: installs dependencies and generates both Prisma clients (sqlite + postgres) via the postinstall hook; re-run after schema changes
- **`npm run db:push`**: creates/syncs the SQLite schema + seeds initial data; needed on first install or when the schema changes

### Why does the database connection fail?

**SQLite (default)**:
1. Is the data directory (`./data`) writable?
2. Is `SQLITE_PATH` pointing to a valid location?
3. Running `node .next/standalone/server.js` directly? Use an absolute `SQLITE_PATH` — the standalone server changes its working directory at startup, so relative paths resolve against `.next/standalone/`

**PostgreSQL**:
1. Is PostgreSQL running?
2. Is `POSTGRES_URL` (or `DATABASE_URL`) in `.env` correct?
3. Are the database username and password correct?
4. Does the `nav` database exist?

### How do I reset the admin password?

**Method 1** (recommended): log into the dashboard → click the sidebar avatar → edit profile → change password

**Method 2**: delete the admin from the database, then re-initialize
```bash
# 1. Connect and delete the admin (PostgreSQL)
psql -h localhost -U nav -d nav -c "DELETE FROM \"User\" WHERE email = 'admin@example.com';"

# 1. Or remove it from the SQLite file (default mode)
sqlite3 ./data/nav.db "DELETE FROM \"User\" WHERE email = 'admin@example.com';"

# 2. Re-initialize the database
npm run db:push
```

### Why doesn't the frontend update after I modify the database directly?

#### Data update flow

1. **Via the admin dashboard** (recommended)
   - Add/modify sites or categories in the dashboard
   - The frontend updates immediately (pages render dynamically and every write triggers cache revalidation)
   - ✅ **no service restart or rebuild needed**

2. **Direct database access**
   - Modify the database directly with SQL, Prisma Studio, etc.
   - The frontend has **no way to know** about such changes — pages are rendered from the database on each request, so reads take effect immediately, but aggregated fields (e.g. category counts) cached in the app may be stale until the next write via the app
   - ⚠️ **avoid direct database access** unless you know what you are changing

#### Best practices

- ✅ **Prefer the admin dashboard** for all data operations
- ✅ Avoid direct database access (except bulk import via the built-in data tools)

### Why is there no user management in the system settings page?

Conan Nav uses a **single-admin architecture**. Admin profile editing is integrated into the sidebar avatar component, which is simpler and more intuitive.

### How do I back up the database?

**⚠️ Important**: back up the database before performing any database operations!

#### Docker (SQLite, default)

```bash
# 1. Stop the service
docker compose down

# 2. Back up the SQLite data volume (includes all data)
docker run --rm -v nav_nav-data:/data -v $(pwd):/backup alpine tar czf /backup/nav-data-$(date +%Y%m%d_%H%M%S).tar.gz /data

# 3. Restart the service
docker compose up -d
```

#### Docker (PostgreSQL profile)

```bash
docker compose exec postgresql pg_dump -U nav nav > backup_$(date +%Y%m%d_%H%M%S).sql
```

#### npm (SQLite, default)

```bash
# The database is a single file — a plain copy is a complete backup
cp ./data/nav.db ./backup_$(date +%Y%m%d_%H%M%S).db
```

#### How to restore a backup?

```bash
# Docker (SQLite): restore the data volume
docker run --rm -v nav_nav-data:/data -v $(pwd):/backup alpine sh -c "cd / && tar xzf /backup/nav-data-20260121_143000.tar.gz"

# Docker (PostgreSQL profile)
docker compose exec postgresql psql -U nav nav < backup_20260121_143000.sql

# npm (SQLite): copy the file back
cp ./backup_20260121_143000.db ./data/nav.db
```

#### Backup strategy suggestions

1. **Scheduled automatic backups**: use a cron job for daily backups
2. **Offsite backups**: upload backups to cloud storage (S3/OSS)
3. **Backup verification**: periodically test that backups can be restored
4. **Backup retention**: keep at least 30 days of backups

#### Exporting data (without visit stats)

If you only need site and category data (no visit statistics), use the "Data Management" feature in the dashboard:

- Export as JSON: includes all sites, categories, and system settings
- Does NOT include: visit records, admin account

This is useful for data migration and partial recovery.

## 💡 Related Resources

- 📘 [Full documentation](https://deepwiki.com/kenanlabs/nav)
- 📬 [Issues](../../issues)
- 💬 [Discussions](../../discussions)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=kenanlabs/nav&type=date&legend=top-left)](https://www.star-history.com/#kenanlabs/nav&type=date&legend=top-left)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/)
- [Tailwind CSS](https://tailwindcss.com/)
