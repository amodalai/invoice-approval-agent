import { useState } from "react";
import type { Role } from "./routes.js";

export type Persona = { role: Role };

const KEY = "persona";
const APPROVER: Persona = { role: "approver" };

export const personaFromId = (id: string): Persona => (id === "requester" ? { role: "requester" } : APPROVER);

function loadPersona(): Persona {
  try {
    return personaFromId((JSON.parse(localStorage.getItem(KEY) ?? "") as { role?: string }).role ?? "");
  } catch {
    return APPROVER;
  }
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
