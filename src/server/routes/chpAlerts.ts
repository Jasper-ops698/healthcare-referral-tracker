/**
 * CHP Alert Routes — Collector-facing alert notifications
 *
 * GET  /api/v1/chp-alerts              List alerts for logged-in collector
 * GET  /api/v1/chp-alerts/stats        Alert counts for collector
 * GET  /api/v1/chp-alerts/:id/journey  Get single alert with full patient journey
 * PATCH /api/v1/chp-alerts/:id/ack     Acknowledge alert
 * PATCH /api/v1/chp-alerts/:id/resolve Resolve alert
 */

import { Router } from 'express';
import {
  handleListForCollector,
  handleGetWithJourney,
  handleAcknowledge,
  handleResolve,
  handleStats,
} from '../controllers/chpAlertController.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';

const router = Router();

// All CHP alert routes require authentication
router.use(authenticateJWT);

router.get('/', handleListForCollector);
router.get('/stats', handleStats);
router.get('/:id/journey', handleGetWithJourney);
router.patch('/:id/ack', handleAcknowledge);
router.patch('/:id/resolve', handleResolve);

export default router;
