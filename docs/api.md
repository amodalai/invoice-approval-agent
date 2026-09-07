# Invoice API

The deployed demo serves [OpenAPI 3.0.3](../public/openapi.json) at
`/openapi.json`. It describes four existing Amodal store reads:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/stores/invoices` | Saved invoices, with pagination and filtering |
| GET | `/api/stores/invoices/{key}` | One record by `invoice_id` |
| GET | `/api/stores/purchase_orders` | Saved purchase orders, with pagination and filtering |
| GET | `/api/stores/purchase_orders/{key}` | One record by `po_number` |

These operations read the same saved demo records as the app. They cannot
approve an invoice or move money. Open the deployed app once to load the examples before
querying them. An empty result means no matching records have been saved.

Each list returns `{documents, total, hasMore}`. Each document contains
`key`, `appId`, `store`, `version`, `payload`, and `meta`; the demo record is
inside `payload`. A single-record response is `{document, history}`.
`history` is empty unless the store retains previous versions.

`limit` defaults to 20 and `offset` defaults to 0. Increase `offset` by the
page size while `hasMore` is true. `filter` is a URL-encoded JSON object of
exact payload field matches. `sort` names a payload field; a `-` prefix
selects descending text order. Without `sort`, recently saved records come
first.

The routes read the agent's unscoped stores. The demo has no tenant scope.
Adding a `scope_id` query parameter does not change which rows are read.

## Call the deployed API

Use an `ak_` runtime API key for this agent, or a short-lived runtime token.
A platform automation token (`pk_`) is not a runtime credential. Signed-in
browsers can use the same-origin session cookie. A gated deployment also
requires authentication when downloading `/openapi.json`.

Set `INVOICE_API_URL` to the deployed agent origin, without a trailing slash,
and `INVOICE_API_KEY` to its runtime credential. Keep credentials out of source
files and browser build variables.

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $INVOICE_API_KEY" \
  "$INVOICE_API_URL/openapi.json" | jq '{openapi, paths: (.paths | keys)}'

curl --fail --silent --show-error --get \
  -H "Authorization: Bearer $INVOICE_API_KEY" \
  --data-urlencode 'filter={"status":"reviewed"}' \
  --data-urlencode 'limit=5' \
  "$INVOICE_API_URL/api/stores/invoices"

curl --fail --silent --show-error \
  -H "Authorization: Bearer $INVOICE_API_KEY" \
  "$INVOICE_API_URL/api/stores/invoices/inv_brightline_0417"
```

A missing record returns 404. Invalid filter JSON returns 400. Missing or
invalid runtime credentials return 401; a credential for another agent can
return 403. Store failures return 500. Without a bearer or session cookie,
a gated agent can redirect to login; that HTML is not an API response.

## Use this API from another Amodal agent

Set these environment variables on the consuming agent:

| Variable | Value |
| --- | --- |
| `INVOICE_API_URL` | The deployed demo origin |
| `INVOICE_OPENAPI_URL` | The same origin followed by `/openapi.json` |
| `INVOICE_API_KEY` | A runtime credential for the deployed demo |

Create `amodal/connections/demo/spec.json`:

```json
{
  "baseUrl": "env:INVOICE_API_URL",
  "openapi": {
    "source": "env:INVOICE_OPENAPI_URL",
    "exposure": "discovery"
  },
  "auth": { "type": "bearer", "token": "env:INVOICE_API_KEY" }
}
```

Create `amodal/connections/demo/policy.json` with `{"endpoints": {}}` and
add `"demo"` to the consuming agent's `connections` list in `agent.json`.
The explicit `baseUrl` configures runtime routing; the OpenAPI document's
relative server URL does not configure an Amodal connection.

Ask the consuming agent to list five invoices. It calls
`demo__discover` with `{"query":"list_invoices"}`, then calls
`demo__list_invoices` with `{"query":{"limit":5}}` on the next model reply.
It should report records from `documents[].payload` and check `hasMore`
before claiming a complete list. Failed reads mean the records could not be
checked.

The native connection sends its configured credential when fetching the
OpenAPI document on the API's origin. It caches URL documents for 60 seconds.
Use discovery's `refresh` option, or wait 60 seconds and start a fresh session
after changing the contract. A local UI build serves the document as a static asset, but the
store routes require an Amodal runtime at the configured API origin.

## Verify

```sh
npm test
npm run typecheck
npm run build
cmp public/openapi.json dist/openapi.json
```

The contract tests check the read-only paths, component references, store
field types, and seeded response payloads. Cloud's runtime implements the
routes; Vite copies `public/openapi.json` into the deployed UI artifact.
These local checks do not verify a live deployment. Run the authenticated
calls above against the deployed agent to verify its routing and credentials.
