"use client";

import { useCallback, useState } from "react";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";

export function InboxClient(_props: {
  currentUserId: string;
  currentUserRole: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listBump, setListBump] = useState(0);

  const bumpList = useCallback(() => setListBump((v) => v + 1), []);

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-white">
      <ConversationList
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
        }}
        refreshKey={listBump}
      />
      <div className="hidden flex-1 lg:flex">
        {selectedId ? (
          <ConversationThread
            key={selectedId}
            conversationId={selectedId}
            onReadCleared={bumpList}
          />
        ) : (
          <EmptyThread />
        )}
      </div>
      {/* Mobile: show thread as full-screen overlay коли вибрано. */}
      {selectedId && (
        <div className="absolute inset-0 z-10 flex flex-col bg-white lg:hidden">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="border-b px-3 py-2 text-left text-sm text-green-700 hover:bg-gray-50"
          >
            ← До списку розмов
          </button>
          <div className="flex-1 overflow-hidden">
            <ConversationThread
              key={`m-${selectedId}`}
              conversationId={selectedId}
              onReadCleared={bumpList}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyThread() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
      Оберіть розмову зліва.
    </div>
  );
}
