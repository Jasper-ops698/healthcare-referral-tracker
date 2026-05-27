/**
 * DailyVisit Controller — CRUD for facility visit counts
 */

import type { Request, Response } from 'express';
import DailyVisit from '../schemas/DailyVisit.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

export async function handleUpsert(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    if (!user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { date, totalVisits, maleVisits, femaleVisits, childVisits, notes, stationId, stationName } = req.body;
    if (!date || totalVisits === undefined) { res.status(400).json({ success: false, error: 'date and totalVisits required' }); return; }

    const visit = await DailyVisit.findOneAndUpdate(
      { collectorId: user._id.toString(), stationId, date },
      {
        $set: {
          totalVisits: Number(totalVisits),
          maleVisits: Number(maleVisits || 0),
          femaleVisits: Number(femaleVisits || 0),
          childVisits: Number(childVisits || 0),
          notes: notes || undefined,
          stationName,
          collectorName: `${user.firstName} ${user.lastName}`,
        },
      },
      { new: true, upsert: true, runValidators: true }
    ).lean().exec();

    res.status(200).json({ success: true, data: visit });
  } catch (err: any) {
    console.error('[DailyVisit] Upsert error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function handleListByCollector(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    if (!user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { stationId } = req.query;
    const filter: Record<string, unknown> = { collectorId: user._id.toString() };
    if (stationId) filter.stationId = stationId as string;

    const visits = await DailyVisit.find(filter).sort({ date: -1 }).limit(30).lean().exec();
    res.status(200).json({ success: true, data: { visits } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function handleStatsByStation(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    if (!user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { stationId } = req.params;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

    const visits = await DailyVisit.find({ stationId, date: { $gte: dateStr } }).lean().exec();

    const stats = {
      totalVisits: visits.reduce((s, v) => s + v.totalVisits, 0),
      totalMale: visits.reduce((s, v) => s + v.maleVisits, 0),
      totalFemale: visits.reduce((s, v) => s + v.femaleVisits, 0),
      totalChild: visits.reduce((s, v) => s + v.childVisits, 0),
      daysLogged: visits.length,
      dailyAverage: visits.length > 0 ? Math.round(visits.reduce((s, v) => s + v.totalVisits, 0) / visits.length) : 0,
    };

    res.status(200).json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function handleDelete(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    if (!user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { id } = req.params;
    await DailyVisit.findOneAndDelete({ _id: id, collectorId: user._id.toString() }).exec();
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
