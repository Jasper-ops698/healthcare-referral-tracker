import { Router } from 'express';
import { authenticateJWT } from '../middleware/regionalAuth.js';
import { handleUpsert, handleListByCollector, handleStatsByStation, handleDelete } from '../controllers/dailyVisitController.js';

const router = Router();

router.post('/', authenticateJWT, handleUpsert);
router.get('/', authenticateJWT, handleListByCollector);
router.get('/stats/:stationId', authenticateJWT, handleStatsByStation);
router.delete('/:id', authenticateJWT, handleDelete);

export default router;
