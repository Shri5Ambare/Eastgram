# Security milestone status

Baseline: `0f1b8343b6af86b9659ec44111c8ce6d55653d8a`.

## Implemented in this change

- One post visibility predicate covers feed, user posts, reels, stories and direct post reads. School scoping is unconditional. Following and staff roles do not expand read audiences.
- Private posts are author-only: the schema comment mentions tagged users, but there is no tag relation to authorize them. Class posts require matching non-null classes; club posts require approved membership in an active same-school group. Expired stories and archived posts are not publicly readable.
- Comments, reply reads, reactions and view counters check their owning post's access. Reply parents must belong to the same post. Other-school staff cannot delete comments or modify posts.
- Post group association must refer to an active same-school group with approved author membership. Class/club audience prerequisites are checked on create and visibility changes.
- Admin user changes enforce administrator role and actor-school scope in the service. Assigned classes must belong to that school. Profile lookup is school-scoped.
- Refresh rotation uses a compare-and-set update plus replacement creation in one serializable transaction; inactive accounts are rejected and token ownership is checked. Transaction conflicts fail closed.
- Suspension/deactivation/pending status changes revoke outstanding refresh tokens. Account/permission/class changes disconnect current user sockets. New socket connections check ACTIVE status. Registration rejects foreign-school class IDs.

## Verification

- Locally passed: five dependency-free domain tests (`node --test test/post-policy.node.test.cjs`). They execute the actual query-builder policy against fixtures using a small evaluator; they do not validate Prisma SQL generation.
- Locally passed: syntax transpilation of 79 TypeScript source files and JavaScript syntax checks for the integration test/config. This is not a full typecheck or build.
- Dependency install blocked: offline cache lacks required Nest/Prisma dependencies; online npm registry requests were denied. Backend build and PostgreSQL tests could not run locally.
- GitHub CI passed at commit `f54d2321131107b76ac0f9e70c6ab4634380a540`: locked installation, Prisma generation, disposable PostgreSQL schema setup, backend build, five policy tests and eight integration tests. The real-database concurrent refresh test had exactly one winner. Evidence: https://github.com/Shri5Ambare/Eastgram/actions/runs/37328802956 . This does not establish HTTP/Flutter end-to-end or staging behavior.
- The existing dependency tree reported 82 advisories during installation (4 low, 23 moderate, 54 high, 1 critical). Detailed dependency audit, applicability assessment and compatible upgrades remain release work; avoid blind forced major upgrades.

## Run integration checks

Use a fresh disposable PostgreSQL database only. Install locked dependencies with `npm ci`, set `DATABASE_URL` and `TEST_DATABASE_URL` to that database, run `npx prisma generate`, then `npx prisma db push --skip-generate`, `npm run build`, and `npm test -- --runInBand`. The integration suite creates uniquely named school fixtures and removes those schools afterward. It skips without TEST_DATABASE_URL; skipped integration tests do not pass the release gate. Node 24 is used for the dependency-free TypeScript policy test.

## Gates still open

Backend build and real-database checks now pass. G0/G1 remain open for the client/staging baseline, remaining authorization audit and dependency assessment. This branch is not a production-release approval.

- Audit follows, groups, polls, events, achievements, media delivery, message attachments and registration approval policy. No claim of complete tenant isolation across these untouched modules.
- Media URLs are stored/returned as before; API audience checks alone do not make public R2 objects private. Protected media delivery needs its own implementation and tests.
- Verify realtime revocation in a running multi-instance deployment, including connection/suspension races, token expiry and membership changes. The connection ACTIVE check and administrative disconnect are improvements, not proof of complete ongoing session enforcement.
- Existing comment reply-deletion counter behavior, notification side-effect recovery, client refresh serialization, dependable client logout, and production Firebase setup need subsequent repairs.
- No Flutter visual redesign, staging deployment, pilot, data migration, or production deployment is included in this security change.

Next: resolve CI results and remaining access audit before moving to the shared Flutter design system and core-screen migration. Keep the existing EduGram identity until the final product name is decided.
