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
import { authenticate } from '../middleware/regionalAuth.js';

const router = Router();

router.get('/', authenticate, handleListStations);
router.post('/', authenticate, handleCreateStation);
router.get('/:id', authenticate, handleGetStation);
router.put('/:id', authenticate, handleUpdateStation);
router.delete('/:id', authenticate, handleDeleteStation);

export default router;
