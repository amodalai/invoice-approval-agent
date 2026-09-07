import { useEffect, useState } from "react";
import type { Step } from "../steps.js";

const REVEAL_MS = 450;

/** The review's steps, revealed one at a time; the pending one keeps a spinner until the run resolves. */
export function ReviewSteps({ steps }: { steps: Step[] }) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (shown >= steps.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), REVEAL_MS);
    return () => clearTimeout(t);
  }, [shown, steps.length]);
  return (
    <ol className="steps" aria-live="polite">
      {steps.slice(0, shown).map((s) => (
        <li key={s.label} className={`step step--${s.status}`}>
          {s.label}
          {s.status === "pending" ? "…" : ""}
        </li>
      ))}
    </ol>
  );
}
