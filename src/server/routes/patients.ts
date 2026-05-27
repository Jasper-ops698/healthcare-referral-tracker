import { Router } from 'express';
import { authenticateJWT, requireRole } from '../middleware/regionalAuth.js';
import {
  handleListPatients,
  handleGetPatient,
  handleCreatePatient,
  handleUpdatePatient,
  handleDeletePatient,
  handleSearchPatients,
} from '../controllers/patientController.js';

const router = Router();

router.use(authenticateJWT);

router.get('/', requireRole('admin', 'collector'), handleListPatients);
router.get('/search', requireRole('admin', 'collector'), handleSearchPatients);
router.post('/', requireRole('admin', 'collector'), handleCreatePatient);
router.get('/:id', requireRole('admin', 'collector'), handleGetPatient);
router.put('/:id', requireRole('admin', 'collector'), handleUpdatePatient);
router.delete('/:id', requireRole('admin', 'collector'), handleDeletePatient);

export default router;
