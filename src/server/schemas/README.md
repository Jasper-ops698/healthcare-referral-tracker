# Sync Schema Architecture

## Overview

The MongoDB schema layer is designed around a single principle: **the server is the sole authority for version assignment**. Every entity document carries an embedded `_sync` metadata envelope, and every mutation is recorded as an append-only delta in the `ChangeRecord` collection. This design enables MedSyncManager to perform Version-Based Concurrency Control (VBCC) with zero ambiguity.

---

## Schema Inventory

| Schema | File | Purpose |
|--------|------|---------|
| `SyncMetadata` | `syncMetadata.ts` | Subdocument embedded in every entity. Carries version, checksum, provenance. |
| `Patient` | `Patient.ts` | Core patient entity with embedded `_sync`. |
| `Appointment` | `Appointment.ts` | Scheduling entity with embedded `_sync`. |
| `ChangeRecord` | `ChangeRecord.ts` | The delta log — append-only, immutable, idempotent. |

---

## How Deltas Are Validated

### 1. The Delta Lifecycle

```
┌──────────────┐     create change     ┌─────────────────┐
│   Client     │ ────────────────────▶ │  POST /sync/push│
│  (browser)   │   {                 │  body: {        │
│              │     changeId: UUID, │    clientVersion│
│              │     entityType,     │    changes[...] │
│              │     entityId,       │  }              │
│              │     version,        └─────────────────┘
│              │     checksum,                  │
│              │     payload                    ▼
│              │   }                   ┌─────────────────┐
└──────────────┘                       │  ChangeRecord   │
                                       │  .insertBatch() │
                                       └─────────────────┘
```

### 2. The Three Validation Gates

Every delta that arrives at the server must pass **three sequential validation gates** before it is accepted:

#### Gate 1: Checksum Integrity (Data Corruption)

The client computes a SHA-256 checksum of the payload and sends it in the `checksum` field. The server recomputes the checksum from the received payload and compares:

```typescript
const serverHash = sha256(JSON.stringify(payload));
if (serverHash !== change.checksum) {
  // REJECT: Payload was corrupted in transit (network error, proxy, etc.)
  throw new CorruptPayloadError(change.changeId);
}
```

**Why it matters:** In healthcare, a corrupted payload could mean a mutated allergy list, a wrong blood type, or a scrambled medication dosage. The checksum catches this at the network boundary.

#### Gate 2: Idempotency (Duplicate Detection)

The `changeId` is a **client-generated UUID** (not server-assigned). The `ChangeRecord` schema enforces a unique index on `changeId`:

```typescript
ChangeRecordSchema.index({ changeId: 1 }, { unique: true })
```

When a batch arrives, the server checks each `changeId` against this index:

```typescript
const exists = await ChangeRecord.isDuplicate(change.changeId);
if (exists) {
  // SKIP: Already processed — idempotent no-op
  result.duplicates++;
  continue;
}
```

**Why it matters:** Network retries are inevitable. If a client's push times out, it will retry. Without idempotency, the same patient registration could be duplicated 3 times. With `changeId`, the retry is a free no-op.

#### Gate 3: Version Concurrency (Conflict Detection)

This is the heart of VBCC. The server maintains a **global monotonic version counter** across all changes. When a batch arrives, the server checks two conditions:

```typescript
// Condition A: The client's view of the server must match reality
if (clientVersion < currentServerVersion) {
  // Client is behind — some changes exist they haven't seen
  // Enter conflict resolution (HTTP 409)
}

// Condition B: The change must be based on current entity state
if (change.previousVersion !== entityCurrentVersion) {
  // Client edited stale data — their base is outdated
  // Enter conflict resolution (HTTP 409)
}
```

If both pass, the server assigns the next version number atomically:

```typescript
// Atomic compare-and-swap via findOneAndUpdate
const result = await Patient.applyIfVersionMatches(
  patientId,
  expectedVersion,   // ← what the client thinks the version is
  updates,
  deviceId
);
// result is null if version didn't match → 409
```

**Why it matters:** Two CHPs in different villages could both edit the same patient's record. Without VBCC, the last write silently overwrites the first. With VBCC, the second write is detected as a conflict and the three-way merge produces a combined result.

---

## The `_sync` Envelope

Every entity document (Patient, Appointment, etc.) contains this subdocument:

```json
{
  "_sync": {
    "version": 7,
    "modifiedAt": "2024-01-15T09:23:17.000Z",
    "modifiedBy": "device_chp_kitui_001",
    "checksum": "a3f5c2...",
    "isDeleted": false,
    "createdAt": "2024-01-10T14:00:00.000Z",
    "createdBy": "device_admin_nairobi"
  }
}
```

| Field | Purpose | Immutable? |
|-------|---------|------------|
| `version` | Monotonic counter — incremented on every mutation | No |
| `modifiedAt` | Last mutation timestamp | No |
| `modifiedBy` | Device that last modified this document | No |
| `checksum` | SHA-256 of the document payload (integrity) | No |
| `isDeleted` | Soft-delete tombstone (for sync propagation) | No |
| `createdAt` | Original creation timestamp | **Yes** |
| `createdBy` | Device that created this document | **Yes** |

### Pre-Save Hook: Auto-Versioning

```typescript
PatientSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this._sync.version += 1;                    // ← Bump version
    this._sync.modifiedAt = new Date().toISOString();
  }
  // Recompute checksum from sorted keys for stability
  this._sync.checksum = sha256(sortedJson(this));
  next();
});
```

The `version` field is **never** set by the client — only by this server-side pre-save hook. This prevents a malicious or buggy client from forging version numbers.

---

## The ChangeRecord Delta Log

The `ChangeRecord` collection is the **single source of truth** for all mutations. It has three critical properties:

### Property 1: Append-Only

