# Healthcare Referral Tracker — Security Checklist
# NCMTC Production Deployment

Date: 2026-04-22
Application: Healthcare Referral Tracker (Sync Server + Client)
Target Environment: NCMTC (National Centre for Medical Training & Consultancy)

---

## 1. Regional Security Middleware

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1 | `authenticateJWT` middleware validates Bearer token on all `/sync/*` routes | PASS | Implemented in `src/server/middleware/regionalAuth.ts` |
| 1.2 | JWT includes `userId`, `email`, `role`, `region` claims | PASS | Signed with `JWT_SECRET` (rotate in production) |
| 1.3 | `requireRegion` middleware blocks cross-region requests | PASS | Returns HTTP 403 with `CROSS_REGION_FORBIDDEN` code |
| 1.4 | Mtwapa CHP cannot sync Mombasa data (tested) | PENDING | Run integration test before deployment |
| 1.5 | Cross-region access attempts are logged to console + audit trail | PASS | Warn-level logs include user email, IP, timestamp |
| 1.6 | Primary admin (`bkitib@gmail.com`) can access all regions | PASS | `isPrimaryAdmin && region === 'global'` bypass |

### Regional Scoping Test Procedure
```bash
# 1. Login as Mtwapa CHP
curl -X POST https://oizwnscb3c4jm.kimi.show/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"chp_mtwapa@example.com","password":"..."}'

# 2. Attempt to pull Mombasa data (should fail with 403)
curl -X POST https://oizwnscb3c4jm.kimi.show/sync/pull \
  -H "Authorization: Bearer <mtwapa_token>" \
  -H "Content-Type: application/json" \
  -d '{"clientVersion":0,"deviceId":"test","region":"Mombasa"}'
# Expected: {"success":false,"error":{"code":"CROSS_REGION_FORBIDDEN"}}

# 3. Pull Mtwapa data (should succeed)
curl -X POST https://oizwnscb3c4jm.kimi.show/sync/pull \
  -H "Authorization: Bearer <mtwapa_token>" \
  -H "Content-Type: application/json" \
  -d '{"clientVersion":0,"deviceId":"test","region":"Mtwapa"}'
# Expected: {"success":true,"changes":[...]}
```

---

## 2. Client-Side Encryption (Web Crypto API)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.1 | AES-GCM 256-bit encryption implemented | PASS | `src/lib/crypto.ts` — `ALGORITHM = 'AES-GCM', KEY_LENGTH = 256` |
| 2.2 | PBKDF2-SHA256 key derivation (100,000 iterations) | PASS | `PBKDF2_ITERATIONS = 100_000` |
| 2.3 | Sensitive fields encrypted before IndexedDB storage | PASS | See `SENSITIVE_FIELD_PATHS` list |
| 2.4 | IV randomly generated per encryption (12 bytes) | PASS | `crypto.getRandomValues()` |
| 2.5 | Authentication tag extracted and stored separately | PASS | 16-byte tag appended to ciphertext |
| 2.6 | Plaintext fields remain queryable (recordId, patientId, status, dates) | PASS | Non-sensitive fields left unencrypted |
| 2.7 | Encryption key bound to device + user password | PASS | Salt stored in localStorage |
| 2.8 | Key rotation strategy documented | PASS | `keyVersion` field enables future rotation |

### Encrypted vs Plaintext Fields

| Field | Encrypted? | Why? |
|-------|-----------|------|
| chiefComplaint | YES | PHI — Protected Health Information |
| diagnosis[] | YES | PHI |
| vitalSigns | YES | PHI |
| medications[] | YES | PHI |
| clinicalNotes | YES | PHI |
| labResults[] | YES | PHI |
| recordId | NO | Needed for lookups, indexing |
| patientId | NO | Needed for joins |
| recordType | NO | Needed for filtering |
| status | NO | Needed for dashboard queries |
| encounterDate | NO | Needed for sorting |
| _sync | NO | Needed for sync engine operation |

### Encryption Test Procedure
```javascript
// In browser console
import { encryptField, decryptField, isEncryptedField } from './src/lib/crypto';

const encrypted = await encryptField('Patient has severe hypertension');
console.log(encrypted.__encrypted); // true
console.log(encrypted.iv.length > 0); // true

const decrypted = await decryptField(encrypted);
console.log(decrypted); // "Patient has severe hypertension"
```

---

## 3. Audit Trail Integration

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 3.1 | `AuditLog` Mongoose model created | PASS | `src/server/models/AuditLog.ts` |
| 3.2 | Every push operation logs to AuditLog | PASS | `logSyncAudit()` called per change in batch |
| 3.3 | Captured fields: IP, UserAgent, changeId, userId, userEmail | PASS | `req.ip` + `req.headers['user-agent']` |
| 3.4 | Audit entries include previousVersion and newVersion | PASS | Tracked for VBCC compliance |
| 3.5 | Failed operations (conflicts) are also logged | PASS | Result = 'failure' for 409 conflicts |
| 3.6 | Audit log is append-only (never updated/deleted) | PASS | No update/delete routes on AuditLog |
| 3.7 | TTL index auto-expires after 7 years | PASS | `expireAfterSeconds: 0` on `expiresAt` field |
| 3.8 | Compound indexes for entity history, user activity, regional queries | PASS | See `AuditLogSchema.index()` calls |

### Audit Query Examples
```javascript
// Get all audit entries for a specific patient
db.auditlogs.find({ entityType: 'medicalRecord', entityId: ObjectId('65a...') }).sort({ timestamp: -1 })

// Get all activity for a user (last 50)
db.auditlogs.find({ userId: ObjectId('...') }).sort({ timestamp: -1 }).limit(50)

// Get all cross-region access attempts
db.auditlogs.find({ action: 'auth_failure', errorMessage: /CROSS_REGION/ })
```

