# @podyard/sdk

## 0.3.1

### Fixed

- **ID validation no longer rejects server-issued IDs.** Pod, snapshot and
  template IDs were validated against a Crockford-ULID charset
  (`[0-9A-HJKMNP-TV-Z]{26}`), but live pod IDs use a wider alphabet (they can
  contain `I`, `L`, `U` — e.g. `pod_MWZ29Z9LJANIDID9UGVA7AAAAA`). Every pod
  operation that took an API-returned ID failed client-side with
  `validation_failed`. IDs are now treated as opaque server-generated values:
  the shape check accepts `<prefix>_<body>` with any URL-safe body, so IDs the
  API returns are always passed through verbatim.

## 0.3.0

### Changed

- **Wire contract aligned with the live v1 API.** All types and zod schemas now
  match the production wire as served by `api.podyard.dev`, not the stale OpenAPI
  spec. The SDK is strictly a client of the public API — it has no knowledge of
  the engine.
- **`Pod`**: dropped `updatedAt` (not present on the wire).
- **`ExecRequest`**: now `{ argv, stream?, stdin?, timeoutMs? }`. Dropped `cwd`,
  `env`, `timeoutSeconds` (not surfaced by the API).
- **`ExecResult`**: now `{ id, podId, argv, exitCode, stdout, stderr, startedAt,
  finishedAt, durationMs }`. Dropped `stdoutBytes` / `stderrBytes`.
- **`ExecEvent`**: now a proper discriminated union
  (`{ type: "stdout" | "stderr", data } | { type: "exit", exitCode }`).
- **`Snapshot`**: dropped `retained` and `updatedAt`.
- **`CreateSnapshotRequest`**: simplified to `{ name? }`.
- **`ForkRequest` / `ForkResponse`**: renamed from `ForkSnapshotRequest` /
  `ForkSnapshotResponse`. Fork now takes `{ count?, argv? }` and returns
  `{ parentPodId, children: [{ id, status }] }`.
- **`ListResponse`**: `{ items, nextCursor? }` — dropped `hasMore`, renamed
  `next` → `nextCursor`.
- **`LimitsResponse`**: replaced the plan-object + `currentUsage` shape with
  `{ plan, limits, usage }` as served by `GET /v1/limits`.
- **`ApiKey`**: dropped `revokedAt` / `updatedAt`, added `prefix`.
- **`Template`**: dropped `updatedAt`.
- **`Webhook`**: dropped `updatedAt` and `lastError`.
- **`UsageEvent`**: aligned to the live wire
  (`{ id, podId, meter, value, eventType, reportedAt, createdAt }`).
- **`CreatePodResponse`**: now includes the optional `engineSessionId` field
  returned on create.
- **`fs.write`**: sends raw bytes (`application/octet-stream`), UTF-8 text
  (`text/plain`), or a JSON `FsWriteRequest` — no longer encodes bytes as a JSON
  array.
- **`execStream`**: forces `stream: true` in the request body so the API always
  returns NDJSON.

## 0.2.1

### Changed

- Renamed the client to `Podyard`, including its options type
  (`PodyardOptions`).

## 0.2.0

### Added

- **Response validation.** Every `Podyard` endpoint now validates its
  parsed response against a zod schema in `src/validation.ts`. The SDK never
  coerces or strips data it returns — unknown fields are still tolerated, but a
  structurally malformed API response now fails fast.
- **New error code `invalid_response`** (`PodyardErrorCodes.INVALID_RESPONSE`,
  HTTP 502). Thrown by `validateResponse` when an API response does not match
  the expected wire shape. Branch on `code` + `scope`; the `public` message
  never leaks internal details.
- Exposed `validateResponse` and the wire schemas (`podSchema`,
  `snapshotSchema`, `templateSchema`, `webhookSchema`, `usageEventSchema`,
  `apiKeySchema`, `planSchema`, `limitsResponseSchema`, `execResultSchema`,
  `forkSnapshotResponseSchema`, `createApiKeyResponseSchema`,
  `listResponseSchema`, `isoTimestamp`) for advanced consumers.
- **Quality tooling.** Biome (lint + import organization) and Prettier
  (formatting). Unified `pnpm run check` now runs typecheck → lint →
  format:check → test. Added `lint`, `lint:fix`, `format`, `format:check`, and
  `test:coverage` scripts.
- `tests/validation.test.ts` covering `validateResponse` success/failure paths,
  the `invalid_response` code, and schema coverage.

### Removed

- Unused dependency `@frontal-labs/sandbox-sdk`.
- Dev dependency `ultracite` (its Biome preset is replaced by a standalone
  `biome.json`).

## 0.1.0

### Initial release

- Split out from the podyard monorepo.
