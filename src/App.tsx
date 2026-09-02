import { useEffect, useRef, useState } from "react";
import { ChatWidget, useAmodalContext, useStoreQuery, useToolRun } from "@amodalai/react";
import { REQUESTERS } from "../amodal/_lib/examples.js";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { personaFromId, personaId, usePersona } from "./persona.js";
import { TABS, hashOf, resolveRoute, type Role, type Route } from "./routes.js";
import { Queue } from "./screens/Queue.js";
import { errorMessage, runTool } from "./tools.js";
import type { Data, EventRow, InvoiceRow, PORow, ReviewRow } from "./types.js";

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

function Screen({ route, data }: { route: Route; data: Data }) {
  switch (route.name) {
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

  return (
    <div className="page">
      <header className="head">
        <div className="head__bar">
          <h1>Invoice Approval</h1>
          <div className="head__actions">
            <label className="persona">
              <span>Acting as</span>
              <select value={personaId(persona)} onChange={(e) => switchPersona(e.target.value)}>
                <option value="approver">Approver</option>
                {REQUESTERS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <details className="menu">
              <summary aria-label="More actions">⋯</summary>
              <button className="menu__item" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); setResetError(undefined); setConfirmReset(true); }}>
                Reset demo data
              </button>
            </details>
          </div>
        </div>
        <nav className="tabs">
          {TABS[persona.role].map((t) => (
            <a key={t.name} className={`tab${route.name === t.name ? " active" : ""}`} href={hashOf({ name: t.name })}>
              {t.label}
            </a>
          ))}
        </nav>
        {seedError ? (
          <div className="banner error">
            {seedError}{" "}
            <button className="btn btn--ghost" onClick={() => void runSeed()}>
              Retry
            </button>
          </div>
        ) : null}
      </header>

      {invoicesQ.isLoading ? (
        <div className="empty">Loading…</div>
      ) : seed.status === "running" ? (
        <div className="empty">Loading the demo…</div>
      ) : (
        <Screen route={route} data={data} />
      )}

      <footer className="foot">
        Fictional demo. Vendors, invoices, purchase orders, and the spend policy are made up. The agent assists; a
        human decides.
      </footer>

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
        user={{ id: personaId(persona) }}
        getToken={async () => ""}
        agent="default"
        theme={{ primaryColor: "#000000", mode: "light" }}
        onStreamEnd={() => {
          void data.refetch();
        }}
      />
    </div>
  );
}
