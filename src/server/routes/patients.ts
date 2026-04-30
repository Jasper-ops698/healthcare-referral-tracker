import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/regionalAuth.js';
import {
  handleListPatients,
  handleGetPatient,
  handleCreatePatient,
  handleUpdatePatient,
  handleDeletePatient,
} from '../controllers/patientController.js';

const router = Router();

router.use(authenticateJWT);

router.get('/', authorizeRoles('admin', 'collector'), handleListPatients);
router.post('/', authorizeRoles('admin', 'collector'), handleCreatePatient);
router.get('/:id', authorizeRoles('admin', 'collector'), handleGetPatient);
router.put('/:id', authorizeRoles('admin', 'collector'), handleUpdatePatient);
router.delete('/:id', authorizeRoles('admin', 'collector'), handleDeletePatient);

export default router;
