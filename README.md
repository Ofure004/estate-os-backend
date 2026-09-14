<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Login and authentication

Set `DATABASE_URL` and a random `JWT_SECRET` of at least 32 bytes in `.env`.
Generate a secret with `openssl rand -hex 32`. The application refuses to start
without these settings.

```sh
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run db:seed
npm run start:dev
```

The development seed provides `owner@example.com`, `manager@example.com`, and
`tenant@example.com`, each with password `EstateDemo123!`. Each account has a
separate salted Argon2id hash. Rerunning the seed resets these demo passwords.
Existing users with no password hash cannot log in.

```sh
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"EstateDemo123!"}'

curl http://localhost:3000/auth/me \
  -H 'Authorization: Bearer <accessToken>'
```

Login returns `{ accessToken, expiresIn: 900, user }`. Tokens use HS256 and
expire after 15 minutes. Email is trimmed and lowercased; passwords are preserved
exactly. Invalid input returns 400; invalid credentials return the same 401 error
whether the email exists or not.

The guard verifies the bearer token and loads the current user from PostgreSQL
into typed `request.user`. `/auth/me` returns `id`, `email`, `firstName`,
`lastName`, and `phone`. Password hashes are never returned. Organization roles
and memberships are not included in the token or profile response.

Run `npm test` and `npm run test:e2e`. The HTTP suite uses real password hashing
and JWT signing with a mocked Prisma service, so it does not need a database.

## Authorization and scope

Import `AuthorizationModule` in a feature module and apply `@Authorize` to its
controllers or handlers. The decorator runs JWT authentication before scope and
role enforcement. No business endpoints have been added for this milestone;
`test/authorization.e2e-spec.ts` uses test-only controllers.

```ts
@Authorize({
  scope: 'estate',
  roles: ['ESTATE_MANAGER', 'ORG_ADMIN', 'ORG_OWNER'],
  organizationParam: 'organizationId',
})
@Get('organizations/:organizationId/estates/:estateId')
getEstate(@Req() request: AuthorizedRequest) {
  return request.authorization;
}
```

`estateId` and `organizationId` are the default route parameter names. Override
with `estateParam` or `organizationParam`. Estate ownership is resolved from the
database; a supplied organization must match. Scope is never taken from a body,
query string, JWT role claim, or client-supplied role.

`request.user` remains the authenticated profile. `request.authorization` contains
the user ID, organization ID, optional estate ID, matching roles, active
membership, staff assignments, and residencies (including unit ID and type).
Relationships are resolved per request. Staff assignments and residencies must
be `ACTIVE`, with `startedAt <= now` and `endedAt > now` when those dates exist.
Only active organization memberships count.

- Organization roles are `ORG_OWNER`, `ORG_ADMIN`, and `ORG_MEMBER`.
- Staff roles use the schema names, including `GUARD` and `ESTATE_MANAGER`.
- Any active residency type grants `RESIDENT` in its unit's estate. A residency
  type of `OWNER` does not grant `ORG_OWNER`.
- Roles match within the requested scope; at least one declared role must match.
- Organization owners and admins reach estates in their own organization only
  when a route lists their organization role. They do not automatically satisfy
  `GUARD`, `RESIDENT`, or `ESTATE_MANAGER` requirements.
- Organization membership of `MEMBER` does not itself grant estate access.
  Staff assignments and residency do not themselves grant organization access.
- Handler policies override controller policies. A guard without a policy,
  empty allowed roles, or missing scope fails closed. Missing authentication
  yields 401; insufficient roles, missing resources, and scope mismatch yield 403.

For routes containing a resource ID, declare its scope check:

```ts
@Authorize({
  scope: 'estate',
  roles: ['GUARD'],
  resource: { kind: 'accessPass', param: 'passId' },
})
@Get('estates/:estateId/passes/:passId')
```

Supported resource kinds: `unit`, `gate`, `visitorInvitation`, `accessPass`,
`accessEvent`, `residency`, `staffAssignment`, and `cluster`. Clusters require
organization scope. Passes resolve through their invitation; residencies through
their unit. Every lookup includes the organization and, for estate scope, estate.

