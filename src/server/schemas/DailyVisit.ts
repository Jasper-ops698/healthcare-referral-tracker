/**
 * DailyVisit Schema — Facility patient visit counts logged by collectors
 */

import mongoose from 'mongoose';

const DailyVisitSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  totalVisits: { type: Number, required: true, min: 0 },
  maleVisits: { type: Number, default: 0, min: 0 },
  femaleVisits: { type: Number, default: 0, min: 0 },
  childVisits: { type: Number, default: 0, min: 0 },
  notes: { type: String },

  stationId: { type: String, required: true },
  stationName: { type: String, required: true },
  collectorId: { type: String, required: true },
  collectorName: { type: String },
}, {
  timestamps: true,
});

// Compound index: one entry per collector per station per date
DailyVisitSchema.index({ collectorId: 1, stationId: 1, date: 1 }, { unique: true });
DailyVisitSchema.index({ stationId: 1, date: -1 });

export default mongoose.model('DailyVisit', DailyVisitSchema);
