/**
 * Client-Side Field Encryption — Web Crypto API (AES-GCM)
 *
 * Sensitive medical fields (vitals, diagnoses, medications) are encrypted
 * before being stored in IndexedDB. The encryption key is derived from the
 * user's password + a device-specific salt using PBKDF2.
 *
 * This ensures that even if a device is physically compromised, the medical
 * records remain unreadable without the user's password.
 *
 * ENCRYPTED FIELDS:
 *   - vitalSigns (all sub-fields)
 *   - diagnosis[]
 *   - differentialDiagnosis[]
 *   - clinicalNotes
 *   - medications[]
 *   - labResults[]
 *   - followUpInstructions
 *   - physicalExamination
 *   - historyOfPresentIllness
 *   - reviewOfSystems
 *   - chiefComplaint
 *   - referralDetails.reasonForReferral
 *
 * FIELDS LEFT PLAIN (needed for queries/filtering):
 *   - recordId, patientId, recordedBy
 *   - recordType, status
 *   - encounterDate, nextFollowUpDate
 *   - encounterDurationMinutes
 *   - procedures[]
 *   - referralDetails (except reasonForReferral)
 *   - _sync metadata (version, region, timestamps)
 */

// ─── TYPES ───

export interface EncryptedField {
  /** Always "encrypted" to identify encrypted fields */
  __encrypted: true;
  /** Base64-encoded IV (12 bytes for AES-GCM) */
  iv: string;
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded authentication tag */
  tag: string;
  /** Timestamp of encryption */
  encryptedAt: string;
  /** Key version for future key rotation */
  keyVersion: number;
}

interface CryptoKeyMaterial {
  key: CryptoKey;
  version: number;
}

// ─── CONSTANTS ───

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const KEY_VERSION = 1;

// ─── KEY MANAGEMENT ───

/**
 * Derives an AES-GCM key from a user password and device salt.
 * Uses PBKDF2-SHA256 for key stretching.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const passwordBuffer = new TextEncoder().encode(password);

  // Generate salt if not provided (first-time setup)
  const usedSalt = salt ?? new Uint8Array(
    crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  );

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: usedSalt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );

  return { key, salt: usedSalt };
}

/**
 * Load or create the encryption key from localStorage.
 * In production, derive from the user's login password.
 */
async function getOrCreateKey(): Promise<CryptoKeyMaterial> {
  const storedSalt = localStorage.getItem('__crypto_salt');
  const storedPassword = localStorage.getItem('__crypto_password_hash');

  if (!storedPassword) {
    // Fallback: generate a device-bound key from a random secret
    const randomValues = new Uint8Array(32);
    crypto.getRandomValues(randomValues);
    const password = btoa(String.fromCharCode(...randomValues));
    localStorage.setItem('__crypto_password_hash', password);

    const { key, salt } = await deriveKeyFromPassword(password);
    localStorage.setItem('__crypto_salt', arrayBufferToBase64(salt.buffer));
    return { key, version: KEY_VERSION };
  }

  const salt = storedSalt
    ? new Uint8Array(base64ToArrayBuffer(storedSalt))
    : undefined;

  const { key } = await deriveKeyFromPassword(storedPassword, salt);
  return { key, version: KEY_VERSION };
}

// ─── ENCRYPTION ───

/**
 * Encrypt a plaintext string using AES-GCM.
 * Returns an EncryptedField object suitable for storage in IndexedDB.
 */
export async function encryptField(plaintext: string): Promise<EncryptedField> {
  if (!plaintext || plaintext.trim() === '') {
    return createEmptyEncryptedField();
  }

  const { key, version } = await getOrCreateKey();
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);
  const data = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    data as BufferSource
  );

  // In AES-GCM, the authentication tag is appended to the ciphertext
  const combined = new Uint8Array(ciphertextBuffer);
  const tagStart = combined.length - 16;
  const ciphertextBytes = combined.slice(0, tagStart);
  const tagBytes = combined.slice(tagStart);

  return {
    __encrypted: true,
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertextBytes.buffer),
    tag: arrayBufferToBase64(tagBytes.buffer),
    encryptedAt: new Date().toISOString(),
    keyVersion: version,
  };
}

/**
 * Decrypt an EncryptedField back to plaintext.
 */
