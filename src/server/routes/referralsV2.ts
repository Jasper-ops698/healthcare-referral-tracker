/**
 * ReferralV2 Routes — Core referral operations
 */
import { Router } from 'express';
import {
  handleCreate,
  handleListIncoming,
  handleListOutgoing,
  handleListByCollector,
  handleListByPatient,
  handleGet,
  handleAccept,
  handleUpdateStatus,
  handleStatsByStation,
  handleListAll,
} from '../controllers/referralV2Controller.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';

const router = Router();

router.post('/', authenticateJWT, handleCreate);
router.get('/all', authenticateJWT, handleListAll);
router.get('/incoming/:stationId', authenticateJWT, handleListIncoming);
router.get('/outgoing/:stationId', authenticateJWT, handleListOutgoing);
router.get('/collector/:collectorId', authenticateJWT, handleListByCollector);
router.get('/patient/:patientId', authenticateJWT, handleListByPatient);
router.get('/stats/:stationId', authenticateJWT, handleStatsByStation);
router.get('/ai-report', authenticateJWT, handleListAll); // Admin AI report data endpoint
router.get('/:id', authenticateJWT, handleGet);
router.post('/:id/accept', authenticateJWT, handleAccept);
router.put('/:id/status', authenticateJWT, handleUpdateStatus);

export default router;
