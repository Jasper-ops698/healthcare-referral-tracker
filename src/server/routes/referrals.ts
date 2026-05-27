/**
 * Referral Routes
 */

import { Router } from 'express';
import {
  handleCreateReferral,
  handleListIncoming,
  handleListOutgoing,
  handleListByPatient,
  handleGetReferral,
  handleAcceptReferral,
  handleCompleteReferral,
  handleRejectReferral,
} from '../controllers/referralController.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';

const router = Router();

router.post('/', authenticateJWT, handleCreateReferral);
router.get('/incoming/:facilityId', authenticateJWT, handleListIncoming);
router.get('/outgoing/:facilityId', authenticateJWT, handleListOutgoing);
router.get('/patient/:patientId', authenticateJWT, handleListByPatient);
router.get('/:id', authenticateJWT, handleGetReferral);
router.post('/:id/accept', authenticateJWT, handleAcceptReferral);
router.post('/:id/complete', authenticateJWT, handleCompleteReferral);
router.post('/:id/reject', authenticateJWT, handleRejectReferral);

export default router;
