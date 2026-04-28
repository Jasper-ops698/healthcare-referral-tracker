export type UserRole = 'admin' | 'collector' | string;

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  assignedFacility?: string;

  // Extended profile (editable)
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
}

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
  registeredBy: string;
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
}

export interface FilterOptions {
  dateRange?: { from: Date; to: Date };
  status?: string[];
  facility?: string[];
  gender?: string[];
  ageRange?: { min: number; max: number };
  searchQuery?: string;
}
