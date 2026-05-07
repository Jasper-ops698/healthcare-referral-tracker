/**
 * Auth Routes — /api/v1/auth/*
 *
 * Endpoints:
 *   POST /api/v1/auth/login    — Authenticate, return JWT
 *   POST /api/v1/auth/logout   — Clear session (client-side)
 *   GET  /api/v1/auth/me       — Get current user profile
 */

import { Router } from 'express';
import { handleLogin, handleLogout, handleMe, handleChangePassword, handleUpdateSettings, handleSetPassword } from '../controllers/authController.js';
import {
  handle2FASetup,
  handle2FAVerifySetup,
  handle2FADisable,
  handle2FALoginVerify,
  handle2FAStatus,
} from '../controllers/twoFactorController.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';
import { loginRateLimiter, twoFactorRateLimiter } from '../middleware/authRateLimit.js';

const router = Router();

router.post('/login', loginRateLimiter, handleLogin);
router.post('/logout', handleLogout);
router.post('/change-password', authenticateJWT, handleChangePassword);
router.post('/set-password', handleSetPassword);
router.put('/settings', authenticateJWT, handleUpdateSettings);
router.get('/me', authenticateJWT, handleMe);

// ─── 2FA Routes ───
router.post('/2fa/setup', authenticateJWT, handle2FASetup);
router.post('/2fa/verify-setup', authenticateJWT, handle2FAVerifySetup);
router.post('/2fa/disable', authenticateJWT, handle2FADisable);
router.post('/2fa/login-verify', twoFactorRateLimiter, handle2FALoginVerify);
router.get('/2fa/status', authenticateJWT, handle2FAStatus);

export default router;
