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

/** Must stay in sync with backend UserRole in src/server/models/User.ts */
export type UserRole = 'admin' | 'collector' | 'doctor' | 'nurse' | 'lab_tech';
export type ChpStatus = 'active' | 'inactive' | 'suspended';

/**
 * Community Health Promoter — NOT a system user.
 * Managed by admin, assigned to patients by collectors.
 */
export interface Chp {
  id: string;
  chpId: string;
  fullName: string;
  email?: string;
  nationalId: string;
  phone: string;
  alternatePhone?: string;
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: string;
  village: string;
  subLocation: string;
  ward: string;
  county: string;
  languages: string[];
  yearsOfExperience: number;
  chpRegNumber?: string;
  supervisorName?: string;
  supervisorPhone?: string;
  facilityId?: string;
  facilityName?: string;
  status: ChpStatus;
  avatar?: string;
  createdAt: Date;
  /** Set when confirmed synced from backend */
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
  | 'rejected';

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
  fromFacility: string;
  toFacility: string;
  toDepartment?: string;
  reason: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  status: ReferralStatus;
  referredAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  notes?: string;
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
