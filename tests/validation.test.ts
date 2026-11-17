import { isFrontalError } from "@frontal-labs/error";
import { describe, expect, it } from "vitest";
import { PodyardErrorCodes } from "../src/errors";
import {
  isoTimestamp,
  listResponseSchema,
  podSchema,
  snapshotSchema,
  validateResponse,
} from "../src/validation";

const VALID_POD = {
  createdAt: "2026-01-01T00:00:00.000Z",
  destroyedAt: null,
  id: "pod_01J9X7Z0000000000000000000",
  lastActivityAt: null,
  metadata: { region: "us-east-1" },
  name: "worker",
  status: "running",
  templateId: null,
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("isoTimestamp", () => {
  it("accepts a valid ISO-8601 timestamp", () => {
    expect(isoTimestamp.safeParse("2026-01-01T00:00:00.000Z").success).toBe(
      true
    );
  });

  it("rejects a non-timestamp string", () => {
    expect(isoTimestamp.safeParse("not-a-date").success).toBe(false);
  });
});

describe("validateResponse", () => {
  it("returns the validated value on success", () => {
    const result = validateResponse(podSchema, VALID_POD, {
      endpoint: "GET /v1/pods/:id",
      requestId: "req_1",
    });
    expect(result).toEqual(VALID_POD);
  });

  it("throws a PodyardError with the invalid_response code on failure", () => {
    expect(() =>
      validateResponse(
        podSchema,
        { ...VALID_POD, status: "flying" },
        {
          endpoint: "GET /v1/pods/:id",
          requestId: "req_2",
        }
      )
    ).toThrowError();

    try {
      validateResponse(
        podSchema,
        { ...VALID_POD, status: "flying" },
        {
          endpoint: "GET /v1/pods/:id",
          requestId: "req_2",
        }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(isFrontalError(err)).toBe(true);
      expect((err as Error & { code: string }).code).toBe(
        PodyardErrorCodes.INVALID_RESPONSE
      );
      expect((err as Error & { statusCode: number }).statusCode).toBe(502);
      expect((err as Error & { requestId?: string }).requestId).toBe("req_2");
    }
  });

  it("names the endpoint in the developer message", () => {
    try {
      validateResponse(
        podSchema,
        { id: "" },
        {
          endpoint: "GET /v1/pods/:id",
          requestId: "req_3",
        }
      );
      expect.unreachable("expected validateResponse to throw");
    } catch (err) {
      expect((err as Error).message).toContain("GET /v1/pods/:id");
    }
  });

  it("reports which field failed", () => {
    try {
      validateResponse(
        podSchema,
        { ...VALID_POD, status: "flying" },
        {
          endpoint: "GET /v1/pods/:id",
          requestId: "req_4",
        }
      );
      expect.unreachable("expected validateResponse to throw");
    } catch (err) {
      expect((err as Error).message).toContain("status");
    }
  });
});

describe("schema coverage", () => {
  it("validates a snapshot", () => {
    expect(
      snapshotSchema.safeParse({
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "snap_1",
        name: "nightly",
        podId: "pod_1",
        retained: true,
        sizeBytes: 1024,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }).success
    ).toBe(true);
  });

  it("validates a list envelope through listResponseSchema", () => {
    const schema = listResponseSchema(podSchema);
    expect(
      schema.safeParse({
        hasMore: false,
        items: [VALID_POD],
        next: null,
      }).success
    ).toBe(true);
  });

  it("still accepts payloads that carry extra fields", () => {
    // zod v4 objects strip unknown keys, but validation must not *fail* when
    // the API adds a field the SDK has not modeled yet.
    expect(
      podSchema.safeParse({ ...VALID_POD, extra: "new-field" }).success
    ).toBe(true);
  });
});
