/**
 * Station Routes
 */
import { Router } from 'express';
import {
  handleListStations,
  handleCreateStation,
  handleGetStation,
  handleUpdateStation,
  handleDeleteStation,
} from '../controllers/stationController.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';

const router = Router();

router.get('/', authenticateJWT, handleListStations);
router.post('/', authenticateJWT, handleCreateStation);
router.get('/:id', authenticateJWT, handleGetStation);
router.put('/:id', authenticateJWT, handleUpdateStation);
router.delete('/:id', authenticateJWT, handleDeleteStation);

export default router;
