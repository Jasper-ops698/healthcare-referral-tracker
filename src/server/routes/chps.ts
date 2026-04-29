/**
 * CHP Routes — Community Health Promoter Management
 *
 * All routes require admin authentication.
 * Base: /api/v1/chps
 */

import { Router } from 'express';
import {
  handleCreateChp,
  handleListChps,
  handleGetChp,
  handleUpdateChp,
  handleDeleteChp,
  handleNotifyChp,
} from '../controllers/chpController.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';

const chpRouter = Router();

// ─── CRUD (all admin-only, JWT required) ───
chpRouter.post('/', authenticateJWT, handleCreateChp);      // POST   /api/v1/chps
chpRouter.get('/', authenticateJWT, handleListChps);        // GET    /api/v1/chps
chpRouter.get('/:id', authenticateJWT, handleGetChp);      // GET    /api/v1/chps/:id
chpRouter.put('/:id', authenticateJWT, handleUpdateChp);    // PUT    /api/v1/chps/:id
chpRouter.delete('/:id', authenticateJWT, handleDeleteChp);  // DELETE /api/v1/chps/:id

// ─── Notifications ───
chpRouter.post('/notify', authenticateJWT, handleNotifyChp); // POST /api/v1/chps/notify

export default chpRouter;
