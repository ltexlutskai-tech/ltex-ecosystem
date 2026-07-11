"use client";

import { useCallback, useState } from "react";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";
import { NewChatDialog } from "./new-chat-dialog";

export function MessengerClient({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserRole: string;
  currentUserName: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listBump, setListBump] = useState(0);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const bumpList = useCallback(() => setListBump((v) => v + 1), []);

  const openConversation = useCallback(
    (id: string) => {
      setSelectedId(id);
      bumpList();
    },
    [bumpList],
  );

  return (
    <div className="relative flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-white">
      <ConversationList
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNewChat={() => setNewChatOpen(true)}
        refreshKey={listBump}
      />
      <div className="hidden flex-1 lg:flex">
        {selectedId ? (
          <ConversationThread
            key={selectedId}
            conversationId={selectedId}
            currentUserName={currentUserName}
            onReadCleared={bumpList}
          />
        ) : (
          <EmptyThread />
        )}
      </div>

      {/* Mobile: тред на весь екран, коли вибрано розмову. */}
      {selectedId && (
        <div className="absolute inset-0 z-10 flex flex-col bg-white lg:hidden">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="border-b px-3 py-2 text-left text-sm text-green-700 hover:bg-gray-50"
          >
            ← До списку
          </button>
          <div className="flex-1 overflow-hidden">
            <ConversationThread
              key={`m-${selectedId}`}
              conversationId={selectedId}
              currentUserName={currentUserName}
              onReadCleared={bumpList}
            />
          </div>
        </div>
      )}

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        currentUserId={currentUserId}
        onOpened={openConversation}
      />
    </div>
  );
}

function EmptyThread() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-500">
      Оберіть розмову зліва або натисніть «+ Новий чат», щоб написати колезі.
    </div>
  );
}
