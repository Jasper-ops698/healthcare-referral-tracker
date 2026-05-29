/**
 * User Routes — /api/v1/users/*
 *
 * Endpoints:
 *   POST /api/v1/users       — Create new user (admin only)
 *   POST /api/v1/users/resend — Resend welcome email (admin only)
 *   GET  /api/v1/users       — List all users (admin only)
 */

import { Router } from 'express';
import { handleCreateUser, handleListUsers, handleResendWelcome, handleUpdateProfile, handleAdminUpdateUser } from '../controllers/userController.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';

const router = Router();

router.post('/', authenticateJWT, handleCreateUser);
router.post('/resend', authenticateJWT, handleResendWelcome);
router.get('/', authenticateJWT, handleListUsers);
router.patch('/me', authenticateJWT, handleUpdateProfile);
router.patch('/:id', authenticateJWT, handleAdminUpdateUser);

export default router;
