export type Role = "approver" | "requester";

export type Route =
  | { name: "queue" | "purchase-orders" | "history" | "policy" | "submit" | "mine" }
  | { name: "invoice"; id: string };

type TabName = Exclude<Route, { name: "invoice" }>["name"];

/** Each persona's tabs, first one is home. */
export const TABS: Record<Role, Array<{ name: TabName; label: string }>> = {
  approver: [
    { name: "queue", label: "Queue" },
    { name: "purchase-orders", label: "Purchase orders" },
    { name: "history", label: "History" },
    { name: "policy", label: "Policy" },
  ],
  requester: [
    { name: "submit", label: "Submit" },
    { name: "mine", label: "My invoices" },
  ],
};

export const hashOf = (route: Route) => (route.name === "invoice" ? `#/invoice/${encodeURIComponent(route.id)}` : `#/${route.name}`);

export function parseHash(hash: string): Route | undefined {
  const m = /^#\/([a-z-]+)(?:\/([^/]+))?$/.exec(hash);
  if (!m) return undefined;
  if (m[1] === "invoice") return m[2] ? { name: "invoice", id: decodeURIComponent(m[2]) } : undefined;
  const tab = [...TABS.approver, ...TABS.requester].find((t) => t.name === m[1]);
  return tab && !m[2] ? { name: tab.name } : undefined;
}

export const ownsRoute = (role: Role, route: Route) =>
  route.name === "invoice" || TABS[role].some((t) => t.name === route.name);

/** The persona's route for a hash; an unknown or foreign one redirects home. */
export function resolveRoute(role: Role, hash: string): { route: Route; redirect?: string } {
  const route = parseHash(hash);
  if (route && ownsRoute(role, route)) return { route };
  const home: Route = { name: TABS[role][0].name };
  return { route: home, redirect: hashOf(home) };
}
