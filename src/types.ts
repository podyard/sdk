import type { PodyardErrorCode } from "./errors";

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface PodyardOptions {
  /** Podyard API key: `pyd_live_…` or `pyd_test_…`. */
  apiKey: string;
  /**
   * API base URL. Defaults to `https://api.podyard.dev` (the production
   * endpoint from `@podyard/config`). Override for local development.
   */
  baseUrl?: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof fetch;
  /** Default timeout in milliseconds for HTTP requests. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export interface PodyardErrorBody {
  code: PodyardErrorCode;
  docsUrl?: string;
  message: string;
  requestId: string;
}

// ---------------------------------------------------------------------------
// Pods
// ---------------------------------------------------------------------------

export type PodStatus =
  | "creating"
  | "running"
  | "sleeping"
  | "stopping"
  | "stopped"
  | "error";

export interface Pod {
  createdAt: string;
  destroyedAt?: string | null;
  id: string;
  lastActivityAt?: string | null;
  metadata?: Record<string, unknown> | null;
  name: string;
  status: PodStatus;
  templateId?: string | null;
}

export interface CreatePodRequest {
  metadata?: Record<string, unknown>;
  name?: string;
  templateId?: string;
}

export interface CreatePodResponse extends Pod {
  /** Engine session ID. Only present on the create response. */
  engineSessionId?: string;
}

// ---------------------------------------------------------------------------
// Exec
// ---------------------------------------------------------------------------

export interface ExecRequest {
  argv: string[];
  /** Optional stdin bytes for the process (UTF-8 string or byte array). */
  stdin?: string;
  /**
   * When true, the response is an NDJSON stream of ExecEvent lines.
   * Use `client.execStream()` for the SDK's async-iterator wrapper.
   */
  stream?: boolean;
  /** Timeout in milliseconds. */
  timeoutMs?: number;
}

export interface ExecResult {
  argv: string[];
  durationMs: number;
  exitCode: number;
  finishedAt: string;
  id: string;
  podId: string;
  startedAt: string;
  stderr: string;
  stdout: string;
}

export type ExecEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "exit"; exitCode: number };

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

export interface FsReadResponse {
  content: string;
  encoding: "utf-8" | "base64";
  sizeBytes: number;
}

export interface FsWriteRequest {
  content: string;
  encoding?: "utf-8" | "base64";
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export interface Snapshot {
  createdAt: string;
  id: string;
  name?: string | null;
  podId: string;
  sizeBytes?: number | null;
}

export interface CreateSnapshotRequest {
  name?: string;
}

export interface ForkRequest {
  /**
   * Command to run in each child. Must be non-empty when provided;
   * the API defaults to `["true"]` (a no-op) when omitted.
   */
  argv?: string[];
  /**
   * Number of child pods to create (1..64). Defaults to 1.
   */
  count?: number;
}

export interface ForkResponse {
  children: Array<{ id: string; status: PodStatus }>;
  parentPodId: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface Template {
  createdAt: string;
  cwd?: string | null;
  description?: string | null;
  env?: Record<string, string> | null;
  id: string;
  name: string;
  snapshotId: string;
  visibility: "private" | "public";
}

export interface CreateTemplateRequest {
  cwd?: string;
  description?: string;
  env?: Record<string, string>;
  name: string;
  snapshotId: string;
  visibility?: "private" | "public";
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface ListResponse<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface ListParams {
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface UsageEvent {
  createdAt: string;
  eventType: string;
  id: number;
  meter: string;
  podId?: string | null;
  reportedAt?: string | null;
  value: number;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export type PlanId = "free" | "solo" | "team" | "enterprise";

export interface PlanLimits {
  execMaxConcurrency: number;
  execMaxOutputBytes: number;
  execTimeoutSeconds: number;
  fork: boolean;
  fsMaxFileBytes: number;
  fsMaxTotalBytes: number;
  maxConcurrentPods: number;
  maxLifetimeHours: number;
  rateLimitBurst: number;
  rateLimitRpm: number;
  sleepAfterMinutes: number;
  sleepWake: boolean;
  snapshotQuota: number;
  storageGiB: number;
  templateQuota: number;
}

export interface CurrentUsage {
  activePods: number;
  currentPeriod: Record<string, unknown>;
  snapshots: number;
}

export interface LimitsResponse {
  limits: PlanLimits;
  plan: PlanId;
  usage: CurrentUsage;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface Webhook {
  active: boolean;
  createdAt: string;
  events: string[];
  id: string;
  lastDeliveredAt?: string | null;
  url: string;
}

export interface CreateWebhookRequest {
  active?: boolean;
  events: string[];
  url: string;
}

// ---------------------------------------------------------------------------
// Keys (dashboard-facing)
// ---------------------------------------------------------------------------

export interface ApiKey {
  createdAt: string;
  id: string;
  kind: "live" | "test";
  label: string;
  plan: string;
  /** Masked key prefix, e.g. `pyd_live_XBdZ…`. */
  prefix: string;
}

export interface CreateApiKeyRequest {
  kind?: "live" | "test";
  label?: string;
}

export interface CreateApiKeyResponse extends ApiKey {
  /** The full key string. Shown only once at creation. */
  key: string;
}
