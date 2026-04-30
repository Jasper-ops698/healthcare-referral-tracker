/**
 * Facility Controller — CRUD + List
 *
 * Endpoints:
 *   GET    /api/v1/facilities        — List all facilities
 *   GET    /api/v1/facilities/:id    — Get single facility
 *   POST   /api/v1/facilities        — Create facility
 *   PUT    /api/v1/facilities/:id    — Update facility
 *   DELETE /api/v1/facilities/:id    — Toggle active status
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Facility from '../models/Facility.js';
import type { IFacility } from '../models/Facility.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

// ─── HELPERS ───

function requireAuth(req: Request, res: Response): AuthenticatedRequest | null {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return null;
  }
  return authReq;
}

// ─── LIST FACILITIES ───

export async function handleListFacilities(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { type, isActive, county, search } = req.query;

    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (county) filter.county = { $regex: county as string, $options: 'i' };

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { county: { $regex: q, $options: 'i' } },
        { 'address.city': { $regex: q, $options: 'i' } },
      ];
    }

    const facilities = await Facility.find(filter)
      .sort({ name: 1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: { facilities, count: facilities.length },
    });
  } catch (error) {
    console.error('[FacilityController] List error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list facilities' },
    });
  }
}

// ─── GET SINGLE FACILITY ───

export async function handleGetFacility(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid facility ID' } });
      return;
    }

    const facility = await Facility.findById(id).lean().exec();
    if (!facility) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Facility not found' } });
      return;
    }

    res.status(200).json({ success: true, data: facility });
  } catch (error) {
    console.error('[FacilityController] Get error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get facility' } });
  }
}

// ─── CREATE FACILITY ───

export async function handleCreateFacility(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const body = req.body;

    if (!body.name || !body.type || !body.phone) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'name, type, and phone are required' },
      });
      return;
    }

    const newFacility = new Facility({
      name: body.name.trim(),
      type: body.type,
      address: body.address || {},
      phone: body.phone.trim(),
      email: body.email?.trim() || undefined,
      departments: body.departments || [],
      services: body.services || [],
      isActive: body.isActive !== undefined ? body.isActive : true,
      county: body.county?.trim() || undefined,
      subCounty: body.subCounty?.trim() || undefined,
      ward: body.ward?.trim() || undefined,
    });

    await newFacility.save();

    res.status(201).json({
      success: true,
      data: { facility: newFacility.toJSON() },
    });
  } catch (error: any) {
    console.error('[FacilityController] Create error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to create facility' },
    });
  }
}

// ─── UPDATE FACILITY ───

export async function handleUpdateFacility(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid facility ID' } });
      return;
    }

    const body = req.body;
    const updates: Partial<IFacility> = {};

    const allowedFields = [
      'name', 'type', 'address', 'phone', 'email',
      'departments', 'services', 'isActive', 'county', 'subCounty', 'ward',
    ];

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        (updates as any)[key] = body[key];
      }
    }

    const updated = await Facility.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).exec();

    if (!updated) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Facility not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      data: { facility: updated.toJSON() },
    });
  } catch (error: any) {
    console.error('[FacilityController] Update error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to update facility' },
    });
  }
}

// ─── TOGGLE ACTIVE STATUS ───

export async function handleToggleFacilityStatus(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid facility ID' } });
      return;
    }

    const facility = await Facility.findById(id).exec();
    if (!facility) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Facility not found' } });
      return;
    }

    facility.isActive = !facility.isActive;
    await facility.save();

    res.status(200).json({
      success: true,
      message: `Facility ${facility.isActive ? 'activated' : 'deactivated'}`,
      data: { facility: facility.toJSON() },
    });
  } catch (error) {
    console.error('[FacilityController] Toggle error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle facility status' },
    });
  }
}
