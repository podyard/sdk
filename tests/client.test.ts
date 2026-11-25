import { describe, expect, it } from "vitest";
import { Podyard } from "../src/client";
import { PodyardError, PodyardErrorCodes } from "../src/errors";
import type { ListResponse, Pod, PodyardOptions } from "../src/types";

const jsonResponse = (
  body: unknown,
  init?: { status?: number; statusText?: string }
): Response =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
    headers: { "content-type": "application/json" },
  });

describe("Podyard constructor", () => {
  it("throws MISSING_API_KEY when the key is absent", () => {
    const construct = () => new Podyard({} as PodyardOptions);
    expect(construct).toThrowError(PodyardError);

    let caught: unknown;
    try {
      construct();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PodyardError);
    expect((caught as PodyardError).code).toBe(
      PodyardErrorCodes.MISSING_API_KEY
    );
    expect((caught as PodyardError).scope).toBe("podyard");
  });

  it("strips a trailing slash from the base URL", () => {
    const client = new Podyard({
      apiKey: "pyd_test_key",
      baseUrl: "https://api.example.com/",
    });

    expect(client.baseUrl).toBe("https://api.example.com");
  });

  it("falls back to the default base URL", () => {
    const client = new Podyard({ apiKey: "pyd_test_key" });

    expect(client.baseUrl).toBe("https://api.podyard.dev");
  });
});

describe("Podyard.fromEnv", () => {
  it("throws MISSING_API_KEY when PODYARD_API_KEY is unset", () => {
    try {
      Podyard.fromEnv({} as NodeJS.ProcessEnv);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as PodyardError).code).toBe(
        PodyardErrorCodes.MISSING_API_KEY
      );
    }
  });

  it("reads the key from the provided env", () => {
    const client = Podyard.fromEnv({
      PODYARD_API_KEY: "pyd_test_env",
    } as NodeJS.ProcessEnv);

    expect(client.apiKey).toBe("pyd_test_env");
  });
});

describe("Podyard.request", () => {
  it("throws NETWORK_FAILURE when fetch rejects", async () => {
    const client = new Podyard({
      apiKey: "pyd_test_key",
      fetch: (() => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });

    await expect(client.pods.list()).rejects.toThrowError(PodyardError);

    try {
      await client.pods.list();
    } catch (error) {
      expect((error as PodyardError).code).toBe(
        PodyardErrorCodes.NETWORK_FAILURE
      );
      expect((error as PodyardError).statusCode).toBe(502);
    }
  });

  const apiCase = (
    status: number,
    expectedCode: (typeof PodyardErrorCodes)[keyof typeof PodyardErrorCodes]
  ) => {
    it(`maps ${status} to ${expectedCode}`, async () => {
      const client = new Podyard({
        apiKey: "pyd_test_key",
        fetch: (async () =>
          jsonResponse({ error: "nope" }, { status })) as typeof fetch,
      });

      try {
        await client.pods.list();
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as PodyardError).code).toBe(expectedCode);
        expect((error as PodyardError).statusCode).toBe(status);
      }
    });
  };

  apiCase(401, PodyardErrorCodes.AUTH_FAILED);
  apiCase(403, PodyardErrorCodes.AUTH_FAILED);
  apiCase(404, PodyardErrorCodes.NOT_FOUND);
  apiCase(429, PodyardErrorCodes.RATE_LIMITED);
  apiCase(500, PodyardErrorCodes.API_ERROR);

  it("throws INVALID_JSON for a malformed 200 body", async () => {
    const client = new Podyard({
      apiKey: "pyd_test_key",
      fetch: (async () =>
        new Response("<html>not json</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })) as typeof fetch,
    });

    try {
      await client.pods.list();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as PodyardError).code).toBe(PodyardErrorCodes.INVALID_JSON);
    }
  });

  it("returns the pod list from a 200 list call", async () => {
    const pods: ListResponse<Pod> = {
      items: [
        {
          id: "pod_01",
          name: "test",
          status: "running",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      nextCursor: null,
    };
    const client = new Podyard({
      apiKey: "pyd_test_key",
      fetch: (async () => jsonResponse(pods)) as typeof fetch,
    });

    await expect(client.pods.list()).resolves.toEqual(pods);
  });
});
