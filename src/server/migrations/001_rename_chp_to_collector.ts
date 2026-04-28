/**
 * Migration 001: Rename 'chp' role to 'collector'
 *
 * Updates all existing User documents where role === 'chp'
 * to role === 'collector'. Idempotent — safe to run multiple times.
 */

import mongoose from 'mongoose';
import User from '../models/User.js';

export async function migrateRenameCHPToCollector(): Promise<void> {
  try {
    // Check if any users still have the old 'chp' role
    const count = await User.countDocuments({ role: 'chp' }).exec();
    if (count === 0) {
      console.log('[Migration 001] No users with role "chp" found. Already migrated.');
      return;
    }

    console.log(`[Migration 001] Found ${count} user(s) with role "chp". Migrating to "collector"...`);

    const result = await User.updateMany(
      { role: 'chp' },
      { $set: { role: 'collector' } }
    ).exec();

    console.log(`[Migration 001] Migrated ${result.modifiedCount} user(s) from "chp" to "collector".`);
  } catch (error) {
    console.error('[Migration 001] Error:', error);
    // Don't throw — migrations should not block server startup
  }
}
