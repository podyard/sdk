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

export type PodStatus = "running" | "sleeping" | "stopped" | "error";

export interface Pod {
  createdAt: string;
  destroyedAt?: string | null;
  id: string;
  lastActivityAt?: string | null;
  metadata?: Record<string, unknown> | null;
  name: string;
  status: PodStatus;
  templateId?: string | null;
  updatedAt: string;
}

export interface CreatePodRequest {
  metadata?: Record<string, unknown>;
  name?: string;
  templateId?: string;
}

export interface CreatePodResponse extends Pod {}

// ---------------------------------------------------------------------------
// Exec
// ---------------------------------------------------------------------------

export interface ExecRequest {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  /**
   * When true, the response is an NDJSON stream of ExecEvent lines.
   * The SDK returns a ReadableStream<string>.
   */
  stream?: boolean;
  timeoutSeconds?: number;
}

export interface ExecResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stderrBytes: number;
  stdout: string;
  stdoutBytes: number;
}

export interface ExecEvent {
  data?: string;
  exitCode?: number;
  type: "stdout" | "stderr" | "exit";
}

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
  retained: boolean;
  sizeBytes?: number | null;
  updatedAt: string;
}

export interface CreateSnapshotRequest {
  name?: string;
  retain?: boolean;
}

export interface ForkSnapshotRequest {
  /**
   * When forking a pod, the command to run in each child.
   */
  argv?: string[];
  count?: number;
}

export interface ForkSnapshotResponse {
  children: Pod[];
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
  updatedAt: string;
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
  hasMore: boolean;
  items: T[];
  next?: string | null;
}

export interface ListParams {
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface UsageEvent {
  amount: number;
  apiKeyId: string;
  billingUnit: string;
  createdAt: string;
  eventType: "exec" | "fs_write" | "fs_read" | "snapshot" | "fork";
  id: number;
  podId?: string | null;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export interface PlanLimits {
  execTimeoutSeconds: number;
  fsMaxFileSizeMb: number;
  maxConcurrentPods: number;
  maxLifetimeHours: number;
  maxPodSizeGb: number;
  maxSnapshotCount: number;
  rateLimitRpm: number;
  sleepAfterMinutes: number;
  webhooksPerKey: number;
}

export interface Plan {
  availableAtLaunch: boolean;
  blurb: string;
  contactSales: boolean;
  id: string;
  limits: PlanLimits;
  name: string;
  priceAnnualCents: number | null;
  priceMonthlyCents: number;
}

export interface LimitsResponse {
  currentUsage: {
    concurrentPods: number;
    snapshots: number;
    execsToday: number;
    webhooks: number;
  };
  plan: Plan;
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
  lastError?: string | null;
  updatedAt: string;
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
  revokedAt?: string | null;
  updatedAt: string;
}

export interface CreateApiKeyRequest {
  kind?: "live" | "test";
  label?: string;
}

export interface CreateApiKeyResponse extends ApiKey {
  /** The full key string. Shown only once at creation. */
  key: string;
}
