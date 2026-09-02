import type { ReviewRow } from "../types.js";

/** A review's summary, four checks, and issues. */
export function ReviewBody({ review }: { review: ReviewRow }) {
  return (
    <div className="review">
      <p>{review.summary}</p>
      {review.checks?.length ? (
        <table className="grid grid--compact">
          <tbody>
            {review.checks.map((c) => (
              <tr key={c.name}>
                <td className="check-name">{c.name}</td>
                <td>
                  <span className={`pill check-${c.status}`}>{c.status}</span>
                </td>
                <td>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {review.issues.length ? (
        <ul className="issue-list">
          {review.issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : (
        <p className="sub">No issues.</p>
      )}
    </div>
  );
}
