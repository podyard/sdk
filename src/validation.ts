import { z } from "zod";
import { PodyardError, PodyardErrorCodes } from "./errors";

/**
 * Shared zod primitives used by the wire-format validators.
 *
 * These are deliberately permissive on the read side: the SDK never blocks a
 * request on input validation it can only guess at, and it never drops data
 * the API returns because it does not recognize a field. Unknown fields are
 * kept via `.passthrough()` where an object is validated.
 */

/** ISO-8601 timestamp, kept loose so API changes cannot break consumers. */
export const isoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "expected an ISO-8601 timestamp",
  });

/** A free-form string field (nullable where the API may omit it). */
const maybeString = z.string().nullish();

/**
 * Validate a parsed API response against a schema, throwing a stable
 * `PodyardError` (code `invalid_response`) when the shape is off.
 *
 * The raw value is returned untouched when validation succeeds, so consumers
 * never see a coerced or stripped-down object.
 */
export function validateResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: { endpoint: string; requestId?: string | null },
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .slice(0, 5)
    .join("; ");
  throw new PodyardError(
    `Invalid response from Podyard API endpoint ${context.endpoint}: ${issues}`,
    {
      code: PodyardErrorCodes.INVALID_RESPONSE,
      statusCode: 502,
      requestId: context.requestId ?? undefined,
      public: {
        message:
          "The Podyard API returned an unexpected response. Please try again.",
        hint: `Report this to support with request ID ${
          context.requestId ?? "unknown"
        } and endpoint ${context.endpoint}.`,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Response schemas (read-side validation)
// ---------------------------------------------------------------------------

export const podSchema = z.object({
  createdAt: isoTimestamp,
  destroyedAt: maybeString,
  id: z.string().min(1),
  lastActivityAt: maybeString,
  metadata: z.record(z.string(), z.unknown()).nullish(),
  name: z.string(),
  status: z.enum(["running", "sleeping", "stopped", "error"]),
  templateId: maybeString,
  updatedAt: isoTimestamp,
});

export const snapshotSchema = z.object({
  createdAt: isoTimestamp,
  id: z.string().min(1),
  name: maybeString,
  podId: z.string().min(1),
  retained: z.boolean(),
  sizeBytes: z.number().int().nonnegative().nullish(),
  updatedAt: isoTimestamp,
});

export const templateSchema = z.object({
  createdAt: isoTimestamp,
  cwd: maybeString,
  description: maybeString,
  env: z.record(z.string(), z.string()).nullish(),
  id: z.string().min(1),
  name: z.string(),
  snapshotId: z.string().min(1),
  updatedAt: isoTimestamp,
  visibility: z.enum(["private", "public"]),
});

export const webhookSchema = z.object({
  active: z.boolean(),
  createdAt: isoTimestamp,
  events: z.array(z.string()),
  id: z.string().min(1),
  lastDeliveredAt: maybeString,
  lastError: maybeString,
  updatedAt: isoTimestamp,
  url: z.string().min(1),
});

export const usageEventSchema = z.object({
  amount: z.number(),
  apiKeyId: z.string().min(1),
  billingUnit: z.string(),
  createdAt: isoTimestamp,
  eventType: z.enum(["exec", "fs_write", "fs_read", "snapshot", "fork"]),
  id: z.number(),
  podId: maybeString,
});

export const apiKeySchema = z.object({
  createdAt: isoTimestamp,
  id: z.string().min(1),
  kind: z.enum(["live", "test"]),
  label: z.string(),
  plan: z.string(),
  revokedAt: maybeString,
  updatedAt: isoTimestamp,
});

export const planLimitsSchema = z.object({
  execTimeoutSeconds: z.number().int().nonnegative(),
  fsMaxFileSizeMb: z.number().int().nonnegative(),
  maxConcurrentPods: z.number().int().nonnegative(),
  maxLifetimeHours: z.number().int().nonnegative(),
  maxPodSizeGb: z.number().int().nonnegative(),
  maxSnapshotCount: z.number().int().nonnegative(),
  rateLimitRpm: z.number().int().nonnegative(),
  sleepAfterMinutes: z.number().int().nonnegative(),
  webhooksPerKey: z.number().int().nonnegative(),
});

export const planSchema = z.object({
  availableAtLaunch: z.boolean(),
  blurb: z.string(),
  contactSales: z.boolean(),
  id: z.string().min(1),
  limits: planLimitsSchema,
  name: z.string(),
  priceAnnualCents: z.number().int().nonnegative().nullable(),
  priceMonthlyCents: z.number().int().nonnegative(),
});

export const limitsResponseSchema = z.object({
  currentUsage: z.object({
    concurrentPods: z.number().int().nonnegative(),
    snapshots: z.number().int().nonnegative(),
    execsToday: z.number().int().nonnegative(),
    webhooks: z.number().int().nonnegative(),
  }),
  plan: planSchema,
});

/**
 * Cursor-paginated list envelope. Items are validated against `item` when
 * provided; omit it for endpoints whose items are not (yet) modeled.
 */
export function listResponseSchema<T extends z.ZodTypeAny>(
  item: T,
): z.ZodType<{
  hasMore: boolean;
  items: z.infer<T>[];
  next?: string | null;
}> {
  return z.object({
    hasMore: z.boolean(),
    items: z.array(item),
    next: z.string().nullish(),
  });
}

export const execResultSchema = z.object({
  durationMs: z.number().nonnegative(),
  exitCode: z.number().int(),
  stderr: z.string(),
  stderrBytes: z.number().int().nonnegative(),
  stdout: z.string(),
  stdoutBytes: z.number().int().nonnegative(),
});

export const forkSnapshotResponseSchema = z.object({
  children: z.array(podSchema),
});

export const createApiKeyResponseSchema = apiKeySchema.extend({
  key: z.string().min(1),
});
