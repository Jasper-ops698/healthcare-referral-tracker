/**
 * System Routes — Config, exports, health
 *
 * All routes require admin authentication.
 */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/regionalAuth.js';
import { handleGetConfig, handleUpdateConfig } from '../controllers/systemConfigController.js';
import { handleExportPatients, handleExportAuditLogs } from '../controllers/exportController.js';

const router = Router();

// ─── Config ───
router.get('/config', authenticateJWT, handleGetConfig);
router.put('/config', authenticateJWT, handleUpdateConfig);

// ─── Exports ───
router.get('/export/patients', authenticateJWT, handleExportPatients);
router.get('/export/audit-logs', authenticateJWT, handleExportAuditLogs);

export default router;
