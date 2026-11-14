# MARS//PATH Firestore Security Specification

## 1. Security Invariants
- **Default Deny Catch-All**: Any path outside `/users/{userId}` and its explicit subcollections (`routePlans`, `targetBookmarks`) is denied for all reads and writes.
- **Verified Identity**: All allowed reads/writes require `request.auth != null && request.auth.token.email_verified == true`.
- **Strict Ownership & PII Isolation**: `/users/{userId}`, `/users/{userId}/routePlans/{planId}`, and `/users/{userId}/targetBookmarks/{bookmarkId}` allow `get`, `list`, `create`, `update`, and `delete` ONLY when `request.auth.uid == userId`. Cross-user access is strictly forbidden.
- **Bounded Lists**: `allow list` on `routePlans` and `targetBookmarks` requires `request.query.limit != null && request.query.limit <= 100`.
- **Schema & Type Integrity**:
  - `create` enforces `hasAll` and `hasOnly` exact key whitelists, regex-validated document IDs (`^[a-zA-Z0-9_-]{1,128}$`), and `request.resource.data.createdAt == request.time && request.resource.data.updatedAt == request.time`.
  - `update` enforces `diff(resource.data).affectedKeys().hasOnly(...)`, preserves immutable `uid`/`ownerUid`/`id`/`createdAt`, and enforces `updatedAt == request.time`.
  - Numeric bounds enforce valid longitude `[-180, 180]`, latitude `[-90, 90]`, slope `[5, 45]` / `[0, 90]`, and non-negative finite distances `<= 500000`.
  - String fields have bounded `.size()` caps (`name <= 120`, `note <= 1000`, `email <= 160`).

## 2. Adversarial "Dirty Dozen" Payloads (Must All Be REJECTED)
1. **Unauthenticated read on `/users/{uid}`** -> REJECTED (`request.auth == null`).
2. **Unverified email token trying to write `/users/{uid}`** -> REJECTED (`email_verified == false`).
3. **Cross-user read/write (`auth.uid == "userB"` accessing `/users/userA/routePlans/plan1`)** -> REJECTED (`uid != userId`).
4. **Privilege escalation / extra undocumented key (`isAdmin: true` on UserProfile)** -> REJECTED (`hasOnly` check fails).
5. **UID spoofing on create (`ownerUid: "victim"` inside `/users/attacker/routePlans/p1`)** -> REJECTED (`ownerUid == userId` check fails).
6. **Mutating immutable `createdAt` or `ownerUid` on update** -> REJECTED (`affectedKeys().hasOnly(...)` rejects).
7. **Client-forged backdated timestamp (`updatedAt: timestamp.date(2020, 1, 1)`)** -> REJECTED (`updatedAt == request.time` check fails).
8. **Out-of-bounds coordinates (`startLon: 999` or `startLat: -200`)** -> REJECTED (`isFiniteCoord` fails).
9. **Negative or absurd route distance (`distanceM: -5` or `distanceM: 999999999`)** -> REJECTED.
10. **Oversized field note (`note.size() > 1000` attempting storage bloat)** -> REJECTED.
11. **Unbounded collection list without limit (`getDocs(collection(db, "users", uid, "routePlans"))`)** -> REJECTED (`request.query.limit <= 100`).
12. **Arbitrary unknown collection write (`/publicSecrets/doc1`)** -> REJECTED by default-deny catch-all.
