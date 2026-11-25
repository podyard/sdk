import type * as z from "zod";
import type { PodyardErrorCode } from "./errors";
import { PodyardError, PodyardErrorCodes } from "./errors";
import type {
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  CreatePodRequest,
  CreatePodResponse,
  CreateSnapshotRequest,
  CreateTemplateRequest,
  CreateWebhookRequest,
  ExecEvent,
  ExecRequest,
  ExecResult,
  ForkRequest,
  ForkResponse,
  FsWriteRequest,
  ListParams,
  ListResponse,
  Pod,
  PodyardErrorBody,
  PodyardOptions,
  Snapshot,
  Template,
  UsageEvent,
  Webhook,
} from "./types";
import {
  apiKeySchema,
  createApiKeyResponseSchema,
  execResultSchema,
  forkResponseSchema,
  limitsResponseSchema,
  listResponseSchema,
  podSchema,
  snapshotSchema,
  templateSchema,
  usageEventSchema,
  validateResponse,
  webhookSchema,
} from "./validation";

// NOTE: @podyard/config is private and not publishable, so the SDK cannot
// import it directly. The base URL default is kept in sync with
// config/podyard.ts (podyard.api.base_url) by the CI config-drift check.
const DEFAULT_BASE_URL = "https://api.podyard.dev";

const TRAILING_SLASH = /\/$/u;
const ULID = "0-9A-HJKMNP-TV-Z";

/** Parse a Podyard error envelope into a PodyardError. */
function parseApiError(
  status: number,
  text: string,
  _requestId: string | null
): PodyardError {
  let body: PodyardErrorBody | undefined;
  try {
    const parsed = JSON.parse(text) as { error?: PodyardErrorBody };
    body = parsed.error;
  } catch {
    body = undefined;
  }
  const code = (body?.code ?? mapStatusToCode(status)) as PodyardErrorCode;
  return new PodyardError(
    `Podyard API error ${status}: ${body?.message ?? (text || "unknown error")}`,
    {
      code,
      statusCode: status,
      public: {
        message: body?.message ?? "The Podyard API returned an error.",
        hint: body?.docsUrl ? `See ${body.docsUrl}` : undefined,
      },
    }
  );
}

function mapStatusToCode(status: number): PodyardErrorCode {
  if (status === 401 || status === 403) {
    return PodyardErrorCodes.AUTH_FAILED;
  }
  if (status === 404) {
    return PodyardErrorCodes.NOT_FOUND;
  }
  if (status === 409) {
    return PodyardErrorCodes.CONFLICT;
  }
  if (status === 413) {
    return PodyardErrorCodes.PAYLOAD_TOO_LARGE;
  }
  if (status === 415) {
    return PodyardErrorCodes.UNSUPPORTED_MEDIA_TYPE;
  }
  if (status === 422) {
    return PodyardErrorCodes.VALIDATION_FAILED;
  }
  if (status === 429) {
    return PodyardErrorCodes.RATE_LIMITED;
  }
  if (status === 501) {
    return PodyardErrorCodes.NOT_IMPLEMENTED;
  }
  if (status === 504) {
    return PodyardErrorCodes.GATEWAY_TIMEOUT;
  }
  return PodyardErrorCodes.API_ERROR;
}

