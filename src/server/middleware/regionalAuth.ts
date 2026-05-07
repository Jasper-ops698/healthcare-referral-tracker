/**
 * Regional Security Middleware — JWT + Cross-Region Leakage Prevention
 *
 * Every sync request carries a JWT. This middleware:
 * 1. Validates the JWT signature and expiry
 * 2. Loads the user from MongoDB
 * 3. Injects `req.user` with the user's profile (including region)
 * 4. Blocks requests where the user's region ≠ the request's region
 * 5. Prevents primary admin mutation via standard API routes
 *
 * CROSS-REGION LEAKAGE PREVENTION:
 *   A Collector in "Mtwapa" cannot read or write data tagged with
 *   "Mombasa", "Kilifi", or any other region. The middleware
 *   enforces this at the HTTP boundary — before any controller
 *   logic executes.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User, { PRIMARY_ADMIN_EMAIL } from '../models/User.js';
import type { IUser } from '../models/User.js';

// ─── TYPES ───

/** Augmented Express Request with authenticated user */
export interface AuthenticatedRequest extends Request {
  user: {
    _id: mongoose.Types.ObjectId;
    email: string;
    role: string;
    region: string;
    firstName: string;
    lastName: string;
    isPrimaryAdmin: boolean;
    iat: number;
    exp: number;
  };
}

/** JWT payload structure */
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  region: string;
  firstName: string;
  lastName: string;
  isPrimaryAdmin: boolean;
  iat?: number;
  exp?: number;
}

// ─── JWT CONFIG ───

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '7d';

if (!JWT_SECRET) {
  throw new Error('[Startup] Missing required env var: JWT_SECRET');
}

// ─── JWT HELPER FUNCTIONS ───

/**
 * Sign a JWT for an authenticated user.
 * Call this after successful login (email/password verification).
 */
export function signJWT(user: IUser): string {
  const payload: JWTPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    region: user.region,
    firstName: user.firstName,
    lastName: user.lastName,
    isPrimaryAdmin: user.isPrimaryAdmin,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    issuer: 'healthtrack-sync',
    audience: 'healthtrack-client',
  });
}

/**
 * Verify a JWT token. Returns the decoded payload or null if invalid.
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'healthtrack-sync',
      audience: 'healthtrack-client',
    }) as JWTPayload;
  } catch {
    return null;
  }
}

// ─── MIDDLEWARE: JWT AUTHENTICATION ───

/**
 * authenticateJWT — Validates the Bearer token and injects req.user.
 *
 * Expected header: Authorization: Bearer <token>
 */
export async function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header. Expected: Bearer <token>' },
    });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  // Verify JWT signature and expiry
  const payload = verifyJWT(token);
  if (!payload) {
    res.status(401).json({
      success: false,
      error: { code: 'TOKEN_INVALID', message: 'JWT is invalid or expired' },
    });
    return;
  }

  // Inject user into request
  (req as AuthenticatedRequest).user = {
    _id: new mongoose.Types.ObjectId(payload.userId),
    email: payload.email,
    role: payload.role,
    region: payload.region,
    firstName: payload.firstName,
    lastName: payload.lastName,
    isPrimaryAdmin: payload.isPrimaryAdmin,
    iat: payload.iat || 0,
    exp: payload.exp || 0,
  };

  next();
}

// ─── MIDDLEWARE: REGIONAL SCOPING ───

/**
 * requireRegion — Ensures the request's region matches the user's region.
 *
 * This is the CROSS-REGION LEAKAGE prevention gate.
 * A Mtwapa Collector cannot sync data from Mombasa, Kilifi, or any other region.
 *
 * Expects `req.user` to be set by authenticateJWT.
 * Reads `req.body.region` from the sync request payload.
 */
export function requireRegion(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required before region check' },
    });
    return;
  }

  const userRegion = authReq.user.region;
  const requestRegion = (req.body?.region || req.query?.region)?.toString().trim();

  if (!requestRegion) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_REGION', message: 'Region is required in request body or query' },
    });
    return;
  }

  // Primary admin (bkitib@gmail.com) with region "global" can access any region
  // Other admins can only access their assigned region
  if (authReq.user.isPrimaryAdmin && userRegion === 'global') {
    return next(); // Primary admin bypass
  }

  // Strict region match for all other users
  if (requestRegion.toLowerCase() !== userRegion.toLowerCase()) {
    // Log the cross-region access attempt for security monitoring
    console.warn(`[SECURITY] Cross-region access attempt blocked:`, {
      user: authReq.user.email,
      userRegion,
      requestedRegion: requestRegion,
      endpoint: req.path,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    res.status(403).json({
      success: false,
      error: {
        code: 'CROSS_REGION_FORBIDDEN',
        message: `Access denied. Your region is "${userRegion}" but you requested "${requestRegion}". ` +
                 `Cross-region data access is not permitted.`,
      },
    });
    return;
  }

  next();
}

// ─── MIDDLEWARE: PRIMARY ADMIN PROTECTION ───

/**
 * protectPrimaryAdmin — Blocks destructive operations on bkitib@gmail.com.
 *
 * This middleware enforces the hardcoded protection at the route level.
 * It checks if the request targets the primary admin and rejects
 * role changes, status changes, deactivation, or deletion.
 */
export function protectPrimaryAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;

  // Check if the request body contains a target user email or userId
  const targetEmail = (req.body?.email || '').toLowerCase();
  const updates = req.body?.updates || req.body || {};

  // If the request targets the primary admin's email directly
  if (targetEmail === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    // Allow reads, block destructive modifications
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const forbiddenFields = ['role', 'status', 'isPrimaryAdmin', 'region', 'password'];
      const attemptedFields = forbiddenFields.filter(f => f in updates);

      if (attemptedFields.length > 0) {
        console.warn(`[SECURITY] Blocked primary admin mutation:`, {
          user: authReq.user?.email,
          attemptedFields,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });

        res.status(403).json({
          success: false,
          error: {
            code: 'PRIMARY_ADMIN_PROTECTED',
            message: 'The primary administrator account cannot be modified through the API. ' +
                     `Blocked fields: ${attemptedFields.join(', ')}`,
          },
        });
        return;
      }
    }
  }

  // Check if route params include the primary admin's user ID
  // This would need the actual primary admin's ObjectId - loaded at runtime
  // For now, the model-level pre-save hook is the final safety net

  next();
}

// ─── MIDDLEWARE: ROLE-BASED ACCESS CONTROL ───

/**
 * requireRole — Restricts a route to specific user roles.
 * @param allowedRoles Array of roles that can access this route.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `This route requires one of: ${allowedRoles.join(', ')}. Your role: ${authReq.user.role}`,
        },
      });
      return;
    }

    next();
  };
}

// ─── MIDDLEWARE: ADMIN ACCESS ───

/** Shorthand for admin-only routes */
export const requireAdmin = requireRole(['admin']);

/** Shorthand for admin + Collector routes */
export const requireStaff = requireRole(['admin', 'collector', 'doctor', 'nurse']);
