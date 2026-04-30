import { Router } from 'express';
import { authenticateJWT, requireRole } from '../middleware/regionalAuth.js';
import {
  handleListFacilities,
  handleGetFacility,
  handleCreateFacility,
  handleUpdateFacility,
  handleToggleFacilityStatus,
} from '../controllers/facilityController.js';

const router = Router();

router.use(authenticateJWT);

// List and get are available to all authenticated users
router.get('/', requireRole('admin', 'collector'), handleListFacilities);
router.get('/:id', requireRole('admin', 'collector'), handleGetFacility);

// Mutations restricted to admin
router.post('/', requireRole('admin'), handleCreateFacility);
router.put('/:id', requireRole('admin'), handleUpdateFacility);
router.delete('/:id', requireRole('admin'), handleToggleFacilityStatus);

export default router;
