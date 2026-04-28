/**
 * Notification Routes — Push subscription & notification history
 *
 * Endpoints:
 *   POST /api/v1/notifications/subscribe     — Register push subscription
 *   POST /api/v1/notifications/unsubscribe   — Remove push subscription
 *   GET  /api/v1/notifications/vapid-key     — Get VAPID public key
 *   GET  /api/v1/notifications/health        — Check notification services status
 */

import { Router } from 'express';
import { saveSubscription, removeSubscription, isPushEnabled, getVapidPublicKey } from '../services/pushService.js';
import { authenticateJWT } from '../middleware/regionalAuth.js';

const router = Router();

/**
 * POST /api/v1/notifications/subscribe
 * Body: { subscription: PushSubscription }
 */
router.post('/subscribe', authenticateJWT, (req, res) => {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id?.toString();
    const { subscription } = req.body;

    if (!userId || !subscription || !subscription.endpoint) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'User ID and subscription are required' },
      });
      return;
    }

    saveSubscription(userId, subscription);

    res.status(200).json({
      success: true,
      data: { message: 'Push subscription saved' },
    });
  } catch (error) {
    console.error('[Notifications] Subscribe error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to save subscription' },
    });
  }
});

/**
 * POST /api/v1/notifications/unsubscribe
 * Body: { endpoint: string }
 */
router.post('/unsubscribe', authenticateJWT, (req, res) => {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id?.toString();
    const { endpoint } = req.body;

    if (!userId || !endpoint) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'User ID and endpoint are required' },
      });
      return;
    }

    removeSubscription(userId, endpoint);

    res.status(200).json({
      success: true,
      data: { message: 'Push subscription removed' },
    });
  } catch (error) {
    console.error('[Notifications] Unsubscribe error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to remove subscription' },
    });
  }
});

/**
 * GET /api/v1/notifications/vapid-key
 * Returns the VAPID public key for frontend subscription
 */
router.get('/vapid-key', (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({
      success: false,
      error: { code: 'NOT_CONFIGURED', message: 'Push notifications not configured' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: { publicKey: key },
  });
});

/**
 * GET /api/v1/notifications/health
 * Check status of all notification channels
 */
router.get('/health', async (_req, res) => {
  const { verifyEmailConnection } = await import('../services/emailService');
  const { isSMSEnabled } = await import('../services/smsService');

  const [emailOk, smsOk, pushOk] = await Promise.all([
    verifyEmailConnection().catch(() => false),
    Promise.resolve(isSMSEnabled()),
    Promise.resolve(isPushEnabled()),
  ]);

  res.status(200).json({
    success: true,
    data: {
      email: emailOk ? 'connected' : 'disconnected',
      sms: smsOk ? 'configured' : 'not_configured',
      push: pushOk ? 'configured' : 'not_configured',
    },
  });
});

export default router;
