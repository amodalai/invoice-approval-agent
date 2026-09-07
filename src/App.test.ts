import assert from "node:assert/strict";
import { test } from "node:test";
import { hooks, jsxRuntime, loadUI, walk } from "../tests/ui.js";
import * as routes from "./routes.js";
import * as tools from "./tools.js";
import * as types from "./types.js";

function render(overrides: Record<string, unknown> = {}) {
  Object.assign(globalThis, { location: { hash: "#/inbox" } });
  const state = hooks();
  const modules: Record<string, unknown> = {
    react: { ...state.react, useRef: () => ({ current: false }), useEffect() {} },
    "react/jsx-runtime": jsxRuntime,
    "@amodalai/react": {
      ChatWidget: () => null,
      useAmodalContext: () => ({ runtimeUrl: "" }),
      useStoreQuery: (name: string) => ({
        data: name === "invoices" ? [{ value: { invoice_id: "inv_1", status: "new" } }] : [],
        isLoading: false,
        refetch: async () => {},
        ...(overrides[name] as object ?? {}),
      }),
      useToolRun: () => ({ status: "idle" }),
    },
    "./persona.js": { usePersona: () => [{ role: "approver" }, () => {}] },
    "./routes.js": routes, "./tools.js": tools, "./types.js": types,
  };
  for (const [folder, names] of Object.entries({ components: ["ConfirmModal", "Sidebar"], screens: ["History", "InvoiceDetail", "MyInvoices", "Policy", "PurchaseOrders", "Inbox", "Submit"] })) {
    for (const name of names) modules[`./${folder}/${name}.js`] = { [name]: () => null };
  }
  const App = loadUI(new URL("./App.tsx", import.meta.url), modules).default;
  return walk(App());
}

const screen = (elements: ReturnType<typeof render>) => elements.find((el) => el.props.data);

test("loaded stores reach the invoice screen", () => {
  const view = screen(render());
  assert.equal(view?.props.data.invoices[0].invoice_id, "inv_1");
});

test("a background refresh keeps the active review screen mounted", () => {
  assert.ok(screen(render({ purchase_orders: { isLoading: true } })));
});

for (const store of ["invoices", "purchase_orders", "reviews", "events"]) {
  test(`a ${store} read failure is visible and cannot look like an empty demo`, () => {
    const elements = render({ [store]: { error: new Error("Connection lost") } });
    assert.equal(screen(elements), undefined);
    assert.ok(elements.some((el) => el.props.role === "alert"));
    assert.ok(elements.some((el) => el.type === "button" && el.props.children === "Retry"));
  });

  test(`waits for ${store} before showing decision data`, () => {
    const elements = render({ [store]: { data: undefined, isLoading: true } });
    assert.equal(screen(elements), undefined);
    assert.ok(elements.some((el) => el.props.role === "status"));
  });
}
