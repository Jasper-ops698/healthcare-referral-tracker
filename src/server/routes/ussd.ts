/**
 * USSD Webhook Route — Africa's Talking
 *
 * POST /api/v1/ussd
 *
 * Africa's Talking sends POST requests here when a user interacts with
 * the USSD session. The response body must be plain text starting with
 * "CON " (continue) or "END " (end).
 *
 * CHP dials: *384*<token>#
 * The token is the same one from the counter-referral email/SMS link.
 */

import { Router, type Request, type Response } from 'express';
import { handleUSSD } from '../services/ussdService.js';

const router = Router();

// Africa's Talking sends POST to this endpoint
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      phoneNumber,
      text,
      serviceCode,
    } = req.body;

    // Africa's Talking sends the token as part of serviceCode
    // e.g., serviceCode = "*384*abc123#" → token = "abc123"
    let token = '';
    if (serviceCode) {
      const match = serviceCode.match(/\*384\*(.+)/);
      if (match) {
        token = match[1].replace(/#$/, ''); // Remove trailing #
      }
    }

    // Fallback: token might be in the text input (first entry)
    if (!token && text) {
      const parts = text.split('*');
      if (parts.length >= 2) {
        token = parts[0];
      }
    }

    if (!token) {
      res.set('Content-Type', 'text/plain');
      res.send('END Invalid session. Please use the link sent by your community health worker.');
      return;
    }

    const response = await handleUSSD(phoneNumber || '', token, text || '');

    // Must return plain text for Africa's Talking
    res.set('Content-Type', 'text/plain');
    res.send(response);

  } catch (error: any) {
    console.error('[USSD Route] Error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END An error occurred. Please try again.');
  }
});

// GET version for testing in browser (doesn't create real sessions)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { phone, token, text } = req.query;

    if (!token) {
      res.set('Content-Type', 'text/plain');
      res.send('END Missing token. Use ?token=xxx&phone=2547...');
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
