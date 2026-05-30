/**
 * HealthTrack Frontend Types
 *
 * Synchronized with backend MongoDB schemas:
 *   - User      → src/server/models/User.ts
 *   - Patient   → src/server/schemas/Patient.ts
 *   - MedicalRecord → src/server/schemas (implied)
 *
 * RULE: When adding a field to the backend schema, add it here
 *       and to the Dexie schema in src/lib/dexieDatabase.ts
 */

// ═══════════════════════════════════════════════════════════════════════════
// USER
// ═══════════════════════════════════════════════════════════════════════════

/** Simplified: admin manages the system, collectors work in the field */
export type UserRole = 'admin' | 'collector';
export type ChpStatus = 'active' | 'inactive' | 'suspended';

/**
 * Community Health Promoter — NOT a system user. No login account.
 * Collectors assign CHP name + contact to patient referrals.
 * CHPs receive follow-up emails via the counter-referral workflow.
 */
export interface Chp {
  id: string;
  /** Auto-generated: CHP-0001, CHP-0002, etc. */
  chpId?: string;
  fullName: string;
  phone?: string;
  email?: string;
  /** @deprecated Use Station model instead. Kept for backward compat. */
  nationalId?: string;
  /** @deprecated Use Station model instead. Kept for backward compat. */
  county?: string;
  /** @deprecated Use Station model instead. Kept for backward compat. */
  subLocation?: string;
  /** @deprecated Use Station model instead. Kept for backward compat. */
  ward?: string;
  village?: string;
  facilityId?: string;
  /** @deprecated Use Station model instead. Kept for backward compat. */
  facilityName?: string;
  /** @deprecated Kept for backward compat. */
  supervisorName?: string;
  /** @deprecated Kept for backward compat. */
  supervisorPhone?: string;
  /** @deprecated Kept for backward compat. */
  languages?: string[];
  status: ChpStatus;
  createdAt: Date;
  lastSyncedAt?: Date;
}

/** Must stay in sync with backend UserStatus */
export type UserStatus = 'active' | 'inactive' | 'suspended';

/** User preferences — stored as embedded doc on backend */
export interface UserPreferences {
  language: 'en' | 'sw';
  notifications: boolean;
  theme: 'light' | 'dark';
  timezone: string;
  autoLogout: number; // minutes
}

/**
 * Full User interface — mirrors backend IUser (src/server/models/User.ts)
 *
 * BACKEND FIELDS NOT NEEDED ON FRONTEND:
 *   - password          (never sent to client)
 *   - passwordChangedAt (backend tracking only)
 *   - passwordResetToken (backend only)
 *   - passwordResetExpires (backend only)
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: UserRole;

  /** 'active' | 'inactive' | 'suspended'  — replaces old boolean isActive */
  status: UserStatus;

  /** Region for sync gating (e.g. 'global', 'Mombasa', 'Nairobi') */
  region: string;

  /** Facility assignment — stored as facilityId (ObjectId) on backend */
  assignedFacility?: string;

  /** Station assignment — where this collector works (Household, HIP, or Referral Center) */
  stationId?: string;
  stationName?: string;
  stationType?: 'household' | 'hip' | 'referral-center';

  /** Whether the user must change password on next login */
  forcePasswordChange?: boolean;

  /** User preferences (language, theme, notifications, etc.) */
  preferences?: UserPreferences;

  // ── Profile (editable) ──
  avatar?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  nationalId?: string;
  emergencyContact?: { name: string; relationship: string; phone: string };
  languages?: string[];
  homeCounty?: string;
  bloodGroup?: string;
  physicalAddress?: string;
  nextOfKin?: { name: string; relationship: string; phone: string };
  bio?: string;

  // ── Timestamps ──
  createdAt: Date;
  lastLogin?: Date;

  /** When this record was last confirmed synced from the backend */
  lastSyncedAt?: Date;

  /** LEGACY: kept for backward compat with local components; derived from status */
  isActive?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT
// ═══════════════════════════════════════════════════════════════════════════

export interface Patient {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: 'male' | 'female' | 'other';
  phone: string;
  email?: string;
  address: Address;
  emergencyContact?: EmergencyContact;
  bloodType?: string;
  allergies?: string[];
  chronicConditions?: string[];
  insuranceInfo?: InsuranceInfo;

  /** Mongo ObjectId (string) of the user who registered this patient */
  registeredBy: string;

  /** Mongo ObjectId (string) of CHP assigned to accompany patient */
  assignedChpId?: string;
  assignedChpName?: string;

