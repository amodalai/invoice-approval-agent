import { useState } from "react";
import { REQUESTERS } from "../amodal/_lib/examples.js";

export type Persona = { role: "approver" } | { role: "requester"; requester: string };

const KEY = "persona";
const APPROVER: Persona = { role: "approver" };

/** The persona's id in the switch and in the chat widget. */
export const personaId = (p: Persona) => (p.role === "approver" ? "approver" : p.requester);

export const personaFromId = (id: string): Persona =>
  (REQUESTERS as readonly string[]).includes(id) ? { role: "requester", requester: id } : APPROVER;

function loadPersona(): Persona {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "") as { role?: string; requester?: string };
    if (p.role === "requester" && p.requester) return personaFromId(p.requester);
  } catch {
    // No stored persona, or storage unavailable: start as the approver.
  }
  return APPROVER;
}

export function usePersona(): [Persona, (p: Persona) => void] {
  const [persona, set] = useState(loadPersona);
  return [
    persona,
    (p) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(p));
      } catch {
        // Storage unavailable: the choice lasts for this page load.
      }
      set(p);
    },
  ];
}
