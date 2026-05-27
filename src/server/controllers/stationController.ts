/**
 * Station Controller — Manage stations (Household, HIP, Referral Center)
 */

import type { Request, Response } from 'express';
import Station from '../schemas/Station.js';

export async function handleListStations(req: Request, res: Response): Promise<void> {
  try {
    const { type, county, isActive } = req.query;
    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (county) filter.county = county;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const stations = await Station.find(filter).sort({ type: 1, name: 1 }).lean().exec();
    res.status(200).json({ success: true, data: { stations, count: stations.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleCreateStation(req: Request, res: Response): Promise<void> {
  try {
    const station = new Station(req.body);
    await station.save();
    res.status(201).json({ success: true, data: station.toJSON() });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export async function handleGetStation(req: Request, res: Response): Promise<void> {
  try {
    const station = await Station.findById(req.params.id).lean().exec();
    if (!station) { res.status(404).json({ success: false, error: 'Station not found' }); return; }
    res.status(200).json({ success: true, data: station });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleUpdateStation(req: Request, res: Response): Promise<void> {
  try {
    const station = await Station.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean().exec();
    if (!station) { res.status(404).json({ success: false, error: 'Station not found' }); return; }
    res.status(200).json({ success: true, data: station });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export async function handleDeleteStation(req: Request, res: Response): Promise<void> {
  try {
    await Station.findByIdAndUpdate(req.params.id, { isActive: false }).exec();
    res.status(200).json({ success: true, message: 'Station deactivated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/** Seed default stations if none exist */
export async function seedStations(): Promise<void> {
  const count = await Station.countDocuments();
  if (count > 0) return;

  const defaults = [
    { name: 'Household (General)', type: 'household', code: 'HH-GEN', county: 'Kilifi', description: 'Community household visits', services: ['screening', 'referral'] },
    { name: 'HIP - Bomani', type: 'hip', code: 'HIP-BOM', county: 'Kilifi', subCounty: 'Magarini', ward: 'Bomani', description: 'Health Information Point at Bomani', services: ['screening', 'basic-treatment', 'referral'] },
    { name: 'HIP - Marereni', type: 'hip', code: 'HIP-MAR', county: 'Kilifi', subCounty: 'Magarini', ward: 'Marereni', description: 'Health Information Point at Marereni', services: ['screening', 'basic-treatment', 'referral'] },
    { name: 'Bomani Dispensary', type: 'referral-center', code: 'RC-BOM', county: 'Kilifi', subCounty: 'Magarini', ward: 'Bomani', description: 'Primary referral facility', services: ['outpatient', 'maternity', 'lab', 'pharmacy', 'referral'] },
    { name: 'Kilifi General Hospital', type: 'referral-center', code: 'RC-KGH', county: 'Kilifi', subCounty: 'Kilifi Central', ward: 'Kilifi', description: 'County referral hospital', services: ['emergency', 'surgery', 'maternity', 'pediatrics', 'lab', 'radiology', 'pharmacy', 'referral'] },
    { name: 'Mariakani Sub-County Hospital', type: 'referral-center', code: 'RC-MSK', county: 'Kilifi', subCounty: 'Mariakani', ward: 'Mariakani', description: 'Sub-county referral hospital', services: ['outpatient', 'maternity', 'lab', 'pharmacy', 'referral'] },
  ];

  await Station.insertMany(defaults);
  console.log('[StationController] Seeded', defaults.length, 'default stations');
}
