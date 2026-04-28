/**
 * User Routes — /api/v1/users/*
 *
 * Endpoints:
 *   POST /api/v1/users       — Create new user (admin only)
 *   POST /api/v1/users/resend — Resend welcome email (admin only)
 *   GET  /api/v1/users       — List all users (admin only)
 */

import { Router } from 'express';
import { handleCreateUser, handleListUsers, handleResendWelcome } from '../controllers/userController.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';

const router = Router();

router.post('/', authenticateJWT, handleCreateUser);
router.post('/resend', authenticateJWT, handleResendWelcome);
router.get('/', authenticateJWT, handleListUsers);

export default router;