  // ── Cross-facility tracking ──
  /** Where the patient currently is (facility) — updated on referral acceptance */
  currentFacilityId?: string;
  currentFacilityName?: string;
  /** Which collector currently has the patient — updated on referral acceptance */
  currentCollectorId?: string;
  currentCollectorName?: string;

  /** Stages of the patient's referral journey */
  referralStages: ReferralStage[];

  registrationDate: Date;
  lastUpdated: Date;
  status: 'active' | 'inactive' | 'deceased';
  referralStatus: ReferralStatus;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface InsuranceInfo {
  provider: string;
  policyNumber: string;
  groupNumber?: string;
}

export type ReferralStatus =
  | 'registered'
  | 'screened'
  | 'referred'
  | 'accepted'
  | 'in-treatment'
  | 'completed'
  | 'rejected'
  | 'pending';

/** A single stage in a patient's referral journey between facilities */
export interface ReferralStage {
  stage: number;
  fromFacility: string;
  toFacility: string;
  status: 'pending' | 'in-progress' | 'completed' | 'rejected';
  date: Date;
  notes?: string;
  chpName?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATION — Where collectors work
// ═══════════════════════════════════════════════════════════════════════════

export interface Station {
  id: string;
  name: string;
  type: 'household' | 'hip' | 'referral-center';
  code: string;
  county: string;
  subCounty?: string;
  ward?: string;
  description?: string;
  isActive: boolean;
  parentStationId?: string;
  contactPhone?: string;
  contactEmail?: string;
  operatingHours?: string;
  services: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL V2 — Pure referral tracking (core of the system)
// ═══════════════════════════════════════════════════════════════════════════

/** Pure referral — the core of the system.
 *  Created when a collector refers a patient from one station to another.
 *  Updated through the entire journey: pending → accepted → in-treatment → counter-referral-created → completed
 */
export interface ReferralV2 {
  id: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: 'male' | 'female' | 'other';
  patientPhone: string;
  village?: string;

  sourceStationId: string;
  sourceStationName: string;
  sourceStationType: 'household' | 'hip' | 'referral-center';
  sourceCollectorId: string;
  sourceCollectorName: string;

  destinationStationId: string;
  destinationStationName: string;
  destinationStationType: 'household' | 'hip' | 'referral-center';

  chpName?: string;
  chpPhone?: string;
  chpEmail?: string;

  initialDiagnosis: string;
  aiSuggestedCategory?: string;
  aiConfidence?: number;
  reasonForReferral: string;

  modeOfTransport: 'ambulance' | 'matatu' | 'private-vehicle' | 'walking' | 'wheelchair' | 'stretcher' | 'other';
  transportNotes?: string;

  status: 'pending' | 'in-transit' | 'accepted' | 'in-treatment' | 'counter-referral-created' | 'completed' | 'rejected';
  counterReferralId?: string;

  // Referral chain (Phase C)
  referralType?: 'initial' | 'follow-up';
  previousReferralId?: string;
  chpAlertId?: string;

  urgency: 'routine' | 'urgent' | 'emergency';

  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  rejectedReason?: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNTER-REFERRAL — Created when patient arrives at destination
// ═══════════════════════════════════════════════════════════════════════════

export type RecoveryStatus = 'fully-recovered' | 'partially-recovered' | 'still-unwell' | 'deceased' | 'lost-to-follow-up';

export interface CounterReferral {
  id: string;
  referralId: string;
  patientId: string;
  patientName: string;

  stationId: string;
  stationName: string;
  collectorId: string;
  collectorName: string;

  finalDiagnosis: string;
  treatmentProvided: string;
  medicationsGiven?: string;
  proceduresDone?: string;

  recoveryStatus: RecoveryStatus;
  recoveryNotes?: string;

  nextVisitDate?: Date;
  followUpInstructions: string;
  warningSigns?: string;

  chpName: string;
  chpPhone?: string;
  chpEmail?: string;

  chpEmailSent: boolean;
  chpEmailSentAt?: Date;
  chpEmailStatus?: 'pending' | 'sent' | 'failed' | 'bounced';
  chpResponseToken?: string;
  chpResponseReceived: boolean;
  chpResponseDate?: Date;
  chpResponseNotes?: string;
  chpResponseRecoveryStatus?: RecoveryStatus;

  status: 'active' | 'closed' | 'escalated';

  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICAL RECORD
// ═══════════════════════════════════════════════════════════════════════════

export interface MedicalRecord {
  id: string;
  patientId: string;
  recordedBy: string;
  recordedAt: Date;
  visitType: 'routine' | 'emergency' | 'follow-up' | 'referral';

  // Vital Signs
  vitalSigns: VitalSigns;

  // Symptoms & Complaints
  chiefComplaint: string;
  symptoms: string[];
  symptomDuration?: string;
  painLevel?: number;

