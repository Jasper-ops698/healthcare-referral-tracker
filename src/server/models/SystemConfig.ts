/**
 * SystemConfig Model — Global System Privacy & Data Settings
 *
 * Single-document collection (singleton pattern) storing:
 *   - dataRetentionDays: how long patient records are kept
 *   - autoBackupsEnabled: whether automatic backups run
 *   - auditLoggingEnabled: whether audit logging is active
 *   - lastBackupAt: timestamp of last successful backup
 *   - backupCount: total number of backups taken
 *
 * Only admins can read/update. Defaults are bootstrapped on server start.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISystemConfig extends Document {
  dataRetentionDays: number;
  autoBackupsEnabled: boolean;
  auditLoggingEnabled: boolean;
  lastBackupAt?: string;
  backupCount: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface ISystemConfigModel extends Model<ISystemConfig> {
  getSingleton(): Promise<ISystemConfig>;
  updateSingleton(updates: Partial<ISystemConfig>, userId?: string): Promise<ISystemConfig>;
}

const SystemConfigSchema = new Schema<ISystemConfig, ISystemConfigModel>(
  {
    dataRetentionDays: {
      type: Number,
      required: true,
      default: 365, // 1 year default
      min: 0,
      max: 3650, // ~10 years max
    },
    autoBackupsEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    auditLoggingEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    lastBackupAt: {
      type: String,
    },
    backupCount: {
      type: Number,
      default: 0,
    },
    updatedAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
    updatedBy: {
      type: String,
    },
  },
  {
    timestamps: false,
  }
);

// ─── Ensure only one document exists ───
SystemConfigSchema.index({ _id: 1 }, { unique: true });

// ─── STATIC METHODS ───

SystemConfigSchema.statics.getSingleton = async function (
  this: ISystemConfigModel
): Promise<ISystemConfig> {
  let config = await this.findOne().exec();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

SystemConfigSchema.statics.updateSingleton = async function (
  this: ISystemConfigModel,
  updates: Partial<ISystemConfig>,
  userId?: string
): Promise<ISystemConfig> {
  const config = await this.getSingleton();
  
  if (updates.dataRetentionDays !== undefined) {
    config.dataRetentionDays = updates.dataRetentionDays;
  }
  if (updates.autoBackupsEnabled !== undefined) {
    config.autoBackupsEnabled = updates.autoBackupsEnabled;
  }
  if (updates.auditLoggingEnabled !== undefined) {
    config.auditLoggingEnabled = updates.auditLoggingEnabled;
  }
  if (updates.lastBackupAt !== undefined) {
    config.lastBackupAt = updates.lastBackupAt;
  }
  if (updates.backupCount !== undefined) {
    config.backupCount = updates.backupCount;
  }
  
  config.updatedAt = new Date().toISOString();
  if (userId) config.updatedBy = userId;
  
  await config.save();
  return config;
};

const SystemConfig = mongoose.model<ISystemConfig, ISystemConfigModel>('SystemConfig', SystemConfigSchema);

export default SystemConfig;
