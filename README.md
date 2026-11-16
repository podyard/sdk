![Podyard](banner.jpg)

# Podyard SDK

TypeScript SDK for Podyard sandboxes with a simple, typed API.

## Install

```bash
npm install @podyard/sdk
```

## Quick start

```ts
import { Podyard } from "@podyard/sdk";

const client = Podyard.fromEnv(); // uses PODYARD_API_KEY and optional PODYARD_BASE_URL

const sandboxes = await client.sandboxes.list();
const sandbox = await client.sandboxes.create({ template: "node" });
```

## Configuration

- `PODYARD_API_KEY` (required)
- `PODYARD_BASE_URL` (optional, defaults to `https://api.podyard.com`)

## API

### Construction

- `new Podyard({ apiKey, baseUrl?, fetch? })`
- `Podyard.fromEnv()`

### Pods

- `client.pods.list(params?)` — list pods with optional filters and pagination
- `client.pods.create(input)` — create a new pod from a template
- `client.pods.get(id)` — get a pod by ID
- `client.pods.exec(id, input, onEvent?)` — exec a command inside a pod; pass a `stream` option and `onEvent` callback for real-time output
- `client.pods.snapshot(id, input?)` — create a snapshot of a pod
- `client.pods.listSnapshots(id, params?)` — list snapshots for a pod
- `client.pods.fork(id, input)` — fork a pod from a snapshot
- `client.pods.sleep(id)` — put a pod to sleep
- `client.pods.wake(id)` — wake a sleeping pod

### Snapshots

- `client.snapshots.get(id)` — get a snapshot by ID
- `client.snapshots.fork(id, input)` — fork a snapshot into a new pod

### Templates

- `client.templates.list(params?)` — list available templates
- `client.templates.create(input)` — create a custom template
- `client.templates.get(id)` — get a template by ID

### Usage

- `client.usage.list(params?)` — list usage events with optional date range and pod filters

### Limits & Plans

- `client.limits.get()` — get plan limits and current usage

### Webhooks

- `client.webhooks.list(params?)` — list registered webhooks
- `client.webhooks.create(input)` — register a new webhook
- `client.webhooks.get(id)` — get a webhook by ID

### API Keys

- `client.keys.list(params?)` — list API keys
- `client.keys.create(input)` — create a new API key

### Filesystem

- `client.fs.read(id, path)` — read a file from a pod's filesystem
- `client.fs.write(id, path, data)` — write a file to a pod's filesystem

### Exec streaming example

```ts
import { Podyard } from "@podyard/sdk";

const client = Podyard.fromEnv();

const pod = await client.pods.create({ template: "node", name: "my-pod" });

// Stream exec output in real time
await client.pods.exec(
  pod.id,
  {
    command: ["node", "app.js"],
    stream: true,
  },
  (event) => {
    if (event.type === "stdout") {
      process.stdout.write(event.data);
    }
  },
);
```

## Errors

All failures thrown by the SDK are instances of `PodyardError`, which extends
`FrontalError` from [`@frontal-labs/error`](https://www.npmjs.com/package/@frontal-labs/error).
Every error carries:

- **`scope`** — always `"podyard"`.
- **`code`** — a stable string from `PodyardErrorCodes`. Branch on this, never
  on message text.
- **`message`** — developer-facing detail (e.g. `"fetch failed: ECONNREFUSED"`).
  Never sent to clients.
- **`public.message`** — approved client-facing text. This is what reaches end
  users via HTTP responses or UI error boundaries.

### Error codes

| Code                  | Meaning                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `missing_api_key`     | `PODYARD_API_KEY` is absent                                            |
| `network_failure`     | The underlying `fetch` rejected                                        |
| `api_error`           | The API returned an unexpected non-2xx response                        |
| `invalid_json`        | The response body could not be parsed as JSON                          |
| `auth_failed`         | The API returned 401 or 403                                            |
| `rate_limited`        | The API returned 429                                                   |
| `not_found`           | The API returned 404                                                   |
| `sandbox_not_found`   | A specific sandbox resource was not found                              |
| `sandbox_unavailable` | A specific sandbox resource is in an unavailable state                 |
| `invalid_response`    | The API returned a well-formed JSON body that failed schema validation |

### Handling errors

```ts
import { PodyardError, PodyardErrorCodes } from "@podyard/sdk";

try {
  const sandboxes = await client.sandboxes.list();
} catch (error) {
  if (error instanceof PodyardError) {
    switch (error.code) {
      case PodyardErrorCodes.RATE_LIMITED:
        // back off and retry
        break;
      case PodyardErrorCodes.NETWORK_FAILURE:
        // show error.public.message to the user
        break;
    }
  }
}
```

### Building custom errors

`PodyardError` can be thrown directly when you need to raise an SDK-scoped
error from your own code:

```ts
import { PodyardError, PodyardErrorCodes } from "@podyard/sdk";

throw new PodyardError("Sandbox sbx_123 is in a failed state", {
  code: PodyardErrorCodes.SANDBOX_UNAVAILABLE,
  statusCode: 503,
  public: {
    message: "The sandbox is temporarily unavailable.",
    hint: "Try again in a few seconds.",
  },
});
```

## Scripts

| Script                         | What it does                                     |
| ------------------------------ | ------------------------------------------------ |
| `pnpm build`                   | Bundle ESM + `.d.ts` with tsup into `dist/`      |
| `pnpm typecheck`               | `tsc --noEmit`                                   |
| `pnpm test`                    | Vitest (Node env)                                |
| `pnpm test:coverage`           | Vitest with coverage report                      |
| `pnpm lint`                    | Biome (lint + import ordering)                   |
| `pnpm format` / `format:check` | Prettier (writes / verifies)                     |
| `pnpm check`                   | typecheck → lint → format:check → test (CI gate) |

## Requirements

- Node.js >= 22
- pnpm >= 10