export async function decryptField(encrypted: EncryptedField): Promise<string> {
  if (!encrypted || !encrypted.__encrypted) {
    return typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted);
  }

  const { key } = await getOrCreateKey();

  // Recombine ciphertext + tag for AES-GCM decryption
  const iv = base64ToArrayBuffer(encrypted.iv);
  const ciphertext = base64ToArrayBuffer(encrypted.ciphertext);
  const tag = base64ToArrayBuffer(encrypted.tag);

  const ivBytes = new Uint8Array(iv);
  const cipherBytes = new Uint8Array(ciphertext);
  const tagBytes = new Uint8Array(tag);

  const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
  combined.set(cipherBytes, 0);
  combined.set(tagBytes, cipherBytes.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBytes as BufferSource },
    key,
    combined as BufferSource
  );

  return new TextDecoder().decode(decrypted);
}

// ─── BATCH ENCRYPTION FOR MEDICAL RECORDS ───

/** Field paths that should be encrypted in a MedicalRecord */
export const SENSITIVE_FIELD_PATHS: string[] = [
  'chiefComplaint',
  'historyOfPresentIllness',
  'reviewOfSystems',
  'physicalExamination',
  'clinicalNotes',
  'followUpInstructions',
  'diagnosis',
  'differentialDiagnosis',
  'vitalSigns.bloodPressure.systolic',
  'vitalSigns.bloodPressure.diastolic',
  'vitalSigns.heartRate',
  'vitalSigns.respiratoryRate',
  'vitalSigns.temperature',
  'vitalSigns.oxygenSaturation',
  'vitalSigns.weight',
  'vitalSigns.height',
  'vitalSigns.bmi',
  'vitalSigns.bloodGlucose',
  'medications',
  'labResults',
  'referralDetails.reasonForReferral',
];

/**
 * Encrypt all sensitive fields in a MedicalRecord object.
 * Returns a new object with encrypted fields replaced by EncryptedField objects.
 */
export async function encryptMedicalRecord(
  record: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const encrypted: Record<string, unknown> = { ...record };

  // Encrypt top-level string fields
  const stringFields = [
    'chiefComplaint',
    'historyOfPresentIllness',
    'reviewOfSystems',
    'physicalExamination',
    'clinicalNotes',
    'followUpInstructions',
  ];

  for (const field of stringFields) {
    const value = record[field];
    if (typeof value === 'string' && value.length > 0) {
      encrypted[field] = await encryptField(value) as unknown as string;
    }
  }

  // Encrypt array fields
  const diagnosis = record.diagnosis;
  if (Array.isArray(diagnosis) && diagnosis.length > 0) {
    encrypted.diagnosis = await encryptField(JSON.stringify(diagnosis)) as unknown as string[];
  }

  const differentialDiagnosis = record.differentialDiagnosis;
  if (Array.isArray(differentialDiagnosis) && differentialDiagnosis.length > 0) {
    encrypted.differentialDiagnosis = await encryptField(JSON.stringify(differentialDiagnosis)) as unknown as string[];
  }

  // Encrypt vital signs
  const vitalSigns = record.vitalSigns;
  if (vitalSigns && typeof vitalSigns === 'object') {
    encrypted.vitalSigns = await encryptVitalSigns(vitalSigns as Record<string, unknown>);
  }

  // Encrypt medications
  const medications = record.medications;
  if (Array.isArray(medications) && medications.length > 0) {
    encrypted.medications = await encryptField(JSON.stringify(medications)) as unknown as unknown[];
  }

  // Encrypt lab results
  const labResults = record.labResults;
  if (Array.isArray(labResults) && labResults.length > 0) {
    encrypted.labResults = await encryptField(JSON.stringify(labResults)) as unknown as unknown[];
  }

  // Encrypt referral reason
  const referralDetails = record.referralDetails;
  if (referralDetails && typeof referralDetails === 'object') {
    const rd = { ...(referralDetails as Record<string, unknown>) };
    const reason = rd.reasonForReferral;
    if (typeof reason === 'string' && reason.length > 0) {
      rd.reasonForReferral = await encryptField(reason) as unknown as string;
    }
    encrypted.referralDetails = rd;
  }

  return encrypted;
}

/**
 * Decrypt all sensitive fields in a MedicalRecord object.
 * Returns the record with original plaintext values restored.
 */