Change records are never updated or deleted. They form an immutable audit trail:

```typescript
// The schema marks changeId as immutable
changeId: { type: String, immutable: true }
```

### Property 2: Monotonic Versions

The `version` field in each ChangeRecord is assigned sequentially by the server during `insertBatch`:

```typescript
let nextVersion = Math.max(baseVersion, currentVersion);
for (const change of changes) {
  nextVersion += 1;
  change.version = nextVersion;  // ← Server assigns, not client
  await change.save();
}
```

This means the ChangeRecord collection is a **totally ordered log** — every mutation in the entire system has a unique, comparable version number.

### Property 3: Self-Describing

Each ChangeRecord contains enough information to reconstruct the entity state at any point in time:

```json
{
  "changeId": "uuid-abc-123",
  "entityType": "patient",
  "entityId": "ObjectId(65a...)",
  "operation": "update",
  "version": 42,
  "previousVersion": 41,
  "checksum": "sha256...",
  "payload": { "bloodType": "O+", "allergies": ["Penicillin"] },
  "deviceId": "device_chp_kitui_001",
  "serverTimestamp": "2024-01-15T09:23:17.000Z"
}
```

The `previousVersion` field links each change to its predecessor, forming a chain. The `payload` contains the actual delta (for updates, only changed fields).

---

## Conflict Resolution Flow

When a version mismatch is detected, the server constructs a detailed conflict report:

```
Client sends:  push(clientVersion=5, changes=[...])
Server state:  currentVersion=7

Result: HTTP 409 Conflict
Body: {
  serverVersion: 7,
  conflicts: [
    {
      changeId: "uuid-abc-123",
      entityType: "patient",
      entityId: "65a...",
      serverVersion: 7,
      clientVersion: 5,
      serverPayload: { /* current document */ },
      clientPayload: { /* what client tried to write */ }
    }
  ]
}
```

The client (MedSyncManager) then performs a **three-way merge**:

```
Base (v5):    { name: "John", bloodType: "A+", allergies: [] }
Ours (v5→6): { name: "John", bloodType: "O+", allergies: ["Penicillin"] }
Theirs (v7):  { name: "Johnny", bloodType: "A+", allergies: ["Dust"] }

Merged:       { name: "Johnny",  bloodType: "O+",  allergies: ["Penicillin"] }
              ↑ theirs wins    ↑ ours wins    ↑ ours wins (different fields)
```

The merge strategy is:
- **Same field, both changed to different values** → server wins (healthcare safety)
- **Same field, both changed to same value** → accept (agreement)
- **Different fields changed** → combine both (no conflict)
- **Only one side changed** → accept the change (no conflict)

---

## Pull Endpoint Behavior

When a client calls `pullRemoteChanges()`, the server queries the ChangeRecord log (NOT the entity collection):

```typescript
// Server side
const deltas = await ChangeRecord.getDeltasSince(clientVersion, {
  limit: 50,
  entityTypes: ['patient', 'appointment']
});
// Returns changes where version > clientVersion, sorted by version asc
```

**Why query the log instead of the entities?**

Consider this scenario:

```
T0: Patient P has version 5
T1: CHP-A edits P → version 6 (change C1 recorded)
T2: CHP-B edits P → version 7 (change C2 recorded)
T3: Client (at version 5) calls pull()
```

If the server queried the Patient collection, it would only see version 7 — change C1 (version 6) would be **invisible**. By querying the ChangeRecord log, the server returns both C1 and C2 in version order. The client applies them sequentially and ends up in the same state as the server.

---

## Data Integrity Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| No lost updates | VBCC: version check on every write |
| No duplicate changes | Idempotency: unique `changeId` index |
| No corrupted payloads | Checksum: SHA-256 verification |
| Total ordering | Monotonic version counter |
| Causal consistency | Deltas applied in version order |
| Audit trail | Immutable ChangeRecord log |
| Soft-delete propagation | `isDeleted` tombstone flag |

---

## MongoDB Deployment Notes

### Required Indexes

The schema creates the following indexes automatically. Ensure these exist in production:

```javascript
db.changerecords.createIndex({ changeId: 1 }, { unique: true });
db.changerecords.createIndex({ version: 1 });
db.changerecords.createIndex({ entityType: 1, version: 1 });
db.changerecords.createIndex({ entityType: 1, entityId: 1, version: 1 });

db.patients.createIndex({ patientId: 1 }, { unique: true });
db.patients.createIndex({ "_sync.version": 1 });
db.patients.createIndex({ registeredBy: 1, "_sync.version": 1 });

db.appointments.createIndex({ appointmentId: 1 }, { unique: true });
db.appointments.createIndex({ "_sync.version": 1 });
db.appointments.createIndex({ providerId: 1, scheduledAt: 1 });
```

### Replica Set Considerations

For multi-region deployments, the ChangeRecord log should be **capped or TTL-indexed** on a secondary to prevent unbounded growth:

```javascript
// Optional: TTL index to auto-archive old changes after 7 years
// (healthcare retention requirement)
db.changerecords.createIndex(
  { serverTimestamp: 1 },
  { expireAfterSeconds: 220752000 }  // 7 years
);
```

The `disseminated` flag enables a background job to archive changes that have been synced to all known devices, keeping the hot set small.

---

## Extension Points

To add a new sync-aware entity (e.g., `Referral`):

1. Create the entity schema with `import { SyncMetadataSchema } from './syncMetadata'`.
2. Add `_sync: { type: SyncMetadataSchema, required: true, default: ... }`.
3. Add the pre-save hook for auto-versioning.
4. Add static methods `findSinceVersion` and `applyIfVersionMatches`.
5. Add the entity type to `SyncEntityType` enum in `ChangeRecord.ts`.
6. The MedSyncManager on the client will automatically sync it.