---

## 4. CORS & Origin Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.1 | CORS origin whitelist configured | PASS | `src/server/middleware/cors.ts` |
| 4.2 | Production origin added: `https://oizwnscb3c4jm.kimi.show` | PASS | First entry in `ALLOWED_ORIGINS` |
| 4.3 | Wildcard (`*`) removed from production | PASS | No `*` in `ALLOWED_ORIGINS` |
| 4.4 | localhost origins only in development | PASS | Conditionally allowed via `NODE_ENV` |
| 4.5 | Credentials enabled (cookies/auth headers) | PASS | `credentials: true` |
| 4.6 | Preflight caching enabled (24 hours) | PASS | `maxAge: 86400` |
| 4.7 | Unauthorized origins get 403 with CORS error | PASS | `callback(new Error(...))` rejects non-whitelisted origins |
| 4.8 | `X-Device-ID` and `X-Region` headers exposed | PASS | Listed in `allowedHeaders` |

### CORS Test Procedure
```bash
# 1. Allowed origin (should succeed)
curl -X OPTIONS https://oizwnscb3c4jm.kimi.show/sync/status \
  -H "Origin: https://oizwnscb3c4jm.kimi.show" \
  -H "Access-Control-Request-Method: POST" \
  -v
# Expected: HTTP 204 with Access-Control-Allow-Origin header

# 2. Blocked origin (should fail)
curl -X OPTIONS https://oizwnscb3c4jm.kimi.show/sync/status \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  -v
# Expected: CORS error, no Access-Control-Allow-Origin header
```

---

## 5. Primary Admin Protection

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 5.1 | `bkitib@gmail.com` hardcoded as primary admin | PASS | `PRIMARY_ADMIN_EMAIL` constant |
| 5.2 | `isPrimaryAdmin` is immutable via API | PASS | Stripped in `applyIfVersionMatches()` |
| 5.3 | `role` cannot be changed from 'admin' | PASS | Stripped in `applyIfVersionMatches()` |
| 5.4 | `status` cannot be changed from 'active' | PASS | Stripped in `applyIfVersionMatches()` |
| 5.5 | `region` cannot be changed from 'global' | PASS | Stripped in `applyIfVersionMatches()` |
| 5.6 | `pre('save')` hook enforces protection on direct DB writes | PASS | Auto-sets protected fields before save |
| 5.7 | `protectPrimaryAdmin` middleware blocks route-level mutations | PASS | Returns 403 with `PRIMARY_ADMIN_PROTECTED` |
| 5.8 | Attempts to modify primary admin are logged | PASS | Warn-level security logs |

---

## 6. Environment & Secrets

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 6.1 | `JWT_SECRET` is strong and unique | ACTION REQUIRED | Change from default in `.env` before deployment |
| 6.2 | `MONGODB_URI` uses Atlas with TLS | PASS | `mongodb+srv://` connection string |
| 6.3 | Database credentials not in source code | PASS | Stored in `.env` (add to `.gitignore`) |
| 6.4 | `NODE_ENV=production` set in production | ACTION REQUIRED | Must be set in production environment |
| 6.5 | `PORT` configured for production | PASS | Defaults to 3001 |
| 6.6 | Server error messages don't leak stack traces in production | PASS | `NODE_ENV === 'production'` check |

### Required .env Changes for NCMTC Deployment
```bash
# BEFORE deploying to NCMTC, update these values:

JWT_SECRET=change-this-to-a-64-char-random-string-minimum
NODE_ENV=production
# Remove localhost from CORS whitelist — only keep:
#   https://oizwnscb3c4jm.kimi.show
#   https://healthtrack.ncmtc.ac.ke  (when available)
```

---

## 7. Pre-Deployment Actions

| Priority | Action | Owner | Deadline |
|----------|--------|-------|----------|
| CRITICAL | Change `JWT_SECRET` to production-grade random string | DevOps | Before deploy |
| CRITICAL | Set `NODE_ENV=production` | DevOps | Before deploy |
| HIGH | Add NCMTC domain to `ALLOWED_ORIGINS` in `cors.ts` | DevOps | Before deploy |
| HIGH | Remove `http://localhost:*` from `ALLOWED_ORIGINS` in production | DevOps | Before deploy |
| HIGH | Enable MongoDB Atlas IP allowlist | DevOps | Before deploy |
| HIGH | Configure Atlas backups (daily snapshots) | DevOps | Before deploy |
| MEDIUM | Set up log aggregation (Datadog, CloudWatch, or similar) | DevOps | Week 1 |
| MEDIUM | Configure email alerts for failed sync attempts | DevOps | Week 1 |
| MEDIUM | Rotate encryption key every 90 days (key rotation policy) | Security | Ongoing |
| LOW | Enable Atlas Performance Advisor for query optimization | DBA | Week 2 |

---

## 8. Post-Deployment Monitoring

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| Sync push 409 conflicts | > 10/hour | Investigate VBCC issues, notify dev |
| Cross-region access attempts | > 1/hour | Security incident review |
| Audit log write failures | > 0 | Critical — compliance gap |
| MongoDB connection drops | > 2/day | Check Atlas status, review network |
| Sync batch size > 100 | Any | Client misconfiguration |
| Unusual region activity | Spike in new region | Verify staff assignment |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Engineer | | | |
| Database Architect | | | |
| DevOps Lead | | | |
| NCMTC Compliance Officer | | | |

---

*This checklist must be completed and signed before the Healthcare Referral Tracker is deployed to NCMTC production.*
