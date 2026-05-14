import { ClientHistoryCommentForm } from "./client-history-comment-form";
import { ClientTimelineItem } from "./client-timeline-item";
import type { ClientTimelineEntry } from "./types";

export function ClientHistoryTab({
  clientId,
  timeline,
}: {
  clientId: string;
  timeline: ClientTimelineEntry[];
}) {
  return (
    <div className="space-y-4 rounded-lg border bg-white p-5 shadow-sm">
      {timeline.length === 0 ? (
        <p className="text-sm text-gray-500">
          Жодного запису в історії взаємодій ще немає. Додайте перший коментар
          нижче.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {timeline.map((entry) => (
            <ClientTimelineItem key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      <ClientHistoryCommentForm clientId={clientId} />
    </div>
  );
}
