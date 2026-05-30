/**
 * Patient Referral Tracker — Express Server Entry Point
 *
 * This server provides:
 *   - REST API for sync operations (/sync/*)
 *   - MongoDB persistence via Mongoose
 *   - CORS for frontend integration
 *   - Health check endpoint
 *
 * Environment variables (in .env):
 *   MONGODB_URI     — MongoDB connection string
 *   PORT            — Server port (default: 3001)
 *   NODE_ENV        — 'development' | 'production'
 *   JWT_SECRET      — Secret for auth tokens
 *   CORS_ORIGIN     — Allowed CORS origin (default: *)
 */

import 'dotenv/config'; // Load .env IMMEDIATELY — before any module reads process.env

// Early startup log — confirms tsx loaded this file
console.log(`[Startup] index.ts loaded. PORT=${process.env.PORT || 'unset'}, NODE_ENV=${process.env.NODE_ENV || 'unset'}, MONGODB_URI=${process.env.MONGODB_URI ? 'set' : 'MISSING'}, JWT_SECRET=${process.env.JWT_SECRET ? 'set' : 'MISSING'}`);

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import syncRoutes from './routes/sync.js';
import authRoutes from './routes/auth.js';
import chpRoutes from './routes/chps.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { processPendingEmails } from './services/emailService.js';
import userRoutes from './routes/users.js';
import patientRoutes from './routes/patients.js';
import medicalRecordRoutes from './routes/medicalRecords.js';
import facilityRoutes from './routes/facilities.js';
import referralRoutes from './routes/referrals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import emailRoutes from './routes/email.js';
import notificationRoutes from './routes/notifications.js';
import systemRoutes from './routes/system.js';
import analyticsRoutes from './routes/analytics.js';
import aiChatRoutes from './routes/aiChat.js';
import diseaseIncidenceRoutes from './routes/diseaseIncidence.js';
import { corsConfig } from './middleware/cors.js';
import cors from 'cors';
import { bootstrapPrimaryAdmin } from './controllers/authController.js';
import { migrateRenameCHPToCollector } from './migrations/001_rename_chp_to_collector.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── INITIALIZATION ───

const app = express();

// ─── MIDDLEWARE ───

// CORS — origin-locked to frontend domain
// See src/server/middleware/cors.ts for the whitelist
app.use(cors(corsConfig));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (development only)
if (NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── ROUTES ───

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime(),
  });
});

// API version prefix
const API_PREFIX = '/api/v1';

// Auth routes (no auth required for login)
app.use(`${API_PREFIX}/auth`, authRoutes);

// User routes (admin only — auth enforced per-route)
app.use(`${API_PREFIX}/users`, userRoutes);

// CHP routes (admin only — auth enforced per-route)
app.use(`${API_PREFIX}/chps`, chpRoutes);

// Patient routes (admin + collector)
app.use(`${API_PREFIX}/patients`, patientRoutes);

// Medical Record routes (admin + collector)
app.use(`${API_PREFIX}/medical-records`, medicalRecordRoutes);

// Facility routes (list for all, mutations admin only)
app.use(`${API_PREFIX}/facilities`, facilityRoutes);

// Referral routes (cross-facility handoff tracking)
app.use(`${API_PREFIX}/referrals`, referralRoutes);

// V2 Referral routes (pure referral-focused architecture)
import referralV2Routes from './routes/referralsV2.js';
app.use(`${API_PREFIX}/referrals-v2`, referralV2Routes);

// Counter-referral routes
import counterReferralRoutes from './routes/counterReferrals.js';
app.use(`${API_PREFIX}/counter-referrals`, counterReferralRoutes);
console.log('[Routes] Counter-referral routes registered at', `${API_PREFIX}/counter-referrals`);

// CHP Alert routes (collector notifications for CHP escalations)
import chpAlertRoutes from './routes/chpAlerts.js';
app.use(`${API_PREFIX}/chp-alerts`, chpAlertRoutes);
console.log('[Routes] CHP Alert routes registered at', `${API_PREFIX}/chp-alerts`);

// Public CHP feedback form routes (shorter URL for email links)
// These are aliases that forward to the counter-referral controller
import { handleChpFormData, handleChpFormSubmit } from './controllers/counterReferralController.js';
app.get(`${API_PREFIX}/chp-feedback/:token`, handleChpFormData);
app.post(`${API_PREFIX}/chp-feedback/:token`, handleChpFormSubmit);

// Station routes
import stationRoutes from './routes/stations.js';
import { seedStations } from './controllers/stationController.js';
app.use(`${API_PREFIX}/stations`, stationRoutes);

// seedStations() is called inside startServer() after DB connects

// Daily Visit routes
import dailyVisitRoutes from './routes/dailyVisits.js';
app.use(`${API_PREFIX}/daily-visits`, dailyVisitRoutes);

// Email routes
app.use(`${API_PREFIX}/email`, emailRoutes);

// Notification routes (push subscription, etc.)
app.use(`${API_PREFIX}/notifications`, notificationRoutes);

