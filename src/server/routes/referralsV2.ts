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
import { authenticate } from '../middleware/regionalAuth.js';

const router = Router();

router.post('/', authenticate, handleCreate);
router.get('/all', authenticate, handleListAll);
router.get('/incoming/:stationId', authenticate, handleListIncoming);
router.get('/outgoing/:stationId', authenticate, handleListOutgoing);
router.get('/collector/:collectorId', authenticate, handleListByCollector);
router.get('/patient/:patientId', authenticate, handleListByPatient);
router.get('/stats/:stationId', authenticate, handleStatsByStation);
router.get('/:id', authenticate, handleGet);
router.post('/:id/accept', authenticate, handleAccept);
router.put('/:id/status', authenticate, handleUpdateStatus);

export default router;