Services must also constrain actual reads and writes. `estateWhere(context,
filter)` and `organizationWhere(context, filter)` combine scope and caller
filters with `AND`, so callers cannot overwrite scope fields. They apply to
models with direct `estateId` or `organizationId` fields respectively. The
organization helper rejects estate contexts to prevent broadening access.
Indirectly scoped models need their relation filters, as in `assertResource`.
A guard check alone does not automatically filter later Prisma queries or enforce
resident ownership of individual units/invitations; business actions must add
those action-specific rules when implemented.

## Resident visitor invitations

All four endpoints require JWT authentication and an active residency in the
route's estate. Staff or organization roles alone do not qualify.

| Method | Route | Action |
| --- | --- | --- |
| POST | `/estates/:estateId/visitor-invitations` | Create a PENDING invitation |
| GET | `/estates/:estateId/visitor-invitations` | List your invitations, newest first |
| GET | `/estates/:estateId/visitor-invitations/:invitationId` | View your invitation |
| PATCH | `/estates/:estateId/visitor-invitations/:invitationId/cancel` | Cancel your invitation |

Creation accepts `visitorFirstName`, `visitorLastName`, `validFrom`, `validUntil`,
and optional `visitorPhone`, `purpose`, and `hostResidencyId`. Names are trimmed
and required; names have a 100-character limit, phone 50, and purpose 1000.
Dates must be ISO timestamps with a timezone. Start must precede end; end must
be in the future. An already-started window is allowed.

One active residency is selected automatically. Multiple active residencies
require `hostResidencyId`, otherwise the response is:

```json
{
  "statusCode": 400,
  "code": "HOST_RESIDENCY_REQUIRED",
  "message": "You have multiple active residencies in this estate. Provide hostResidencyId to select the unit you are hosting the visitor from."
}
```

A supplied residency must be active, belong to the authenticated user, and be
in the requested estate; invalid selections return 403. No active residency
also returns 403. The server controls estate, creator, and initial status;
extra creation fields are rejected.

Responses include invitation details and `hostResidency: { id, unit: { id,
name, code } }`. Detail and cancellation queries enforce ownership through the
host residency, returning 404 for missing or unowned invitations after estate
authorization. Cancellation accepts only unexpired PENDING/ACTIVE invitations;
other states return 409. A conditional update and transaction protect concurrent
status changes. Cancellation also revokes any associated pass in the same transaction.

## Access passes

Creating an invitation now creates exactly one access pass in the same Prisma
transaction. The invitation remains PENDING; the pass begins ACTIVE and inherits
its validity window. The server generates an 8-character manual code with
cryptographically secure randomness and a 32-byte base64url QR token. Unique
indexes enforce both credentials; code/token collisions retry the entire
transaction up to five attempts, then return 503 without a partial invitation.

Apply the migration and regenerate Prisma Client:

```sh
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
```

The migration backfills existing passes with tokens built from two cryptographically
random PostgreSQL UUIDs, independent of their IDs. Existing invitations without
passes are not automatically issued credentials; cancellation still works for them.

The authenticated resident can retrieve their credential using:

```text
GET /estates/:estateId/visitor-invitations/:invitationId/pass
```

The response contains `code`, `token`, `status`, `effectiveStatus`, `validFrom`,
and `validUntil`, with `Cache-Control: no-store`. Active estate residency and
ownership through the host residency are required. Missing or unowned passes
return 404 after estate authorization. The token appears only on this endpoint;
invitation detail includes a token-free pass summary, and invitation lists have
no pass credentials. Creation does not accept code, token, or pass state.

For future QR rendering, encode only the opaque token. It contains no visitor
details and is not self-authorizing. Do not log or put it in analytics.

`AccessPassService.evaluatePass(pass, invitation, estateId, now)` checks the
requested estate, both validity windows, revocation, usage, and invitation state.
The start is inclusive and the end exclusive (`now >= validUntil` is expired).
PENDING and ACTIVE invitations can support an ACTIVE effective pass. Cancellation
and completion take precedence over other states (a completed invitation with a USED
pass returns USED); revocation and usage then take
precedence over time evaluation. The persisted pass status is not changed merely
because time passes. Effective results include ACTIVE, NOT_YET_VALID, EXPIRED,
REVOKED, USED, CANCELLED, COMPLETED, and fail-closed results for missing records,
wrong estate, or invalid windows.

