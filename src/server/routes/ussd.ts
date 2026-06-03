/**
 * USSD Webhook Route — Africa's Talking
 *
 * POST /api/v1/ussd
 *
 * Africa's Talking sends POST requests here when a user interacts with
 * the USSD session. The response body must be plain text starting with
 * "CON " (continue) or "END " (end).
 *
 * Configured service code: *384*53795#
 * CHP dials the shared code, then enters their patient token through the menu.
 */

import { Router, type Request, type Response } from 'express';
import { handleUSSD, handleUSSDWithSharedCode } from '../services/ussdService.js';

const router = Router();

/** The USSD service code configured in Africa's Talking (e.g., *384*53795#) */
const USSD_SERVICE_CODE = process.env.AFRICASTALKING_USSD_CODE || '*384*53795#';

// Africa's Talking sends POST to this endpoint
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      phoneNumber,
      text,
      serviceCode,
    } = req.body;

    console.log(`[USSD] sessionId=${sessionId}, phone=${phoneNumber}, serviceCode=${serviceCode}, text="${text}"`);

    // Check if this is the configured shared service code (*384*53795#)
    const isSharedCode = serviceCode === USSD_SERVICE_CODE ||
      serviceCode === USSD_SERVICE_CODE.replace(/#$/, ''); // without trailing #

    if (isSharedCode) {
      // Shared USSD code flow: CHP dials *384*53795#, then enters patient token via menu
      const response = await handleUSSDWithSharedCode(phoneNumber || '', text || '', sessionId || '');
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }

    // Legacy: token embedded in serviceCode (e.g., *384*abc123#)
    let token = '';
    if (serviceCode) {
      const match = serviceCode.match(/\*384\*(.+)/);
      if (match) {
        token = match[1].replace(/#$/, '');
      }
    }

    if (!token) {
      res.set('Content-Type', 'text/plain');
      res.send('END Invalid session. Please dial *384*53795# to access HealthTrack.');
      return;
    }

    const response = await handleUSSD(phoneNumber || '', token, text || '');
    res.set('Content-Type', 'text/plain');
    res.send(response);

  } catch (error: any) {
    console.error('[USSD Route] Error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END An error occurred. Please try again.');
  }
});

// GET version for testing in browser
router.get('/', async (req: Request, res: Response) => {
  try {
    const { phone, token, text, sessionId } = req.query;

    if (!token) {
      // Test with shared code flow
      const response = await handleUSSDWithSharedCode(
        (phone as string) || '254700000000',
        (text as string) || '',
        (sessionId as string) || 'test-session'
      );
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }

    const response = await handleUSSD(
      (phone as string) || '254700000000',
      token as string,
      (text as string) || ''
    );
    res.set('Content-Type', 'text/plain');
    res.send(response);

  } catch (error: any) {
    console.error('[USSD Route] GET Error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END An error occurred.');
  }
});

export default router;
