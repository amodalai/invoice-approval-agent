export interface LineDraft {
  description: string;
  quantity: string;
  unit_price_usd: string;
}

export const emptyLine = (): LineDraft => ({ description: "", quantity: "1", unit_price_usd: "" });

export const lineAmount = (l: LineDraft) => (Number(l.quantity) || 0) * (Number(l.unit_price_usd) || 0);

export function LineItemsEditor({ lines, onChange }: { lines: LineDraft[]; onChange: (lines: LineDraft[]) => void }) {
  const update = (i: number, patch: Partial<LineDraft>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <table className="grid grid--compact lines">
      <thead>
        <tr>
          <th>Description</th>
          <th className="num">Qty</th>
          <th className="num">Unit price</th>
          <th className="num">Amount</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td>
              <input value={l.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="What was delivered" />
            </td>
            <td className="num">
              <input type="number" min="0" step="any" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
            </td>
            <td className="num">
              <input type="number" min="0" step="0.01" value={l.unit_price_usd} onChange={(e) => update(i, { unit_price_usd: e.target.value })} />
            </td>
            <td className="num">{lineAmount(l).toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>
            <td className="act">
              <button type="button" className="btn btn--ghost" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                Remove
              </button>
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={5}>
            <button type="button" className="btn btn--ghost" onClick={() => onChange([...lines, emptyLine()])}>
              Add line
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
