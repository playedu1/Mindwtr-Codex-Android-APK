# Mindwtr Codex companion

Small private HTTP bridge for Mindwtr's `clarify`, `breakdown`, `review`, and `metadata` AI operations. It invokes the official [`@openai/codex-sdk`](https://github.com/openai/codex/tree/main/sdk/typescript) using the local Codex CLI's ChatGPT sign-in. It does not connect to Mindwtr storage or receive task database files; each request contains only the operation input.

The modified Android app shows **Settings → AI → Codex companion (Android)**. Install a build of this fork, start this service on a computer that stays on, sign in there with `codex login`, and enter the HTTPS URL and token in the app. Turn on both the AI assistant and the companion, then tap **Test connection**. A `workflow_dispatch` GitHub Actions workflow at `.github/workflows/codex-android-apk.yml` builds a bundled arm64 APK of the separate **Mindwtr Dev** variant. Download its artifact from your fork's Actions page; this variant has its own local data and does not replace the store app. The generated signing key changes across fresh CI builds, so later APKs may require uninstalling the previous development build unless you configure a persistent signing key.

## Requirements and setup

- Node.js 18 or newer
- Codex CLI installed and signed in with the account you want to use
- A random bearer token shared only with the trusted Mindwtr client

If needed, install the CLI and sign in as the same OS user that will run this service:

```sh
npm install --global @openai/codex
codex login
```

From this directory:

```sh
npm install --workspaces=false
export MINDWTR_CODEX_TOKEN="$(openssl rand -hex 32)"
npm start
```

The service listens on `127.0.0.1:8787` by default. Keep the token in a secret manager or local environment file excluded from source control. Do not place it in a URL, log, screenshot, or client-side app bundle. The supplied task input is sent through the user's signed-in Codex account and handled by the local Codex CLI; do not include content you do not want processed that way.

## HTTP API

`GET /healthz` returns `{"status":"ok"}` and does not require authentication.

`POST /v1/operations` requires `Authorization: Bearer <token>` and JSON content type:

```json
{
  "kind": "breakdown",
  "input": {
    "title": "Prepare the garden for spring",
    "description": "Plan the work and order supplies"
  }
}
```

Success returns `{"result":{"steps":[...]}}`. The other `kind` values and input/result fields follow the `ClarifyInput`/`ClarifyResponse`, `BreakdownInput`/`BreakdownResponse`, `ReviewAnalysisInput`/`ReviewAnalysisResponse`, and `CopilotInput`/`CopilotResponse` contracts in `packages/core/src/ai/types.ts`. Invalid input returns a 4xx JSON error; overload, timeout, and model failures return a generic error without forwarding exception details.

Example:

```sh
curl http://127.0.0.1:8787/v1/operations \
  -H "Authorization: Bearer $MINDWTR_CODEX_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"metadata","input":{"title":"Draft a project update","contexts":["@desk"],"tags":["#work"]}}'
```

## Private network access

Loopback is the intended default. For a phone or another device to reach this machine, use a private network path and TLS. Set `MINDWTR_CODEX_HOST` to a specific private interface IP (or `0.0.0.0` only when firewall rules restrict ingress), then place an HTTPS reverse proxy or private VPN in front of the service. Terminate TLS at the proxy and forward requests to the loopback listener where possible. Configure the client with the HTTPS proxy address, never a plaintext LAN address.

Example environment values:

```sh
MINDWTR_CODEX_HOST=192.168.1.20
MINDWTR_CODEX_PORT=8787
MINDWTR_CODEX_TOKEN=<long-random-secret>
```

Do not expose the port directly to the public internet, disable bearer authentication, or use a token over untrusted/plaintext networking. Keep the firewall limited to trusted private devices. The service itself does not terminate TLS.

## Security behavior

- Every operation except `/healthz` requires exact bearer-token authentication.
- Requests are capped at 64 KiB, calls time out after 45 seconds, and no more than two run concurrently.
- The SDK receives only a small environment allowlist needed to find the local CLI and its sign-in. The user's API keys and unrelated environment variables are not forwarded.
- Every turn uses a fresh thread and a newly-created empty temporary working directory. Codex is configured for `read-only`, no network access, no approval prompts, and disabled shell, web search, apps, plugins, browser, and multi-agent features; the prompt also forbids tool use. The task JSON is treated as untrusted content.
- Codex conversation history persistence is disabled in the CLI configuration. The CLI may still maintain runtime/session state required to execute a turn in its normal Codex home.
- The response uses per-operation structured output schemas and a final shape check. Errors and server logs never include the bearer token or raw SDK errors.

The Codex CLI remains a local executable and must be installed for the same user that runs this service. Review the CLI's current sandbox and authentication behavior before changing the SDK options.

## Tests

```sh
npm test
```

Tests inject a mock Codex client, so they do not need a signed-in CLI or make model calls.
