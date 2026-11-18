# @podyard/sdk

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
