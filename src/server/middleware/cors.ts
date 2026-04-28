/**
 * CORS Configuration — Origin-Locked for Production
 *
 * Allows:
 *   - Kimi deployed frontend (https://oizwnscb3c4jm.kimi.show)
 *   - Render preview deployments (*.onrender.com)
 *   - Local development (localhost)
 *
 * SECURITY: Never use `origin: '*'` in production.
 */

import type { CorsOptions } from 'cors';

const NODE_ENV = process.env.NODE_ENV || 'development';

// Parse CORS_ORIGIN env var (supports comma-separated list)
const rawOrigins = process.env.CORS_ORIGIN || '';
const envOrigins = rawOrigins
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  // Kimi deployed frontend (new deployment)
  'https://b4dkgdjgaivqi.kimi.show',
  // Render deployments (preview URLs)
  'https://healthtrack-api.onrender.com',
  // Local development
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  // Any additional origins from env
  ...envOrigins,
];

function originChecker(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  // Allow requests with no origin (server-to-server, curl, mobile apps)
  if (!origin) {
    return callback(null, true);
  }

  // Check exact match
  if (ALLOWED_ORIGINS.includes(origin)) {
    return callback(null, true);
  }

  // Allow Render preview URLs (*.onrender.com)
  if (origin.endsWith('.onrender.com')) {
    return callback(null, true);
  }

  // Development: allow localhost
  if (NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
    return callback(null, true);
  }

  console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
  callback(new Error(`Origin "${origin}" is not authorized to access this API.`));
}

export const corsConfig: CorsOptions = {
  origin: originChecker,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Device-ID',
    'X-Region',
    'Accept',
  ],
  exposedHeaders: [
    'X-Server-Version',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  credentials: true,
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

export default corsConfig;
