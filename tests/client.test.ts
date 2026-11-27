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

describe("opaque server-issued IDs", () => {
  // Regression: live pod IDs are wider than Crockford ULIDs (they contain
  // letters like I, L and U), e.g. pod_MWZ29Z9LJANIDID9UGVA7AAAAA.
  // The SDK must treat IDs as opaque and pass them through verbatim instead
  // of rejecting them client-side.
  const LIVE_POD_ID = "pod_MWZ29Z9LJANIDID9UGVA7AAAAA";
  const LIVE_SNAPSHOT_ID = "snap_MWZ29Z9LJANIDID9UGVA7AAAAA";

  const stubFetch = (body: unknown) =>
    (async () => jsonResponse(body)) as typeof fetch;

  it("accepts a pod ID containing I, L, U and forwards it verbatim", async () => {
    let requested = "";
    const body = jsonResponse({
      id: LIVE_POD_ID,
      name: "demo",
      status: "running",
      createdAt: "2026-01-01T00:00:00Z",
    });
    const client = new Podyard({
      apiKey: "pyd_test_key",
      fetch: ((url: string | URL | RequestInfo) => {
        requested = String(url);
        return body;
      }) as typeof fetch,
    });

    const pod = await client.pods.get(LIVE_POD_ID);
    expect(pod.id).toBe(LIVE_POD_ID);
    expect(requested).toContain(`/v1/pods/${LIVE_POD_ID}`);
  });

  it("rejects a pod ID with an obviously invalid shape", () => {
    const client = new Podyard({
      apiKey: "pyd_test_key",
      fetch: stubFetch({}) as typeof fetch,
    });

    // The ID shape check is a client-side guard, so it throws synchronously
    // before any network call.
    let caught: unknown;
    try {
      client.pods.get("not-a-pod-id");
      expect.unreachable("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PodyardError);
    expect((caught as PodyardError).code).toBe(
      PodyardErrorCodes.VALIDATION_FAILED
    );
    expect((caught as PodyardError).scope).toBe("podyard");
  });

  it("accepts a snapshot ID containing I, L, U", async () => {
    const client = new Podyard({
      apiKey: "pyd_test_key",
      fetch: stubFetch({
        id: LIVE_SNAPSHOT_ID,
        name: "nightly",
        podId: LIVE_POD_ID,
        createdAt: "2026-01-01T00:00:00Z",
      }) as typeof fetch,
    });

    const snap = await client.snapshots.get(LIVE_SNAPSHOT_ID);
    expect(snap.id).toBe(LIVE_SNAPSHOT_ID);
  });
});
