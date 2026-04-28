/**
 * System Config Controller — Global privacy & data settings
 *
 * Endpoints:
 *   GET  /api/v1/system/config     — Read current config (admin only)
 *   PUT  /api/v1/system/config     — Update config (admin only)
 */

import type { Request, Response } from 'express';
import SystemConfig from '../models/SystemConfig.js';

// ─── GET CONFIG ───
export async function handleGetConfig(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id;
    const userRole = authReq.user?.role;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    if (userRole !== 'admin') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }

    const config = await SystemConfig.getSingleton();

    res.status(200).json({
      success: true,
      data: {
        dataRetentionDays: config.dataRetentionDays,
        autoBackupsEnabled: config.autoBackupsEnabled,
        auditLoggingEnabled: config.auditLoggingEnabled,
        lastBackupAt: config.lastBackupAt,
        backupCount: config.backupCount,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error('[SystemConfig Get Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load system config' } });
  }
}

// ─── UPDATE CONFIG ───
export async function handleUpdateConfig(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id?.toString();
    const userRole = authReq.user?.role;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    if (userRole !== 'admin') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }

    const { dataRetentionDays, autoBackupsEnabled, auditLoggingEnabled } = req.body;

    const updates: Partial<{ dataRetentionDays: number; autoBackupsEnabled: boolean; auditLoggingEnabled: boolean }> = {};
    if (dataRetentionDays !== undefined) updates.dataRetentionDays = dataRetentionDays;
    if (autoBackupsEnabled !== undefined) updates.autoBackupsEnabled = autoBackupsEnabled;
    if (auditLoggingEnabled !== undefined) updates.auditLoggingEnabled = auditLoggingEnabled;

    const config = await SystemConfig.updateSingleton(updates, userId);

    res.status(200).json({
      success: true,
      data: {
        dataRetentionDays: config.dataRetentionDays,
        autoBackupsEnabled: config.autoBackupsEnabled,
        auditLoggingEnabled: config.auditLoggingEnabled,
        lastBackupAt: config.lastBackupAt,
        backupCount: config.backupCount,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error('[SystemConfig Update Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update system config' } });
  }
}
