# Firebase Security Specification (TDD) - TruckDispatch Pro

## 1. Data Invariants

1. **Strict Multi-Tenancy**: Users can only access documents belonging to their `companyId` / `adminId` unless they are `super_admin`s.
2. **Path-Based Ownership**: Loads under `/admins/{adminId}/loads/{loadId}` can only be read or modified by dispatchers/admins of that `adminId`, or the specific driver designated as `assignedDriverId`.
3. **Role Enforcement**: A user cannot modify their own `role` or `companyId` within their `/users/{userId}` document.
4. **Verified Status**: All writes require `request.auth.token.email_verified == true`.
5. **Load Progress Constraints**: A load's status cannot be skipped or downgraded after reaching `delivered` (terminal state locking) except by a super_admin or admin.
6. **Immutable Fields**: `createdAt`, `companyId`, and `loadNumber` are immutable once a load has been booked.

---

## 2. The "Dirty Dozen" Malicious Payloads (Negative Tests)

The following malicious payloads must be rejected by Firestore Security Rules:

1. **Spoofed Identity profile write**: User attempts to create a profile under `/users/attacker` with `role: "super_admin"`.
2. **Cross-Tenant Load read**: Dispatcher from `company_A` tries to read loads from `/admins/company_B/loads/load_1`.
3. **Driver Self-Privilege Escalation**: Driver `driver_123` attempts to write `role: "admin"` to `/users/driver_123`.
4. **Bypass Verification**: An unverified email user tries to create a load.
5. **Orphaned Load Creation**: Incomplete schema payload with missing required fields (`pickup`, `delivery`).
6. **Malicious ID injection**: Injecting a massive 1MB string as a Document ID to poison indices.
7. **Cross-Driver Chat Spying**: Driver `driver_A` tries to query or read communications from `/admins/admin_X/loads/load_B/communications/{messageId}` where they are not assigned.
8. **Malicious Gps Point Insertion**: Driver `driver_A` tries to write high-precision coordinate data with a huge description tag (> 2KB) or a spoofed user ID.
9. **Manual Invoice Forging**: User from `company_A` attempts to write a paid invoice under `/admins/company_B/invoices/inv_X`.
10. **Global Notification Spamming**: Non-super_admin trying to create a global notification under `/notifications/{notifId}`.
11. **Stripe Subscription Spoofing**: Carrier admin attempts to upgrade their `plan` to `Enterprise` directly in `/companies/{companyId}` without Stripe backend verification.
12. **Delivered Load Tampering**: Driver tries to reset the status of a `delivered` load back to `booked`.

---

## 3. The Security Test Suite: `firestore.rules.test.ts`

These tests are codified to verify that each of the "Dirty Dozen" malicious transactions are successfully blocked (`PERMISSION_DENIED`).

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";

// Security TDD Test Runner Verification rules
```
