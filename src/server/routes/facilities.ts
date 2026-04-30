import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/regionalAuth.js';
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
router.get('/', authorizeRoles('admin', 'collector'), handleListFacilities);
router.get('/:id', authorizeRoles('admin', 'collector'), handleGetFacility);

// Mutations restricted to admin
router.post('/', authorizeRoles('admin'), handleCreateFacility);
router.put('/:id', authorizeRoles('admin'), handleUpdateFacility);
router.delete('/:id', authorizeRoles('admin'), handleToggleFacilityStatus);

export default router;
