/**
 * CounterReferral Routes
 */
import { Router } from 'express';
import {
  handleCreate,
  handleListByStation,
  handleListByPatient,
  handleGet,
  handleUpdate,
  handleChpFormSubmit,
  handleChpFormData,
  handleStats,
} from '../controllers/counterReferralController.js';
import { authenticate } from '../middleware/regionalAuth.js';

const router = Router();

// Authenticated routes
router.post('/', authenticate, handleCreate);
router.get('/station/:stationId', authenticate, handleListByStation);
router.get('/patient/:patientId', authenticate, handleListByPatient);
router.get('/stats/all', authenticate, handleStats);
router.get('/:id', authenticate, handleGet);
router.put('/:id', authenticate, handleUpdate);

// Public CHP form routes (token-based, no auth)
router.get('/chp-form/:token', handleChpFormData);
router.post('/chp-form/:token', handleChpFormSubmit);

export default router;
