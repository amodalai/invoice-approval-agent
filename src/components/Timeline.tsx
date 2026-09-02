import { REC_LABEL, when, type EventRow, type ReviewRow } from "../types.js";
import { ReviewBody } from "./ReviewBody.js";

export const KIND_LABEL: Record<EventRow["kind"], string> = {
  seeded: "Seeded",
  submitted: "Submitted",
  resubmitted: "Resubmitted",
  reviewed: "Reviewed",
  returned: "Returned",
  approved: "Approved",
  rejected: "Rejected",
  reset: "Reset",
};

/** The review a `reviewed` event recorded: the newest one written at or before it. */
export const reviewFor = (e: EventRow, reviews: ReviewRow[]) =>
  reviews.find((r) => r.revision === e.revision && r.created_at <= e.created_at) ?? reviews.find((r) => r.revision === e.revision);

/** One invoice's events, newest first; each review expands inline. */
export function Timeline({ events, reviews }: { events: EventRow[]; reviews: ReviewRow[] }) {
  return (
    <ol className="timeline">
      {events.map((e) => {
        const review = e.kind === "reviewed" ? reviewFor(e, reviews) : undefined;
        return (
          <li key={e.event_id}>
            <div className="timeline__head">
              <span className="timeline__when">{when(e.created_at)}</span>
              <strong>{KIND_LABEL[e.kind]}</strong>
              <span className="muted-text">by {e.actor}</span>
              {e.revision && e.revision > 1 ? <span className="muted-text">rev {e.revision}</span> : null}
              {e.recommendation ? <span className={`pill rec-${e.recommendation}`}>{REC_LABEL[e.recommendation]}</span> : null}
            </div>
            {e.note ? <div className="note">{e.note}</div> : null}
            {review ? (
              <details className="timeline__review">
                <summary>Review {review.review_id}</summary>
                <ReviewBody review={review} />
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
