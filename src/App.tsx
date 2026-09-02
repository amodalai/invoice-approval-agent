import { useEffect, useRef, useState } from "react";
import { ChatWidget, useAmodalContext, useStoreQuery, useToolRun } from "@amodalai/react";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { Sidebar } from "./components/Sidebar.js";
import { personaFromId, usePersona, type Persona } from "./persona.js";
import { TABS, hashOf, resolveRoute, type Role, type Route } from "./routes.js";
import { History } from "./screens/History.js";
import { InvoiceDetail } from "./screens/InvoiceDetail.js";
import { MyInvoices } from "./screens/MyInvoices.js";
import { Policy } from "./screens/Policy.js";
import { PurchaseOrders } from "./screens/PurchaseOrders.js";
import { Queue } from "./screens/Queue.js";
import { Submit } from "./screens/Submit.js";
import { errorMessage, runTool } from "./tools.js";
import { isDecided, type Data, type EventRow, type InvoiceRow, type PORow, type ReviewRow } from "./types.js";

function useHashRoute(role: Role): Route {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  const { route, redirect } = resolveRoute(role, hash);
  useEffect(() => {
    if (redirect) location.hash = redirect;
  }, [redirect]);
  return route;
}

function Screen({ route, data, persona }: { route: Route; data: Data; persona: Persona }) {
  const requester = persona.role === "requester";
  switch (route.name) {
    case "invoice":
      return <InvoiceDetail id={route.id} data={data} requester={requester} />;
    case "submit":
      return <Submit data={data} />;
    case "mine":
      return <MyInvoices data={data} />;
    case "purchase-orders":
      return <PurchaseOrders data={data} />;
    case "history":
      return <History data={data} />;
    case "policy":
      return <Policy />;
    default:
      return <Queue data={data} />;
  }
}

export default function App() {
  const { runtimeUrl } = useAmodalContext();
  const [persona, setPersona] = usePersona();
  const route = useHashRoute(persona.role);
  const invoicesQ = useStoreQuery<InvoiceRow>("invoices", { limit: 1000 });
  const posQ = useStoreQuery<PORow>("purchase_orders", { limit: 1000 });
  const reviewsQ = useStoreQuery<ReviewRow>("reviews", { limit: 1000 });
  const eventsQ = useStoreQuery<EventRow>("events", { limit: 1000 });
  const seed = useToolRun("seed_examples");
  const reset = useToolRun("reset_demo");
  const seededRef = useRef(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>();

  const reviews = new Map<string, ReviewRow[]>();
  for (const { value } of reviewsQ.data ?? []) reviews.set(value.invoice_id, [...(reviews.get(value.invoice_id) ?? []), value]);
  for (const list of reviews.values()) list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const data: Data = {
    invoices: (invoicesQ.data ?? []).map((r) => r.value),
    pos: new Map((posQ.data ?? []).map((r) => [r.value.po_number, r.value])),
    reviews,
    events: (eventsQ.data ?? []).map((r) => r.value).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    refetch: async () => {
      await Promise.all([invoicesQ.refetch(), posQ.refetch(), reviewsQ.refetch(), eventsQ.refetch()]);
    },
  };

  async function runSeed() {
    setSeedError(null);
    try {
      await runTool(seed, {});
      await data.refetch();
    } catch (err) {
      setSeedError(errorMessage(err, "Loading the demo failed."));
    }
  }

  const empty = !invoicesQ.isLoading && !invoicesQ.error && data.invoices.length === 0;
  useEffect(() => {
    if (!empty || seededRef.current) return;
    seededRef.current = true;
    void runSeed();
  }, [empty]);

  async function onReset() {
    setResetting(true);
    setResetError(undefined);
    try {
      await runTool(reset, {});
      await data.refetch();
      setConfirmReset(false);
    } catch (err) {
      setResetError(errorMessage(err, "The reset failed."));
    } finally {
      setResetting(false);
    }
  }

  function switchPersona(id: string) {
    const next = personaFromId(id);
    setPersona(next);
    location.hash = hashOf({ name: TABS[next.role][0].name });
  }

  const counts =
    persona.role === "requester"
      ? { mine: data.invoices.filter((i) => i.status === "returned").length }
      : { queue: data.invoices.filter((i) => !isDecided(i)).length };

  return (
    <div className="app">
      <Sidebar
        persona={persona}
        route={route}
        counts={counts}
        onSwitch={switchPersona}
        onReset={() => {
          setResetError(undefined);
          setConfirmReset(true);
        }}
      />
      <main className="page">
        {seedError ? (
          <div className="banner error">
            {seedError}{" "}
            <button className="btn btn--ghost" onClick={() => void runSeed()}>
              Retry
            </button>
          </div>
        ) : null}

        {invoicesQ.isLoading ? (
          <div className="empty">Loading…</div>
        ) : seed.status === "running" ? (
          <div className="empty">Loading the demo…</div>
        ) : (
          <Screen route={route} data={data} persona={persona} />
        )}

        <footer className="foot">
          Fictional demo. Vendors, invoices, purchase orders, and the spend policy are made up. The agent assists; a
          human decides.
        </footer>
      </main>

      {confirmReset ? (
        <ConfirmModal
          title="Reset demo data"
          confirmLabel="Reset"
          busy={resetting}
          error={resetError}
          onConfirm={() => void onReset()}
          onCancel={() => setConfirmReset(false)}
        >
          <p className="sub">This deletes every invoice, purchase order, review, and event and reloads the demo. Continue?</p>
        </ConfirmModal>
      ) : null}

      <ChatWidget
        position="floating"
        serverUrl={runtimeUrl}
        user={{ id: persona.role }}
        getToken={async () => ""}
        agent="default"
        theme={{ primaryColor: "#1f4f9c", mode: "light" }}
        onStreamEnd={() => {
          void data.refetch();
        }}
      />
    </div>
  );
}
