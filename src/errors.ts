import { FrontalError, type FrontalErrorOptions } from "@frontal-labs/error";

/** Scope assigned to every error raised by the SDK. */
export const PODYARD_ERROR_SCOPE = "podyard";

/**
 * Stable, application-owned error codes for the Podyard SDK.
 *
 * Branch on `code` and `scope`, never on message text. Codes are part of the
 * public contract sent to clients, so they must remain stable even when
 * wording changes.
 */
export const PodyardErrorCodes = {
  MISSING_API_KEY: "missing_api_key",
  NETWORK_FAILURE: "network_failure",
  API_ERROR: "api_error",
  INVALID_JSON: "invalid_json",
  AUTH_FAILED: "auth_failed",
  QUOTA_EXCEEDED: "quota_exceeded",
  RATE_LIMITED: "rate_limited",
  NOT_FOUND: "not_found",
  POD_NOT_FOUND: "pod_not_found",
  SNAPSHOT_NOT_FOUND: "snapshot_not_found",
  VALIDATION_FAILED: "validation_failed",
  CONFLICT: "conflict",
  PAYLOAD_TOO_LARGE: "payload_too_large",
  UNSUPPORTED_MEDIA_TYPE: "unsupported_media_type",
  NOT_IMPLEMENTED: "not_implemented",
  GATEWAY_TIMEOUT: "gateway_timeout",
  INVALID_RESPONSE: "invalid_response",
} as const;

export type PodyardErrorCode =
  (typeof PodyardErrorCodes)[keyof typeof PodyardErrorCodes];

/**
 * Options accepted by `PodyardError`. `code` is required and typed to the
 * stable SDK code set; `scope` is fixed to `"podyard"` and excluded.
 */
export type PodyardErrorOptions = {
  code: PodyardErrorCode;
} & Omit<FrontalErrorOptions<PodyardErrorCode>, "scope" | "code">;

/**
 * The SDK's error class. Extends `FrontalError` so every error carries a
 * stable `scope` and `code`, a developer-facing `message`, and approved
 * `public` text for clients.
 */
export class PodyardError extends FrontalError<PodyardErrorCode> {
  override readonly scope = PODYARD_ERROR_SCOPE;

  constructor(
    message: string,
    options: PodyardErrorOptions = { code: "api_error" },
  ) {
    super(message, options);
  }
}
