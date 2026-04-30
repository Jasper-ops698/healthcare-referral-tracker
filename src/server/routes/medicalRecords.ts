import { Router } from 'express';
import { authenticateJWT, requireRole } from '../middleware/regionalAuth.js';
import {
  handleListMedicalRecords,
  handleGetMedicalRecord,
  handleCreateMedicalRecord,
  handleUpdateMedicalRecord,
  handleDeleteMedicalRecord,
} from '../controllers/medicalRecordController.js';

const router = Router();

router.use(authenticateJWT);

router.get('/', requireRole('admin', 'collector'), handleListMedicalRecords);
router.post('/', requireRole('admin', 'collector'), handleCreateMedicalRecord);
router.get('/:id', requireRole('admin', 'collector'), handleGetMedicalRecord);
router.put('/:id', requireRole('admin', 'collector'), handleUpdateMedicalRecord);
router.delete('/:id', requireRole('admin', 'collector'), handleDeleteMedicalRecord);

export default router;
