/**
 * Data Export Controller — Patient records & system audit logs
 *
 * Endpoints:
 *   GET /api/v1/export/patients?format=csv|json  — Export patient data
 *   GET /api/v1/export/audit-logs?format=json     — Export audit logs
 *
 * All exports are admin-only. Respects regional scoping for non-admin users.
 */

import type { Request, Response } from 'express';
import MedicalRecord from '../models/MedicalRecord.js';
import AuditLog from '../models/AuditLog.js';

// ─── CSV HELPER ───
function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  if (rows.length === 0) return columns.join(',') + '\n';
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  const header = columns.map(c => escape(c)).join(',');
  const lines = rows.map(row => columns.map(c => escape(row[c])).join(','));
  return [header, ...lines].join('\n') + '\n';
}

// ─── EXPORT PATIENTS ───
export async function handleExportPatients(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id;
    const userRole = authReq.user?.role;
    const userRegion = authReq.user?.region;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    if (userRole !== 'admin') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }

    const format = (req.query.format as string) || 'json';

    // Query patients (respect region for non-global admins)
    const query: Record<string, unknown> = { type: 'patient' };
    if (userRole !== 'admin' || userRegion !== 'global') {
      (query as any)['_sync.region'] = userRegion;
    }

    const records = await MedicalRecord.find(query).lean().limit(5000);

    // Transform to clean patient objects
    const patients = records.map(r => ({
      patientId: r._sync?.clientId || '',
      firstName: r.firstName || '',
      lastName: r.lastName || '',
      dateOfBirth: r.dateOfBirth || '',
      gender: r.gender || '',
      phone: r.phone || '',
      region: r._sync?.region || '',
      registeredBy: r._sync?.modifiedBy || '',
      version: r._sync?.clientVersion || 0,
    }));

    if (format === 'csv') {
      const columns = ['patientId', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'phone', 'region', 'registeredBy', 'version'];
      const csv = toCSV(patients, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="patients-${new Date().toISOString().split('T')[0]}.csv"`);
      res.status(200).send(csv);
      return;
    }

    // Default: JSON
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="patients-${new Date().toISOString().split('T')[0]}.json"`);
    res.status(200).json({
      exportedAt: new Date().toISOString(),
      count: patients.length,
      patients,
    });
  } catch (error) {
    console.error('[Export Patients Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to export patients' } });
  }
}

// ─── EXPORT AUDIT LOGS ───
export async function handleExportAuditLogs(req: Request, res: Response): Promise<void> {
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

    // Parse date filters
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const query: Record<string, unknown> = {};
    if (from || to) {
      query.createdAt = {};
      if (from) (query.createdAt as any).$gte = from;
      if (to) (query.createdAt as any).$lte = to;
    }

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).lean().limit(5000);

    const formatted = logs.map(l => ({
      id: l._id?.toString(),
      action: l.action,
      userId: l.userId,
      targetId: l.targetId,
      targetType: l.targetType,
      details: l.details,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      createdAt: l.createdAt,
    }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.json"`);
    res.status(200).json({
      exportedAt: new Date().toISOString(),
      count: formatted.length,
      logs: formatted,
    });
  } catch (error) {
    console.error('[Export Audit Logs Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to export audit logs' } });
  }
}