  // Examination
  physicalExamination?: PhysicalExamination;

  // Diagnosis
  preliminaryDiagnosis?: string;
  icd10Code?: string;

  // Tests & Results
  testsOrdered?: TestOrder[];
  testResults?: TestResult[];

  // Treatment
  medications?: Medication[];
  procedures?: string[];
  referrals?: Referral[];

  // Notes
  clinicalNotes?: string;
  followUpInstructions?: string;

  // Attachments
  attachments?: Attachment[];
}

export interface VitalSigns {
  temperature?: number;
  temperatureUnit: 'celsius' | 'fahrenheit';
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  weightUnit: 'kg' | 'lbs';
  height?: number;
  heightUnit: 'cm' | 'ft';
  bmi?: number;
  recordedAt: Date;
}

export interface PhysicalExamination {
  generalAppearance?: string;
  skin?: string;
  headNeck?: string;
  cardiovascular?: string;
  respiratory?: string;
  abdominal?: string;
  musculoskeletal?: string;
  neurological?: string;
  otherFindings?: string;
}

export interface TestOrder {
  id: string;
  testName: string;
  testCategory: string;
  urgency: 'routine' | 'urgent' | 'stat';
  orderedAt: Date;
  status: 'ordered' | 'in-progress' | 'completed' | 'cancelled';
}

export interface TestResult {
  testOrderId: string;
  result: string;
  value?: number;
  unit?: string;
  referenceRange?: string;
  isAbnormal: boolean;
  notes?: string;
  completedAt: Date;
  completedBy?: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: 'oral' | 'iv' | 'im' | 'sc' | 'topical' | 'inhalation';
  instructions?: string;
  prescribedAt: Date;
}

export interface Referral {
  id: string;
  /** @deprecated Use fromFacilityId/fromFacilityName instead. */
  fromFacility?: string;
  /** @deprecated Use toFacilityId/toFacilityName instead. */
  toFacility?: string;
  toDepartment?: string;
  reason: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  status: ReferralStatus;
  /** @deprecated Use createdAt instead. */
  referredAt?: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  notes?: string;
  // Fields used by mapReferralFromBackend — kept for backward compat
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  patientIdNumber?: string;
  fromFacilityId?: string;
  fromFacilityName?: string;
  fromCollectorId?: string;
  fromCollectorName?: string;
  toFacilityId?: string;
  toFacilityName?: string;
  toCollectorId?: string;
  toCollectorName?: string;
  chpId?: string;
  chpName?: string;
  medicalRecordId?: string;
  createdAt?: Date;
  rejectedAt?: Date;
  rejectedReason?: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy: string;
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACILITY
// ═══════════════════════════════════════════════════════════════════════════

export interface Facility {
  id: string;
  name: string;
  type: 'clinic' | 'hospital' | 'health-center' | 'referral-hospital';
  address: Address;
  phone: string;
  email?: string;
  departments: string[];
  services: string[];
  isActive: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD / ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface DashboardKPIs {
  totalPatients: number;
  newPatientsToday: number;
  newPatientsThisWeek: number;
  newPatientsThisMonth: number;
  activeReferrals: number;
  pendingReferrals: number;
  completedReferrals: number;
  rejectedReferrals: number;
  pendingScreenings: number;
  avgWaitTimeDays: number;
  rejectionRate: number;
  patientsByGender: { male: number; female: number; other: number };
  patientsByAgeGroup: { [key: string]: number };
  referralsByStatus: { [key in ReferralStatus]: number };
  referralsByMonth: { month: string; count: number }[];
  topConditions: { condition: string; count: number }[];
  recentActivity: ActivityLog[];
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: 'patient' | 'medical-record' | 'referral' | 'user';
  entityId: string;
  description: string;
  timestamp: Date;
}

export interface CollectorStats {
  patientsRegistered: number;
  recordsEntered: number;
  referralsMade: number;
  pendingTasks: number;
  recentPatients: Patient[];
  monthlyActivity: { month: string; patients: number; records: number }[];
  taskBreakdown: {
    needsScreening: number;    // status = registered → need first medical record
    needsReferral: number;     // status = screened → need to decide if refer
    waitingOnAdmin: number;    // status = referred or accepted → admin's turn
    inTreatment: number;       // status = in-treatment
    completed: number;         // status = completed
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER / SEARCH
// ═══════════════════════════════════════════════════════════════════════════

export interface FilterOptions {
  dateRange?: { from: Date; to: Date };
  status?: string[];
  facility?: string[];
  gender?: string[];
  ageRange?: { min: number; max: number };
  searchQuery?: string;
}
