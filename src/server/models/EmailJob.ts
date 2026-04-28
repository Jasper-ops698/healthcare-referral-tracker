/**
 * EmailJob Model — Persistent email queue with retry tracking
 *
 * Stores every email that needs to be sent, with status tracking.
 * A cron job picks up PENDING and FAILED emails and retries them.
 */

import mongoose, { Schema, Document } from 'mongoose';

export type EmailStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface IEmailJob {
  to: string;
  subject: string;
  html: string;
  text?: string;
  status: EmailStatus;
  retries: number;
  maxRetries: number;
  lastError?: string;
  messageId?: string;
  sentAt?: Date;
  scheduledFor?: Date;
  emailType: 'welcome' | 'password_reset' | 'notification' | 'report' | 'patient_registered' | 'referral_update';
  userId?: string;
  patientId?: string;
  relatedEntity?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEmailJobDocument extends IEmailJob, Document {}

const EmailJobSchema = new Schema<IEmailJobDocument>(
  {
    to: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    text: { type: String },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    retries: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 5 },
    lastError: { type: String },
    messageId: { type: String },
    sentAt: { type: Date },
    scheduledFor: { type: Date, index: true },
    emailType: {
      type: String,
      enum: ['welcome', 'password_reset', 'notification', 'report', 'patient_registered', 'referral_update'],
      default: 'notification',
    },
    userId: { type: String },
    patientId: { type: String },
    relatedEntity: { type: String },
  },
  {
    timestamps: true,
    collection: 'email_jobs',
  }
);

// Compound indexes for cron job queries
EmailJobSchema.index({ status: 1, scheduledFor: 1 });
EmailJobSchema.index({ status: 1, retries: 1, createdAt: 1 });

export default mongoose.model<IEmailJobDocument>('EmailJob', EmailJobSchema);
