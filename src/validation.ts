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
  context: { endpoint: string; requestId?: string | null }
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
    }
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
  status: z.enum([
    "creating",
    "running",
    "sleeping",
    "stopping",
    "stopped",
    "error",
  ]),
  templateId: maybeString,
});

export const snapshotSchema = z.object({
  createdAt: isoTimestamp,
  id: z.string().min(1),
  name: maybeString,
  podId: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().nullish(),
});

export const templateSchema = z.object({
  createdAt: isoTimestamp,
  cwd: maybeString,
  description: maybeString,
  env: z.record(z.string(), z.string()).nullish(),
  id: z.string().min(1),
  name: z.string(),
  snapshotId: z.string().min(1),
  visibility: z.enum(["private", "public"]),
});

export const webhookSchema = z.object({
  active: z.boolean(),
  createdAt: isoTimestamp,
  events: z.array(z.string()),
  id: z.string().min(1),
  lastDeliveredAt: maybeString,
  url: z.string().min(1),
});

export const usageEventSchema = z.object({
  createdAt: isoTimestamp,
  eventType: z.string(),
  id: z.number(),
  meter: z.string(),
  podId: maybeString,
  reportedAt: maybeString,
  value: z.number(),
});

export const apiKeySchema = z.object({
  createdAt: isoTimestamp,
  id: z.string().min(1),
  kind: z.enum(["live", "test"]),
  label: z.string(),
  plan: z.string(),
  prefix: z.string(),
});

export const planLimitsSchema = z.object({
  execMaxConcurrency: z.number().int().nonnegative(),
  execMaxOutputBytes: z.number().int().nonnegative(),
  execTimeoutSeconds: z.number().int().nonnegative(),
  fork: z.boolean(),
  fsMaxFileBytes: z.number().int().nonnegative(),
  fsMaxTotalBytes: z.number().int().nonnegative(),
  maxConcurrentPods: z.number().int().nonnegative(),
  maxLifetimeHours: z.number().int().nonnegative(),
  rateLimitBurst: z.number().int().nonnegative(),
  rateLimitRpm: z.number().int().nonnegative(),
  sleepAfterMinutes: z.number().int().nonnegative(),
  sleepWake: z.boolean(),
  snapshotQuota: z.number().int().nonnegative(),
  storageGiB: z.number().int().nonnegative(),
  templateQuota: z.number().int().nonnegative(),
});

export const limitsResponseSchema = z.object({
  limits: planLimitsSchema,
  plan: z.enum(["free", "solo", "team", "enterprise"]),
  usage: z.object({
    activePods: z.number().int().nonnegative(),
    currentPeriod: z.record(z.string(), z.unknown()),
    snapshots: z.number().int().nonnegative(),
  }),
});

/**
 * Cursor-paginated list envelope. Items are validated against `item` when
 * provided; omit it for endpoints whose items are not (yet) modeled.
 */
export function listResponseSchema<T extends z.ZodTypeAny>(
  item: T
): z.ZodType<{
  items: z.infer<T>[];
  nextCursor?: string | null;
}> {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullish(),
  });
}

export const execResultSchema = z.object({
  argv: z.array(z.string()),
  durationMs: z.number().nonnegative(),
  exitCode: z.number().int(),
  finishedAt: isoTimestamp,
  id: z.string().min(1),
  podId: z.string().min(1),
  startedAt: isoTimestamp,
  stderr: z.string(),
  stdout: z.string(),
});

export const forkResponseSchema = z.object({
  children: z.array(
    z.object({
      id: z.string().min(1),
      status: podSchema.shape.status,
    })
  ),
  parentPodId: z.string().min(1),
});

export const createApiKeyResponseSchema = apiKeySchema.extend({
  key: z.string().min(1),
});
