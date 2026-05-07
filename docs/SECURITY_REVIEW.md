# Security Review - Healthcare Referral Tracker

This document captures a targeted security review of the current codebase, with findings prioritized for practical remediation.

## Scope

- Frontend authentication/session handling
- Backend authentication and route protection
- Sync pipeline (local queue to backend)
- Infrastructure configuration defaults in code
- CORS and cross-region access controls

## Risk Summary

- Critical: 2
- High: 2
- Medium: 4
- Low: 3

## Findings

### Critical 1 - Hardcoded MongoDB credentials fallback

`src/server/config/database.ts` contains a production-style default `MONGODB_URI` with embedded credentials as a fallback.

Risk:
- Secret exposure in source control and logs
- Unintended database access if environment variables are missing
- Difficult secret rotation and auditing

Remediation:
1. Remove credentialed fallback entirely.
2. Require `MONGODB_URI` at startup and fail fast if missing.
3. Rotate the exposed database credentials immediately.

### Critical 2 - Weak JWT fallback secret

`src/server/middleware/regionalAuth.ts` defines a hardcoded fallback JWT secret:

- `your-super-secret-jwt-key-change-in-production`

Risk:
- If `JWT_SECRET` is unset in production, token signing becomes predictable.
- Enables forged tokens and full auth bypass.

Remediation:
1. Remove fallback and enforce `JWT_SECRET` presence at boot.
2. Add startup validation for all required secrets.
3. Rotate any tokens signed with fallback secret after deployment update.

### High 1 - Primary admin identity hardcoded in frontend

`src/lib/config.ts` contains:
- `PRIMARY_ADMIN_EMAIL = 'bkitib@gmail.com'`

Risk:
- Sensitive operational identity embedded in client bundle
- Fragile environment coupling across deployments

Remediation:
1. Move primary-admin guardrails fully server-side.
2. Replace frontend hardcoded identity logic with role flags from backend claims.

### High 2 - Local auth fallback does not validate password offline

`src/hooks/useAuth.tsx` local fallback (`localAuthenticate`) currently resolves user by email and status but does not verify password.

Risk:
- Device compromise or shared terminal can lead to unauthorized local access.
- Security model differs significantly between online and offline auth.

Remediation:
1. Store password hash verifier for offline auth use-cases only (if truly needed).
2. Gate offline login behind explicit feature flag and device trust posture.
3. Display clear "offline limited session" indicator and policy controls.

### Medium 1 - Token storage in localStorage

JWT and user payload are stored in localStorage.

Risk:
- Vulnerable to token theft under XSS conditions

Remediation:
1. Prefer secure, httpOnly cookies for primary session where possible.
2. If localStorage remains required, enforce CSP, output encoding, and dependency auditing.

### Medium 2 - CORS wildcard by suffix

`src/server/middleware/cors.ts` allows any `*.onrender.com` origin.

Risk:
- Over-broad trust across preview-like domains

Remediation:
1. Restrict to explicit allowlist from environment.
2. Remove suffix wildcard in production.

### Medium 3 - Verbose startup logging of sensitive config metadata

Email service logs SMTP username and password length on startup.

Risk:
- Operational metadata disclosure in logs

Remediation:
1. Reduce logs to minimal non-sensitive health indicators.
2. Use structured logs with sensitivity guards.

### Medium 4 - No explicit rate-limiting on auth endpoints

Auth routes (`/api/v1/auth/login`, `/api/v1/auth/2fa/login-verify`) are exposed without visible rate limiting in reviewed files.

Risk:
- Credential stuffing and brute force pressure

Remediation:
1. Add per-IP and per-account rate limiting.
2. Add temporary lockout/backoff for repeated failures.
3. Log suspicious auth patterns.

### Low 1 - Long JWT expiry

JWT expiry is set to `7d` in middleware helper.

Risk:
- Longer exploit window for stolen tokens

Remediation:
1. Reduce access token lifetime.
2. Add refresh-token/session rotation strategy.

### Low 2 - Missing centralized security headers

No explicit helmet/security headers observed in reviewed boot path.

Remediation:
1. Add `helmet` with CSP tuned for your frontend.
2. Add explicit HSTS and frame protections.

### Low 3 - Security test coverage gaps

No security-focused test suite identified in sampled paths.

Remediation:
1. Add auth/authorization regression tests.
2. Add tests for cross-region guardrails and primary-admin protection logic.

## Remediation Plan

### Phase 1 (Immediate: 1-2 days)

- Remove hardcoded DB URI fallback and rotate credentials
- Remove JWT fallback secret and enforce startup secret validation
- Add auth endpoint rate limiting

### Phase 2 (Short term: 3-5 days)

- Tighten CORS to explicit origin list only
- Minimize sensitive operational logs
- Introduce security headers middleware

### Phase 3 (Near term: 1-2 weeks)

- Rework offline auth model for password verification or policy-gated access
- Add security-focused automated tests
- Evaluate migration path to cookie-based auth for web sessions

## Quick Validation Checklist

- [ ] Server fails startup when `MONGODB_URI` is missing
- [ ] Server fails startup when `JWT_SECRET` is missing
- [ ] Login endpoints are rate-limited and tested
- [ ] CORS accepts only explicit trusted origins
- [ ] No secrets or credential-like strings remain in repo history for active keys
- [ ] Cross-region and role-based access controls pass regression tests
