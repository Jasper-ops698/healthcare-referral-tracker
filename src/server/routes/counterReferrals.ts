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
import { authenticateJWT } from '../middleware/regionalAuth.js';

const router = Router();

// Public CHP form routes (token-based, no auth) — MUST be before /:id to avoid capture
router.get('/chp-form/:token', handleChpFormData);
router.post('/chp-form/:token', handleChpFormSubmit);

// Authenticated routes
router.post('/', authenticateJWT, handleCreate);
router.get('/station/:stationId', authenticateJWT, handleListByStation);
router.get('/patient/:patientId', authenticateJWT, handleListByPatient);
router.get('/stats/all', authenticateJWT, handleStats);
router.get('/:id', authenticateJWT, handleGet);
router.put('/:id', authenticateJWT, handleUpdate);

export default router;