export class Podyard {
  readonly apiKey: string;
  readonly baseUrl: string;
  private readonly _fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: PodyardOptions) {
    if (!options.apiKey) {
      throw new PodyardError("Podyard apiKey is required", {
        code: PodyardErrorCodes.MISSING_API_KEY,
        statusCode: 500,
        public: { message: "A Podyard API key is required." },
      });
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (
      options.baseUrl ??
      process.env.PODYARD_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(TRAILING_SLASH, "");
    this._fetch = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** Create a client from the `PODYARD_API_KEY` environment variable. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): Podyard {
    const apiKey = env.PODYARD_API_KEY;
    if (!apiKey) {
      throw new PodyardError("Missing PODYARD_API_KEY environment variable", {
        code: PodyardErrorCodes.MISSING_API_KEY,
        statusCode: 500,
        public: {
          message:
            "Podyard is not configured. Set the PODYARD_API_KEY environment variable.",
        },
      });
    }
    return new Podyard({ apiKey, baseUrl: env.PODYARD_BASE_URL });
  }

  // -----------------------------------------------------------------------
  // Pods
  // -----------------------------------------------------------------------

  readonly pods = {
    list: (params: ListParams = {}): Promise<ListResponse<Pod>> => {
      const qs = toQueryString(params);
      return this.request<ListResponse<Pod>>(
        `/v1/pods${qs}`,
        { method: "GET" },
        listResponseSchema(podSchema)
      );
    },
    create: (
      input: CreatePodRequest = {},
      options: { idempotencyKey?: string } = {}
    ): Promise<CreatePodResponse> =>
      this.request<CreatePodResponse>(
        "/v1/pods",
        {
          method: "POST",
          body: JSON.stringify(input),
          headers: {
            ...(options.idempotencyKey
              ? { "Idempotency-Key": options.idempotencyKey }
              : {}),
          },
        },
        podSchema
      ),
    get: (id: string): Promise<Pod> => {
      assertPodId(id);
      return this.request<Pod>(
        `/v1/pods/${encodeURIComponent(id)}`,
        { method: "GET" },
        podSchema
      );
    },
    delete: async (id: string): Promise<void> => {
      assertPodId(id);
      await this.request<void>(`/v1/pods/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    exec: (id: string, input: ExecRequest): Promise<ExecResult> => {
      assertPodId(id);
      return this.request<ExecResult>(
        `/v1/pods/${encodeURIComponent(id)}/exec`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
        execResultSchema
      );
    },
    fs: {
      read: async (id: string, path: string): Promise<Uint8Array> => {
        assertPodId(id);
        const res = await this.rawRequest(
          `/v1/pods/${encodeURIComponent(id)}/fs/${encodePath(path)}`,
          { method: "GET" },
          "application/octet-stream"
        );
        const ab = await res.arrayBuffer();
        return new Uint8Array(ab);
      },
      write: async (
        id: string,
        path: string,
        input: FsWriteRequest | Uint8Array | string
      ): Promise<void> => {
        assertPodId(id);
        let body: BodyInit;
        let contentType: string;
        if (input instanceof Uint8Array) {
          // The Podyard API accepts raw bytes for filesystem writes.
          body = input.buffer.slice(
            input.byteOffset,
            input.byteOffset + input.byteLength
          ) as ArrayBuffer;
          contentType = "application/octet-stream";
        } else if (typeof input === "string") {
          body = input;
          contentType = "text/plain";
        } else {
          // A structured FsWriteRequest is sent as a JSON document.
          body = JSON.stringify(input);
          contentType = "application/json";
        }
        await this.request<void>(
          `/v1/pods/${encodeURIComponent(id)}/fs/${encodePath(path)}`,
          {
            method: "PUT",
            body,
            headers: { "content-type": contentType },
          }
        );
      },
      delete: async (id: string, path: string): Promise<void> => {
        assertPodId(id);
        await this.request<void>(
          `/v1/pods/${encodeURIComponent(id)}/fs/${encodePath(path)}`,
          { method: "DELETE" }
        );
      },
      /**
       * Directory listing is not yet supported by the API.
       * @throws PodyardError with code "not_implemented"
       */
      list(_id: string, _path: string): never {
        throw new PodyardError(
          "Directory listing is not yet supported. Coming soon.",
          {
            code: "not_implemented" as PodyardErrorCode,
            statusCode: 501,
            public: {
              message: "Directory listing is not yet supported. Coming soon.",
            },
          }
        );
      },
    },
    snapshot: (
      id: string,
      input: CreateSnapshotRequest = {}
    ): Promise<Snapshot> => {
      assertPodId(id);
      return this.request<Snapshot>(
        `/v1/pods/${encodeURIComponent(id)}/snapshot`,
        { method: "POST", body: JSON.stringify(input) },
        snapshotSchema
      );
    },
    listSnapshots: (
      id: string,
      params: ListParams = {}
    ): Promise<ListResponse<Snapshot>> => {
      assertPodId(id);
      const qs = toQueryString(params);
      return this.request<ListResponse<Snapshot>>(
        `/v1/pods/${encodeURIComponent(id)}/snapshots${qs}`,
        { method: "GET" },
        listResponseSchema(snapshotSchema)
      );
    },
    fork: (id: string, input: ForkRequest = {}): Promise<ForkResponse> => {
      assertPodId(id);
      return this.request<ForkResponse>(
        `/v1/pods/${encodeURIComponent(id)}/fork`,
        { method: "POST", body: JSON.stringify(input) },
        forkResponseSchema
      );
    },
    sleep: (id: string): Promise<Pod> => {
      assertPodId(id);
      return this.request<Pod>(
        `/v1/pods/${encodeURIComponent(id)}/sleep`,
        { method: "POST" },
        podSchema
      );
    },
    wake: (id: string): Promise<Pod> => {
      assertPodId(id);
      return this.request<Pod>(
        `/v1/pods/${encodeURIComponent(id)}/wake`,
        { method: "POST" },
        podSchema
      );
    },
  };

  // -----------------------------------------------------------------------
  // Snapshots
  // -----------------------------------------------------------------------

  readonly snapshots = {
    get: (id: string): Promise<Snapshot> => {
      assertSnapshotId(id);
      return this.request<Snapshot>(
        `/v1/snapshots/${encodeURIComponent(id)}`,
        { method: "GET" },
        snapshotSchema
      );
    },
    fork: (id: string, input: ForkRequest = {}): Promise<ForkResponse> => {
      assertSnapshotId(id);
      return this.request<ForkResponse>(
        `/v1/snapshots/${encodeURIComponent(id)}/fork`,
        { method: "POST", body: JSON.stringify(input) },
        forkResponseSchema
      );
    },
  };

  // -----------------------------------------------------------------------
  // Templates
  // -----------------------------------------------------------------------

  readonly templates = {
    list: (params: ListParams = {}): Promise<ListResponse<Template>> => {
      const qs = toQueryString(params);
      return this.request<ListResponse<Template>>(
        `/v1/templates${qs}`,
        { method: "GET" },
        listResponseSchema(templateSchema)
      );
    },
    create: (input: CreateTemplateRequest): Promise<Template> =>
      this.request<Template>(
        "/v1/templates",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
        templateSchema
      ),
    get: (id: string): Promise<Template> => {
      assertTemplateId(id);
      return this.request<Template>(
        `/v1/templates/${encodeURIComponent(id)}`,
        { method: "GET" },
        templateSchema
      );
    },
    delete: async (id: string): Promise<void> => {
      assertTemplateId(id);
      await this.request<void>(`/v1/templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
  };

  // -----------------------------------------------------------------------
  // Usage
  // -----------------------------------------------------------------------

  readonly usage = {
    list: (params: ListParams = {}): Promise<ListResponse<UsageEvent>> => {
      const qs = toQueryString(params);
      return this.request<ListResponse<UsageEvent>>(
        `/v1/usage${qs}`,
        { method: "GET" },
        listResponseSchema(usageEventSchema)
      );
    },
  };

  // -----------------------------------------------------------------------
  // Limits
  // -----------------------------------------------------------------------

  readonly limits = {
    get: (): Promise<import("./types").LimitsResponse> =>
      this.request<import("./types").LimitsResponse>(
        "/v1/limits",
        { method: "GET" },
        limitsResponseSchema
      ),
  };

  // -----------------------------------------------------------------------
  // Webhooks
  // -----------------------------------------------------------------------

  readonly webhooks = {
    list: (params: ListParams = {}): Promise<ListResponse<Webhook>> => {
      const qs = toQueryString(params);
      return this.request<ListResponse<Webhook>>(
        `/v1/webhooks${qs}`,
        { method: "GET" },
        listResponseSchema(webhookSchema)
      );
    },
    create: (input: CreateWebhookRequest): Promise<Webhook> =>
      this.request<Webhook>(
        "/v1/webhooks",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
        webhookSchema
      ),
    get: (id: string): Promise<Webhook> =>
      this.request<Webhook>(
        `/v1/webhooks/${encodeURIComponent(id)}`,
        { method: "GET" },
        webhookSchema
      ),
    delete: async (id: string): Promise<void> => {
      await this.request<void>(`/v1/webhooks/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
  };

  // -----------------------------------------------------------------------
  // Keys (dashboard-facing, session-authenticated)
  // -----------------------------------------------------------------------

  readonly keys = {
    list: (): Promise<ListResponse<ApiKey>> =>
      this.request<ListResponse<ApiKey>>(
        "/v1/keys",
        { method: "GET" },
        listResponseSchema(apiKeySchema)
      ),
    create: (input: CreateApiKeyRequest = {}): Promise<CreateApiKeyResponse> =>
      this.request<CreateApiKeyResponse>(
        "/v1/keys",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
        createApiKeyResponseSchema
      ),
    revoke: async (id: string): Promise<void> => {
      await this.request<void>(`/v1/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
  };

  // -----------------------------------------------------------------------
  // Exec streaming
  // -----------------------------------------------------------------------

  /**
   * Stream exec output as NDJSON. Returns an async iterable of parsed
   * ExecEvent objects.
   */
  async *execStream(
    id: string,
    input: ExecRequest
  ): AsyncGenerator<ExecEvent, void, unknown> {
    assertPodId(id);
    // The API returns NDJSON only when `stream` is truthy.
    const res = await this.rawRequest(
      `/v1/pods/${encodeURIComponent(id)}/exec`,
      {
        method: "POST",
        body: JSON.stringify({ stream: true, ...input }),
      },
      "application/x-ndjson"
    );
    if (!res.body) {
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let chunk = await reader.read();
    try {
      while (!chunk.done) {
        buffer += decoder.decode(chunk.value, { stream: true });
        let newline: number = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            try {
              yield JSON.parse(line) as ExecEvent;
            } catch {
              // Skip malformed lines
            }
          }
          newline = buffer.indexOf("\n");
        }
        // biome-ignore lint/performance/noAwaitInLoops: streaming requires sequential reads
        chunk = await reader.read();
      }
      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer.trim()) as ExecEvent;
        } catch {
          // Ignore trailing incomplete line
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // -----------------------------------------------------------------------
  // Low-level request helpers
  // -----------------------------------------------------------------------

  private async request<T>(
    path: string,
    init: RequestInit,
    schema?: z.ZodType<T>
  ): Promise<T> {
    const res = await this.rawRequest(path, init, "application/json");

    const requestId = res.headers.get("x-request-id");

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        detail = res.statusText;
      }
      throw parseApiError(res.status, detail, requestId);
    }

    if (res.status === 204) {
      return undefined as T;
    }
    const text = await res.text();
    if (!text) {
      return undefined as T;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      throw new PodyardError("Invalid JSON response from Podyard API", {
        code: PodyardErrorCodes.INVALID_JSON,
        statusCode: 502,
        cause,
        public: { message: "Received an unexpected response from Podyard." },
      });
    }
    if (schema) {
      return validateResponse(schema, parsed, {
        endpoint: path.split("?")[0],
        requestId,
      });
    }
    return parsed as T;
  }

  private async rawRequest(
    path: string,
    init: RequestInit,
    accept: string
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this._fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          accept,
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (cause) {
      const isAbort = cause instanceof Error && cause.name === "AbortError";
      if (isAbort) {
        throw new PodyardError("Request timed out", {
          code: "gateway_timeout" as PodyardErrorCode,
          statusCode: 504,
          cause,
          public: {
            message:
              "The request to the Podyard API timed out. Please try again.",
          },
        });
      }
      throw new PodyardError("Network request failed", {
        code: PodyardErrorCodes.NETWORK_FAILURE,
        statusCode: 502,
        cause,
        public: {
          message: "Could not reach the Podyard API. Please try again.",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
    return response;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toQueryString(params: object): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) {
    return "";
  }
  const qs = entries
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");
  return `?${qs}`;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter((seg) => seg.length > 0)
    .map(encodeURIComponent)
    .join("/");
}

const ULID_PATTERN = `[${ULID}]{26}`;
const POD_ID_RE = new RegExp(`^pod_${ULID_PATTERN}$`, "u");
const SNAPSHOT_ID_RE = new RegExp(`^snap_${ULID_PATTERN}$`, "u");
const TEMPLATE_ID_RE = new RegExp(`^tpl_${ULID_PATTERN}$`, "u");

function assertPodId(id: string): boolean {
  if (!POD_ID_RE.test(id)) {
    throw new PodyardError(`Invalid pod ID: ${id}`, {
      code: "validation_failed" as PodyardErrorCode,
      statusCode: 422,
      public: {
        message: `Invalid pod ID: ${id}. Expected format: pod_<ULID>.`,
      },
    });
  }
  return true;
}

function assertSnapshotId(id: string): boolean {
  if (!SNAPSHOT_ID_RE.test(id)) {
    throw new PodyardError(`Invalid snapshot ID: ${id}`, {
      code: "validation_failed" as PodyardErrorCode,
      statusCode: 422,
      public: {
        message: `Invalid snapshot ID: ${id}. Expected format: snap_<ULID>.`,
      },
    });
  }
  return true;
}

function assertTemplateId(id: string): boolean {
  if (!TEMPLATE_ID_RE.test(id)) {
    throw new PodyardError(`Invalid template ID: ${id}`, {
      code: "validation_failed" as PodyardErrorCode,
      statusCode: 422,
      public: {
        message: `Invalid template ID: ${id}. Expected format: tpl_<ULID>.`,
      },
    });
  }
  return true;
}
