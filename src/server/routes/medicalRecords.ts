import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/regionalAuth.js';
import {
  handleListMedicalRecords,
  handleGetMedicalRecord,
  handleCreateMedicalRecord,
  handleUpdateMedicalRecord,
  handleDeleteMedicalRecord,
} from '../controllers/medicalRecordController.js';

const router = Router();

router.use(authenticateJWT);

router.get('/', authorizeRoles('admin', 'collector'), handleListMedicalRecords);
router.post('/', authorizeRoles('admin', 'collector'), handleCreateMedicalRecord);
router.get('/:id', authorizeRoles('admin', 'collector'), handleGetMedicalRecord);
router.put('/:id', authorizeRoles('admin', 'collector'), handleUpdateMedicalRecord);
router.delete('/:id', authorizeRoles('admin', 'collector'), handleDeleteMedicalRecord);

export default router;
