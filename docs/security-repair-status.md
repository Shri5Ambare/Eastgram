# Security and reliability repair status

Baseline: `0f1b8343b6af86b9659ec44111c8ce6d55653d8a`.
Draft pull request: https://github.com/Shri5Ambare/Eastgram/pull/1

## Implemented

- Single-school deployment: removed `/schools` listing/creation and arbitrary-school class routes and removed the school-creation DTO. `/school` returns this school; `/school/classes` lists and manages only its classes. Registration accepts no school ID, and Flutter no longer submits one. Startup selects the sole school or validates `APP_SCHOOL_ID`; login, refresh, JWT guards and realtime enforce it. Existing data is preserved. Admin and Principal roles still manage this school.

- A shared post audience predicate scopes feed, profiles, reels, stories and direct reads. Other-school users, following relations and staff roles cannot enlarge read audiences. Private posts are author-only because no tagged-user relation exists.
- Comments, reactions, replies and view counters enforce the owning post audience. Reply parents belong to the same post. Comment deletion recounts all remaining comments after nested replies cascade, with serializable conflict retries.
- Administrator updates enforce role, school and class scope. Inactive status changes revoke refresh tokens; administrative account changes disconnect sockets.
- Token refresh rotates once using a compare-and-set operation and replacement issuance in one serializable transaction. Inactive accounts cannot refresh. Registration assigns STUDENT/PENDING and rejects foreign-school classes.
- Group detail/join/leave/member lists and management enforce actor-school scope. Unapproved moderators cannot manage a group. Member approval and listing filter foreign-school users.
- Events and polls enforce school and approved membership in an active club on reads, participation and result/attendee endpoints. Management does not cross schools. Polls attached to posts inherit their post audience.
- Poll vote categories come from the poll/candidate, preventing repeat votes through arbitrary client categories. Concurrent duplicates return a controlled 400 without incrementing counts. Unsupported multiple-selection settings are rejected explicitly. Lists now include options, candidates and the viewer's votes.
- Follows reject other-school targets and filter legacy cross-school relations. Achievement awards require school staff and same-school recipients. The achievement catalog remains global, as defined by the existing schema.
- Message reads/sends/read receipts require current conversation access. Every member must belong to the same school; club conversations require approved membership. Attachments belong to the sender, and reply targets belong to the same conversation. Inactive recipients cannot start a new direct conversation.
- Realtime message delivery checks current account status and approved club membership and sends through user rooms. Stale conversation rooms grant no audience. Socket handshakes require expiry; sockets disconnect when the access token expires and recheck activity after joining.
- Upload confirmation verifies the caller's key prefix, signed object ownership metadata, actual object size/type and object existence. Confirmation is idempotent. Post responses use signed five-minute read URLs, and `GET /media/:id/access` verifies owner/post/message access before issuing a replacement URL. Moderation does not expose private media. Unverified thumbnail URLs are omitted.
- Flutter serializes concurrent refresh, retries requests once, preserves credentials on offline refresh failure, and reconnects sockets after rotation. Logout blocks in-flight refresh from restoring credentials, disconnects chat and guarantees local cleanup. Push setup failures do not invalidate login or prevent app startup. Feed and chat provider caches belong to the signed-in account and are discarded on logout/account change; late disposed-provider requests cannot notify removed screens.

## Verification evidence

- Initial CI: backend build, five dependency-free policy tests and eight PostgreSQL integration tests passed.
- Community access repairs: backend build, five policy tests and fifteen PostgreSQL tests passed.
- Chat/media/socket repairs: backend build, five policy tests and twenty-two Jest tests (nineteen PostgreSQL cases and three socket-session cases) passed at `b4e53eb871e509fce0099b15c7f92a125ca50f41`: https://github.com/Shri5Ambare/Eastgram/actions/runs/37332800855 .
- Compatible lockfile repair used no forced upgrades. Its installation, build and regression suite passed: https://github.com/Shri5Ambare/Eastgram/actions/runs/37331605772 . Advisories fell from 82 (including one critical) to 65: 0 critical, 42 high, 19 moderate, 4 low. The production-only audit reports 21 advisories (0 critical, 6 high, 14 moderate, 1 low). Many remaining advisories require framework/toolchain major upgrades or targeted transitive dependency assessment.
- Final code revision `361f501fd2781c084a1e147484c3ee9577860d68` passed backend installation/build, five policy tests and twenty-three Jest tests (twenty PostgreSQL cases plus three socket cases): https://github.com/Shri5Ambare/Eastgram/actions/runs/37334729137 .
- The same revision passed full Flutter analysis with no errors/warnings, nine client/session/widget tests and a release web build using Flutter 3.47.6 / Dart 3.13.5: https://github.com/Shri5Ambare/Eastgram/actions/runs/37334729116 . Informational style hints remain. The account-switch widget test verifies fresh feed/chat provider instances after logout and a new login.
- Single-school and reviewed dependency migration passed at code revision `3c2cc1a629a39f7fea38a7b4fd53560c5e4ab4ce`: installation, build, five policy tests and 33 Jest tests (including compiled HTTP boot, removed school routes, server-assigned registration, foreign-account denial and school configuration checks): https://github.com/Shri5Ambare/Eastgram/actions/runs/37412492027 . The tested lockfile is committed at `ae94bf5b4542f4fa8ec464115b7ca3e8a0d5e7cf`. Nest 12.1.2, Firebase Admin 14.5.0, Jest 30.5.2 and TypeScript 6.0.3 are resolved; Docker now uses Node 24. The complete dependency audit now reports 28 advisories (0 critical, 8 high, 20 moderate); the earlier 65/21 figures above describe the previous lockfile.
- R2 signing/metadata tests use a stubbed object-store response and local signature generation, not a live R2 bucket. PostgreSQL tests use an isolated disposable service, never production. Compiled HTTP smoke checks now run against disposable PostgreSQL/Redis. Live R2, devices and staging remain unverified.

## Release gates still open

This branch is a reviewable repair milestone, not production-release approval.

1. Verify that R2 public development URLs and public custom domains are disabled for protected objects. Previously public URLs cannot be made private by API code alone. Signed URLs remain usable for up to five minutes after authorization changes. Verify R2 metadata/CORS behavior and object-size limits live; inspect legacy records and plan thumbnail handling/upload cleanup.
2. Resolve the remaining dependency advisories with explicit migration/compatibility review, including Nest, Firebase Admin and build/test tooling. Review the production-only audit separately; advisory count is not an exploitability assessment.
3. Verify realtime revocation across multiple instances with Redis, connection races and reconnects. Database checks and network delivery are separate operations; they do not prove instantaneous revocation.
4. Add durable notification side-effect recovery/outbox handling so a failed notification cannot make a committed mutation appear failed. Review legacy tenant-invalid relations and the global achievement catalog before rollout.
5. Finish device and staging smoke tests, Firebase production configuration, staging deployment and pilot validation.
6. Flutter visual redesign, design-system migration and specialist visual gates remain in the approved redesign plan. Keep EduGram identity until the final product name is decided.

## Local verification

Use a fresh disposable PostgreSQL database. Run `npm ci`, set DATABASE_URL and TEST_DATABASE_URL, then `npx prisma generate`, `npx prisma db push --skip-generate`, `npm run build`, `node --test test/post-policy.node.test.cjs` and `npm test -- --runInBand`. Integration tests skip without TEST_DATABASE_URL; skipped tests do not pass the release gate.

In frontend, run `flutter pub get`, `flutter analyze --no-fatal-infos`, `flutter test` and `flutter build web --release`. Informational lint hints are reported; warnings/errors fail CI.