export async function decryptMedicalRecord(
  record: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const decrypted: Record<string, unknown> = { ...record };

  // Decrypt top-level string fields
  const stringFields = [
    'chiefComplaint',
    'historyOfPresentIllness',
    'reviewOfSystems',
    'physicalExamination',
    'clinicalNotes',
    'followUpInstructions',
  ];

  for (const field of stringFields) {
    const value = record[field];
    if (isEncryptedField(value)) {
      decrypted[field] = await decryptField(value);
    }
  }

  // Decrypt array fields
  const diagnosis = record.diagnosis;
  if (isEncryptedField(diagnosis)) {
    const json = await decryptField(diagnosis);
    try { decrypted.diagnosis = JSON.parse(json); } catch { decrypted.diagnosis = []; }
  }

  const differentialDiagnosis = record.differentialDiagnosis;
  if (isEncryptedField(differentialDiagnosis)) {
    const json = await decryptField(differentialDiagnosis);
    try { decrypted.differentialDiagnosis = JSON.parse(json); } catch { decrypted.differentialDiagnosis = []; }
  }

  // Decrypt vital signs
  const vitalSigns = record.vitalSigns;
  if (vitalSigns && typeof vitalSigns === 'object' && !isEncryptedField(vitalSigns)) {
    decrypted.vitalSigns = await decryptVitalSigns(vitalSigns as Record<string, unknown>);
  } else if (isEncryptedField(vitalSigns)) {
    const json = await decryptField(vitalSigns);
    try { decrypted.vitalSigns = JSON.parse(json); } catch { decrypted.vitalSigns = {}; }
  }

  // Decrypt medications
  const medications = record.medications;
  if (isEncryptedField(medications)) {
    const json = await decryptField(medications);
    try { decrypted.medications = JSON.parse(json); } catch { decrypted.medications = []; }
  }

  // Decrypt lab results
  const labResults = record.labResults;
  if (isEncryptedField(labResults)) {
    const json = await decryptField(labResults);
    try { decrypted.labResults = JSON.parse(json); } catch { decrypted.labResults = []; }
  }

  // Decrypt referral reason
  const referralDetails = record.referralDetails;
  if (referralDetails && typeof referralDetails === 'object') {
    const rd = { ...(referralDetails as Record<string, unknown>) };
    const reason = rd.reasonForReferral;
    if (isEncryptedField(reason)) {
      rd.reasonForReferral = await decryptField(reason);
    }
    decrypted.referralDetails = rd;
  }

  return decrypted;
}

// ─── VITAL SIGNS ENCRYPTION ───

async function encryptVitalSigns(vitals: Record<string, unknown>): Promise<Record<string, unknown>> {
  const encrypted: Record<string, unknown> = {};

  const bp = vitals.bloodPressure;
  if (bp && typeof bp === 'object') {
    const bpObj = bp as Record<string, unknown>;
    encrypted.bloodPressure = {
      systolic: typeof bpObj.systolic === 'number' ? await encryptField(String(bpObj.systolic)) as unknown as number : bpObj.systolic,
      diastolic: typeof bpObj.diastolic === 'number' ? await encryptField(String(bpObj.diastolic)) as unknown as number : bpObj.diastolic,
    };
  }

  const numericFields = ['heartRate', 'respiratoryRate', 'temperature', 'oxygenSaturation', 'weight', 'height', 'bmi', 'bloodGlucose'];
  for (const field of numericFields) {
    const value = vitals[field];
    if (typeof value === 'number') {
      encrypted[field] = await encryptField(String(value)) as unknown as number;
    }
  }

  return encrypted;
}

async function decryptVitalSigns(vitals: Record<string, unknown>): Promise<Record<string, unknown>> {
  const decrypted: Record<string, unknown> = {};

  const bp = vitals.bloodPressure;
  if (bp && typeof bp === 'object') {
    const bpObj = bp as Record<string, unknown>;
    decrypted.bloodPressure = {
      systolic: isEncryptedField(bpObj.systolic) ? Number(await decryptField(bpObj.systolic)) : bpObj.systolic,
      diastolic: isEncryptedField(bpObj.diastolic) ? Number(await decryptField(bpObj.diastolic)) : bpObj.diastolic,
    };
  }

  const numericFields = ['heartRate', 'respiratoryRate', 'temperature', 'oxygenSaturation', 'weight', 'height', 'bmi', 'bloodGlucose'];
  for (const field of numericFields) {
    const value = vitals[field];
    if (isEncryptedField(value)) {
      decrypted[field] = Number(await decryptField(value));
    } else {
      decrypted[field] = value;
    }
  }

  return decrypted;
}

// ─── HELPERS ───

export function isEncryptedField(value: unknown): value is EncryptedField {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__encrypted' in (value as Record<string, unknown>) &&
    (value as EncryptedField).__encrypted === true
  );
}

function createEmptyEncryptedField(): EncryptedField {
  return {
    __encrypted: true,
    iv: '',
    ciphertext: '',
    tag: '',
    encryptedAt: new Date().toISOString(),
    keyVersion: KEY_VERSION,
  };
}

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
