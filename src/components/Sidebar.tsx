import type { ReactNode } from "react";
import type { Persona } from "../persona.js";
import { TABS, hashOf, type Route, type TabName } from "../routes.js";

const ICONS: Record<TabName, ReactNode> = {
  queue: (
    <>
      <path d="M3 13h5l2 3h4l2-3h5" />
      <path d="M5 5h14l2 8v6H3v-6z" />
    </>
  ),
  "purchase-orders": (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  policy: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  submit: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  mine: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
};

export function Sidebar({
  persona,
  route,
  counts,
  onSwitch,
  onReset,
}: {
  persona: Persona;
  route: Route;
  counts: Partial<Record<TabName, number>>;
  onSwitch: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <aside className="rail">
      <a className="brand" href={hashOf({ name: TABS[persona.role][0].name })}>
        <span className="brand__mark" aria-hidden="true">
          L
        </span>
        <span>
          <span className="brand__name">Larkspur Co.</span>
          <span className="brand__sub">Invoice approval</span>
        </span>
      </a>
      <nav className="nav" aria-label="Sections">
        {TABS[persona.role].map((t) => (
          <a key={t.name} className={`nav__item${route.name === t.name ? " active" : ""}`} href={hashOf({ name: t.name })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[t.name]}
            </svg>
            <span>{t.label}</span>
            {counts[t.name] ? <span className="nav__count">{counts[t.name]}</span> : null}
          </a>
        ))}
      </nav>
      <div className="rail__foot">
        <label className="persona">
          <span>Acting as</span>
          <select value={persona.role} onChange={(e) => onSwitch(e.target.value)}>
            <option value="approver">Approver (accounts payable)</option>
            <option value="requester">Requester</option>
          </select>
        </label>
        <button className="rail__reset" onClick={onReset}>
          Reset demo data
        </button>
      </div>
    </aside>
  );
}
