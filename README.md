# Healthcare Referral Tracker

Healthcare Referral Tracker is an offline-capable referral workflow platform for facility teams and field collectors. The app supports patient registration, referral lifecycle tracking, role-based dashboards, analytics, and synchronized data flow between local IndexedDB storage and a MongoDB-backed API.

## Core Features

- Role-based access (`admin`, `collector`) with scoped operations
- Login with JWT, optional 2FA, and forced first-time password change
- Offline-first local storage with background sync and retry queue
- Referral and patient management with facility and medical record modules
- Email notifications with persistent retry queue
- Analytics endpoints and dashboard-level KPI reporting
- Internationalization support in the frontend

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind, Radix UI
- Backend: Express, TypeScript, Mongoose, JWT
- Local storage/sync: Dexie (IndexedDB) + custom sync engine
- Messaging: Nodemailer + MongoDB email job queue

## Repository Structure

```text
src/
  components/         UI components and feature screens
  hooks/              Auth, data, sync, notifications hooks
  i18n/               Translation dictionaries and i18n hook
  lib/                API client, config, sync engine, local DB bindings
  sections/           Dashboard-level page sections
  server/             Express app (routes, controllers, models, middleware)
```

## Prerequisites

- Node.js 20+
- npm 10+
- MongoDB instance (local or Atlas)

## Environment Variables

Create a `.env` file in the project root for server runtime:

```bash
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
JWT_SECRET=<strong-random-secret>

# Optional
CORS_ORIGIN=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-app-password>
SMTP_FROM=Healthcare Referral Tracker <no-reply@example.com>

# Optional: Redis-backed auth rate limiting (Upstash Redis REST)
REDIS_REST_URL=https://<your-upstash-endpoint>.upstash.io
REDIS_REST_TOKEN=<upstash-rest-token>
```

For frontend API targeting, optionally set:

```bash
VITE_API_URL=http://localhost:3001
```

## Local Development

Install dependencies:

```bash
npm install
```

Run frontend (Vite):

```bash
npm run dev
```

Run backend API (watch mode):

```bash
npm run server:dev
```

Build:

```bash
npm run build
npm run server:build
```

Start server directly:

```bash
npm run start
```

## API Surface (high-level)

Versioned routes are mounted under `/api/v1`:

- `/auth` authentication, profile, password, 2FA
- `/users` user administration
- `/chps` collector/CHP administration
- `/patients` patient CRUD and referral workflows
- `/medical-records` medical records
- `/facilities` facility metadata
- `/notifications` push subscription/notification operations
- `/system` system configuration and exports
- `/analytics` dashboard metrics
- `/sync` bidirectional sync endpoints

Health endpoint:

- `GET /health`

## Security and Architecture Docs

- Security review and remediation plan: `docs/SECURITY_REVIEW.md`
- End-to-end data flow walkthrough: `docs/DATA_FLOW.md`

## Known Operational Notes

- Offline mode uses a local token (`local_*`) to keep the UI usable until online re-authentication.
- Sync runs in the background and retries failed network operations automatically.
- Email sending falls back to a MongoDB-backed queue when SMTP delivery fails.

## Next Improvements (recommended)

- Move all hardcoded fallback secrets/config values to required env vars
- Add automated tests for auth, sync conflict handling, and role-based route protection
- Add CI gates for lint + typecheck + core API smoke tests
