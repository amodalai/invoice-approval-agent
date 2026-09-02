import { FormattedMarkdown } from "@amodalai/react";
import spendPolicy from "../../amodal/knowledge/spend-policy.md?raw";
import { POLICY } from "../../amodal/_lib/policy.js";
import { usd } from "../types.js";

export function Policy() {
  return (
    <section>
      <div className="screen__bar">
        <div>
          <h2>Policy</h2>
          <p className="sub">The thresholds the code enforces, then the policy text the reviewer subagent reads.</p>
        </div>
      </div>
      <table className="grid grid--compact">
        <tbody>
          <tr>
            <td>Purchase order required above</td>
            <td className="num">{usd(POLICY.no_po_limit_usd)}</td>
          </tr>
          <tr>
            <td>Amount tolerance</td>
            <td className="num">
              {POLICY.tolerance_pct * 100}% of the remaining balance, or {usd(POLICY.tolerance_min_usd)}, whichever is larger
            </td>
          </tr>
          <tr>
            <td>Controller sign-off above</td>
            <td className="num">{usd(POLICY.controller_limit_usd)}</td>
          </tr>
        </tbody>
      </table>
      <p className="sub">
        The <code>approval-guard</code> hook enforces the hard rules for every writer, the chat agent included. The values
        live in <code>amodal/_lib/policy.ts</code>, <code>hooks/approval-guard/hook.json</code>, and{" "}
        <code>amodal/knowledge/spend-policy.md</code>: change one, change all three, then redeploy.
      </p>
      <section className="card">
        <FormattedMarkdown className="policy__body">{spendPolicy}</FormattedMarkdown>
      </section>
    </section>
  );
}