Successful cancellation atomically changes the invitation to CANCELLED and its
pass to REVOKED, recording `revokedAt`. No generic pass update, QR rendering, or access-event endpoint is exposed.
Read-only gate verification is documented below.

The regular unit/HTTP suites run without a database. Database tests explicitly
opt in against a migrated local development database with the standard demo seed:

```sh
ACCESS_PASS_DATABASE_TEST=1 npm run test:e2e -- test/access-passes.database.e2e-spec.ts
```

They test real unique-constraint collisions, bounded retries, credential response
boundaries, ownership, legacy invitations, cancellation, and transaction rollback
after injected failures. They create isolated invitations and one estate and
remove those test records afterward.

## Gate verification

```text
POST /estates/:estateId/gates/:gateId/access/verify
Authorization: Bearer <staff JWT>
Content-Type: application/json

{ "credential": "<manual code or QR token>" }
```

Only an active GUARD or SECURITY_SUPERVISOR assignment in the requested estate
qualifies. Estate managers, organization admins, and residents do not qualify
through those roles alone. Existing assignment status and effective dates apply.

The credential must be a nonempty string of at most 256 characters. Surrounding
whitespace is trimmed. Short manual codes are normalized to uppercase; tokens
remain case-sensitive and opaque. Extra request fields are rejected, including
body estate/gate IDs and pass/invitation IDs. The route identifies the gate and
estate; the credential is looked up only after authorization and gate validation.

Missing or wrong-estate gates return 404. An inactive gate returns HTTP 200 with
`{ "valid": false, "status": "INACTIVE_GATE" }`. Other business failures also
return HTTP 200 with only `valid: false` and a status: INVALID_CREDENTIAL,
NOT_YET_VALID, EXPIRED, REVOKED, CANCELLED, COMPLETED, USED, or WRONG_ESTATE.
Authentication, authorization, and malformed input use 401, 403, and 400.

Successful responses contain `valid: true`, `status: "VALID"`, visitor first/last
names, host unit ID/name/code, and invitation purpose/validity dates. They never
echo the credential or return pass IDs, tokens, or host user profiles. Responses
use `Cache-Control: no-store`. Both credential types use the same current-state
pass evaluator; validity starts inclusively and ends exclusively.

Verification is entirely read-only: it does not consume a pass, change invitation
state, or create an AccessEvent. A later check-in must independently revalidate.

`test/access-verification.e2e-spec.ts` tests roles, scopes, gates, input validation,
code normalization, token case sensitivity, invalid states, response privacy,
repeated verification, and absence of writes. The opt-in PostgreSQL suite also
verifies a real pass at a seeded gate and compares records and event counts
before and after. Its temporary guard assignment is removed during cleanup.

## Check-in and check-out

Authorized GUARD and SECURITY_SUPERVISOR staff can submit the same credential
body used for verification:

```text
POST /estates/:estateId/gates/:gateId/access/check-in
POST /estates/:estateId/gates/:gateId/access/check-out

{ "credential": "<manual code or QR token>" }
```

Both actions enforce active staff scope and an active gate in the requested
estate. They reuse verification's credential resolution, normalization, gate
validation, and visitor response mapping. Extra body fields, including actor IDs,
are rejected. Events always record the authenticated staff user as actor.

Check-in re-evaluates entry validity from current records, then appends CHECK_IN.
It leaves pass and invitation status unchanged. Presence comes from the latest
CHECK_IN/CHECK_OUT event for the pass, excluding DENIED events. A currently
inside visitor returns ALREADY_CHECKED_IN without another event.

Check-out requires an open check-in, not current entry validity. It permits
recording departure after expiry, revocation, cancellation, or an unexpectedly
completed invitation. It atomically appends CHECK_OUT, completes the invitation,
and marks the pass USED, preserving any prior revocation timestamp. Without an
open check-in it returns NOT_CHECKED_IN. The previous CHECK_IN event is unchanged.
Completed/USED visits evaluate as USED and cannot enter again.

