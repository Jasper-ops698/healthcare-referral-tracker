# End-to-End Data Flow

This document explains how data moves through the Healthcare Referral Tracker from login to synchronized domain operations.

## 1) Authentication Flow

### Entry point

- Frontend starts in `src/App.tsx`
- `AuthProvider` wraps app state (`src/hooks/useAuth.tsx`)
- `SyncProvider` depends on authenticated session (`src/hooks/useSync.tsx`)

### Login sequence

1. User submits credentials on login screen.
2. `useAuth.login()` tries backend auth at `POST /api/v1/auth/login`.
3. Backend returns one of:
   - success with JWT + user
   - `twoFactorRequired`
   - `forcePasswordChange`
4. On success, client stores:
   - `healthtrack_jwt_token`
   - `healthtrack_current_user`
5. Optional settings from backend are merged into `healthtrack_settings`.

### Offline fallback sequence

If backend is unreachable, `useAuth` falls back to local IndexedDB user resolution and creates a local token (`local_*`). This keeps the app usable until backend re-login is possible.

## 2) Request/Response Flow (Frontend API client)

Core client: `src/lib/apiClient.ts`

- Builds API URL from `API_BASE_URL` (`src/lib/config.ts`)
- Adds JWT from localStorage as `Authorization: Bearer <token>`
- Adds `X-Region` header from current user where available
- Retries transient failures (5xx/network) with exponential backoff
- On `401`, clears token/user and redirects to login

## 3) Backend Route and Middleware Flow

Server entry: `src/server/index.ts`

1. Express app initializes JSON body parsing and CORS middleware.
2. Routes mount under `/api/v1/*` and `/sync/*`.
3. Protected routes use middleware from `src/server/middleware/regionalAuth.ts`:
   - `authenticateJWT` validates token and injects `req.user`
   - `requireRole` enforces role-level authorization
   - `requireRegion` enforces cross-region isolation
   - `protectPrimaryAdmin` blocks destructive primary-admin mutations

## 4) Domain Write Flow (example: create patient)

### Online path

1. UI action triggers API call (`createPatient` in `apiClient.ts`).
2. Request hits `POST /api/v1/patients`.
3. Backend controller validates input and persists via Mongoose model.
4. Response returns success payload to frontend.

### Offline-capable path

1. Client writes to local IndexedDB through local DB abstractions.
2. Change is queued into outbox for sync processing.
3. UI updates immediately from local state/hook refresh.

## 5) Synchronization Flow

Core engine: `src/lib/syncEngine.ts`

### Startup

1. `SyncProvider` initializes sync manager after authentication.
2. Sync manager receives current token.
3. Stale outbox entries in `syncing` state are recovered.
4. Auto-sync loop starts (default 30s) plus immediate sync attempt.

### Pull cycle (`/api/v1/sync/pull`)

1. Read local checkpoint (`lastSyncVersion`) from IndexedDB.
2. Send pull request with client version, region, deviceId, batch limit.
3. Apply remote changes locally by entity type.
4. Update checkpoint and continue while `hasMore` is true.

### Push cycle (`/api/v1/sync/push` and direct APIs)

1. Read pending/retryable outbox entries.
2. Attempt direct API writes for create operations first (users/chps/patients/medical records).
3. Mark remaining entries as `syncing`.
4. Send batched `ChangeRecord` payload to sync endpoint.
5. Update outbox statuses by server result:
   - accepted -> `sent`
   - rejected -> `error` (retry)
   - conflict -> `conflict` (manual/merge path)
6. Save updated sync checkpoint.

### Connectivity behavior

- Local token (`local_*`) forces offline sync status
- Network errors trigger retries and eventual offline state
- Returning online triggers immediate sync attempt

## 6) Email Delivery Flow

Service: `src/server/services/emailService.ts`

1. Controller requests email send.
2. Service attempts immediate SMTP delivery.
3. If send fails, email job is persisted in MongoDB queue.
4. Background cron in `server/index.ts` retries pending/failed jobs on interval.
5. Job state transitions: `pending` -> `sent` or `failed` -> `cancelled` (max retries).

## 7) Analytics/Data Consumption Flow

1. Dashboard hooks and sections call analytics/system endpoints.
2. Backend computes aggregate metrics from MongoDB models.
3. Frontend renders KPI cards/charts with role-sensitive visibility.

## 8) Session Lifecycle

1. Session starts with login and token persistence.
2. `useIdleTimer` can auto-logout based on user settings.
3. `logout()` clears local auth state and sync lifecycle stops.
4. Subsequent login re-initializes sync and state subscriptions.

## 9) i18n Flow

1. `useI18n` resolves selected language from persisted settings.
2. Translation keys are read from `src/i18n/translations.ts`.
3. UI components call `t('key.path')` for localized copy.

## 10) Failure and Recovery Paths

- Backend cold/unreachable: fallback local auth + offline mode
- Sync request failure: exponential backoff, outbox retry scheduling
- Conflicts: outbox marked conflict for explicit resolution flow
- Token expiry: `401` causes immediate local session reset

## 11) Suggested Instrumentation Additions

- Correlation IDs per request propagated from frontend to backend
- Structured audit logs for auth failures and sync conflict rates
- Metrics on queue depth (outbox, email jobs) for proactive alerting
