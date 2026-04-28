/**
 * Sync Routes — Secure /sync/* endpoints
 *
 * All routes are protected by:
 *   1. authenticateJWT — Validates Bearer token
 *   2. requireRegion — Ensures user's region matches request region
 *   3. protectPrimaryAdmin — Blocks destructive ops on bkitib@gmail.com
 *
 * Endpoints:
 *   POST /sync/push   — Push local changes to server (auth + region)
 *   POST /sync/pull   — Pull remote changes from server (auth + region)
 *   GET  /sync/status — Get sync statistics (auth only)
 */

import { Router } from 'express';
import { handlePush, handlePull, handleGetStatus } from '../controllers/syncController.js';
import { authenticateJWT, requireRegion, protectPrimaryAdmin } from '../middleware/regionalAuth.js';

const router = Router();

// Apply authentication to ALL sync routes
router.use(authenticateJWT);

// Protect primary admin from destructive modifications
router.use(protectPrimaryAdmin);

/**
 * POST /sync/push
 *
 * Requires: Bearer token + region matching user's assigned region
 * Body: { clientVersion, deviceId, region, changes[] }
 *
 * The requireRegion middleware enforces that req.body.region === req.user.region,
 * preventing cross-region data leakage.
 */
router.post('/push', requireRegion, handlePush);

/**
 * POST /sync/pull
 *
 * Requires: Bearer token + region matching user's assigned region
 * Body: { clientVersion, deviceId, region, entityTypes?, limit? }
 *
 * Staff in "Mtwapa" only receive deltas tagged with "Mtwapa".
 */
router.post('/pull', requireRegion, handlePull);

/**
 * GET /sync/status
 *
 * Requires: Bearer token (region check optional for status)
 * Returns sync statistics. Admin can view all regions.
 */
router.get('/status', handleGetStatus);

export default router;