Both actions return HTTP 200 with `success` and `status`. Successful statuses are
CHECKED_IN and CHECKED_OUT; responses also contain `event: { id, type, createdAt }`,
visitor names, and host unit ID/name/code. Failures contain only `success: false`
and a reason, such as ALREADY_CHECKED_IN, NOT_CHECKED_IN, INVALID_CREDENTIAL,
INACTIVE_GATE, WRONG_ESTATE, or the existing entry-validity reasons. Authentication,
authorization, malformed input and invalid gate scope retain 401/403/400/404.
Responses never contain credentials and use `Cache-Control: no-store`.

Each action uses a Prisma transaction and PostgreSQL locks: a shared gate lock,
then exclusive invitation and pass locks in the same order as cancellation.
After waiting for locks it rereads the credential and current state, then checks
presence and appends the event. Concurrent actions for a pass serialize, preventing
duplicate entries/exits. Event timestamps increase strictly per pass to avoid
ambiguous millisecond ties. No mutable presence flag or event update endpoint is
introduced. Verification remains read-only and does not reserve admission.

The opt-in PostgreSQL suite covers code/token entry, separate immutable history,
concurrent entry/exit, lifecycle rollback, departure after invalidation, supervisor
access, gate and estate boundaries, and response privacy. Temporary test events
are deleted during cleanup before the associated invitations and passes.

## Current on-site visitors and recent activity

```text
GET /estates/:estateId/access/onsite
GET /estates/:estateId/access/activity?page=1&limit=20
GET /estates/:estateId/access/activity?type=CHECK_IN&gateId=<gateId>
```

Both endpoints require JWT authentication and an active GUARD,
SECURITY_SUPERVISOR, or ESTATE_MANAGER assignment in the requested estate.
Residents and organization-only admins do not qualify. Existing effective
assignment dates and estate/organization authorization rules apply.

On-site returns an array (empty when nobody is inside). Each item contains:

```text
{
  visitor: { firstName, lastName },
  host: { unit: { id, name, code } },
  checkedInAt,
  entryGate: { id, name, code },
  invitationId,
  purpose,
  validUntil
}
```

Presence is derived only from the latest CHECK_IN/CHECK_OUT per pass. DENIED
records are ignored. Expired/revoked passes and cancelled invitations remain
visible if their latest relevant event is CHECK_IN. A later CHECK_OUT removes
them. Historical re-entry is interpreted correctly without enabling new multi-entry
passes. Results are newest check-in first, with event ID descending as tie-breaker.

Activity returns `{ data, meta: { page, limit, total, totalPages } }`. Each item
contains event `id`, `type`, `createdAt`, visitor names, host unit ID/name/code,
gate ID/name/code, and `performedBy: { id, firstName, lastName }`. It includes only
CHECK_IN and CHECK_OUT, ordered by `createdAt DESC, id DESC`.

Pagination defaults to page 1, limit 20; limit must be 1–100. Invalid, fractional,
negative, repeated, or overflowing pagination values return 400. Out-of-range
pages return an empty data array with valid totals; an empty dataset has zero
totalPages. Offset pagination is deterministic for unchanged data; newly arriving
events may shift page boundaries between requests.

Optional activity filters are `type=CHECK_IN|CHECK_OUT` and `gateId`. They combine
with estate scope and pagination; totals reflect the filters. Missing or foreign
gates return 404. Inactive gates remain searchable for historical activity.

Every result checks event, gate, invitation, and host-unit estate ownership;
inconsistent cross-estate relationships are excluded. Responses contain neither
pass codes nor QR tokens and use `Cache-Control: no-store`.

The on-site query uses parameterized SQL for a correlated latest-event comparison
that Prisma cannot directly express. It retrieves candidate IDs in PostgreSQL,
then selects only scoped response fields through Prisma. A repeatable-read
transaction keeps both steps consistent. Activity uses the same isolation for
its count and page. The composite `(passId, createdAt, id)` index replaces the
old pass-only index and supports latest-event comparisons; the existing
`(estateId, createdAt)` index supports estate activity reads.

These endpoints never modify history or maintain an isInside flag. "Live" means
fresh results when requested; no push delivery, polling service, or frontend is
included. The PostgreSQL visibility suite creates isolated organizations/estates,
checks presence, ordering, filters, data isolation and unchanged records, then
removes its fixtures:

```sh
ACCESS_PASS_DATABASE_TEST=1 npm run test:e2e -- test/access-visibility.database.e2e-spec.ts
```