// System routes (config, exports — admin only)
app.use(`${API_PREFIX}/system`, systemRoutes);

// Analytics routes (dashboard KPIs)
app.use(`${API_PREFIX}/analytics`, analyticsRoutes);
app.use(`${API_PREFIX}/ai`, aiChatRoutes);
app.use(`${API_PREFIX}/disease-incidence`, diseaseIncidenceRoutes);

// Sync routes (auth + regional scoping applied internally)
app.use(`${API_PREFIX}/sync`, syncRoutes);
app.use('/sync', syncRoutes);

// ─── STATIC FRONTEND ───
// Serve built frontend from dist/ (for unified hosting on Render)
const DIST_PATH = path.resolve(__dirname, '../../dist');
app.use(express.static(DIST_PATH));

// SPA fallback — serve index.html for all non-API routes
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/sync/')) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API endpoint not found' } });
  }
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

// ─── 404 HANDLER ───

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  });
});

// ─── ERROR HANDLER ───

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: NODE_ENV === 'production'
        ? 'An internal server error occurred'
        : err.message,
    },
  });
});

// ─── SERVER START ───

async function startServer(): Promise<void> {
  // Safety timeout: if startup takes >60s, force exit so Render can restart
  const safetyTimeout = setTimeout(() => {
    console.error('[FATAL] Server startup timed out after 60s. Forcing exit.');
    process.exit(1);
  }, 60000);

  try {
    console.log('[Startup] Step 1/5: Connecting to MongoDB...');
    await connectDatabase();
    console.log('[Startup] Step 2/5: MongoDB connected. Bootstrapping admin...');

    await bootstrapPrimaryAdmin();
    console.log('[Startup] Step 3/5: Admin ready. Running migrations...');

    await migrateRenameCHPToCollector();
    console.log('[Startup] Step 4/5: Migrations done. Seeding stations...');

    await seedStations();
    console.log('[Startup] Step 5/5: Stations seeded. Starting HTTP server...');

    // Start HTTP server
    app.listen(PORT, () => {
      clearTimeout(safetyTimeout);
      console.log(`[Startup] HTTP server listening on port ${PORT}`);
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║     Patient Referral Tracker — Production Server                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Environment:  ${NODE_ENV.padEnd(51)}║
║  Port:         ${PORT.toString().padEnd(51)}║
║  MongoDB:      ${(process.env.MONGODB_URI || 'mongodb://localhost:27017/patienttrack').padEnd(51)}║
╠══════════════════════════════════════════════════════════════════╣
║  Auth Endpoints:                                                 ║
║    POST /api/v1/auth/login     Login (email + password)          ║
║    POST /api/v1/auth/logout    Logout                            ║
║    GET  /api/v1/auth/me        Current user profile              ║
║                                                                  ║
║  Sync Endpoints:                                                 ║
║    POST /sync/push             Push local changes                ║
║    POST /sync/pull             Pull remote changes               ║
║    GET  /sync/status           Sync statistics                   ║
║                                                                  ║
║  CHP Alert Endpoints (Phase C):                                  ║
║    GET  /api/v1/chp-alerts           List collector alerts       ║
║    GET  /api/v1/chp-alerts/stats     Alert statistics            ║
║    GET  /api/v1/chp-alerts/:id/journey  Alert + patient journey   ║
║    PATCH /api/v1/chp-alerts/:id/ack  Acknowledge alert           ║
║    PATCH /api/v1/chp-alerts/:id/resolve  Resolve alert           ║
║                                                                  ║
║  Email Endpoints:                                                ║
║    GET  /api/v1/email/health   SMTP health check                 ║
║    POST /api/v1/email/welcome  Send welcome email                ║
║    POST /api/v1/email/send     Send custom email                 ║
║                                                                  ║
║  System:                                                         ║
║    GET  /health                Server health check               ║
╚══════════════════════════════════════════════════════════════════╝
      `);

      // ─── START EMAIL CRON JOB ───
      // Retry failed/pending emails every 5 minutes
      const CRON_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
      setInterval(async () => {
        try {
          const stats = await processPendingEmails(20);
          if (stats.processed > 0) {
            console.log(`[Email Cron] Processed: ${stats.processed} | Sent: ${stats.sent} | Failed: ${stats.failed} | Cancelled: ${stats.cancelled}`);
          }
        } catch (err) {
          console.error('[Email Cron] Error:', err);
        }
      }, CRON_INTERVAL_MS);
      console.log(`[Email Cron] Started — retrying failed emails every ${CRON_INTERVAL_MS / 60000} minutes`);
    });

  } catch (error) {
    console.error('[Fatal] Failed to start server:', error);
    process.exit(1);
  }
}

// ─── GRACEFUL SHUTDOWN ───

process.on('SIGTERM', async () => {
  console.log('[Shutdown] SIGTERM received, closing server...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Shutdown] SIGINT received, closing server...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[Fatal] Uncaught exception:', error);
  disconnectDatabase().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled rejection:', reason);
  disconnectDatabase().then(() => process.exit(1));
});

// ─── START ───

startServer();