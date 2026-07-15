import { ClientHistoryCommentForm } from "./client-history-comment-form";
import { ClientTimelineItem } from "./client-timeline-item";
import type { ClientTimelineEntry } from "./types";

export function ClientHistoryTab({
  clientId,
  timeline,
  canEdit,
  currentUserId,
  currentUserRole,
}: {
  clientId: string;
  timeline: ClientTimelineEntry[];
  canEdit: boolean;
  currentUserId: string;
  currentUserRole: string;
}) {
  return (
    <div className="space-y-4 rounded-lg border bg-white p-5 shadow-sm">
      <ClientHistoryCommentForm clientId={clientId} />
      {timeline.length === 0 ? (
        <p className="text-sm text-gray-500">
          Жодного запису в історії взаємодій ще немає. Додайте перший коментар
          вище.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {timeline.map((entry) => (
            <ClientTimelineItem
              key={entry.id}
              clientId={clientId}
              entry={entry}
              canEdit={canEdit}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
