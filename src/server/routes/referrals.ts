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
import { authenticate } from '../middleware/regionalAuth.js';

const router = Router();

router.post('/', authenticate, handleCreateReferral);
router.get('/incoming/:facilityId', authenticate, handleListIncoming);
router.get('/outgoing/:facilityId', authenticate, handleListOutgoing);
router.get('/patient/:patientId', authenticate, handleListByPatient);
router.get('/:id', authenticate, handleGetReferral);
router.post('/:id/accept', authenticate, handleAcceptReferral);
router.post('/:id/complete', authenticate, handleCompleteReferral);
router.post('/:id/reject', authenticate, handleRejectReferral);

export default router;
