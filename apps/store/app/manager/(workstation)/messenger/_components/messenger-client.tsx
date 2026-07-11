"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";
import { MessengerSearchDialog } from "./search-dialog";
import { NewChatDialog } from "./new-chat-dialog";

export function MessengerClient({
  currentUserId,
  currentUserRole,
  currentUserName,
}: {
  currentUserId: string;
  currentUserRole: string;
  currentUserName: string;
}) {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listBump, setListBump] = useState(0);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Дип-лінк із дзвіночка/меню: ?c=<id> відкриває конкретну розмову.
  const appliedParamRef = useRef<string | null>(null);
  useEffect(() => {
    const c = searchParams.get("c");
    if (c && appliedParamRef.current !== c) {
      appliedParamRef.current = c;
      setSelectedId(c);
    }
  }, [searchParams]);

  const bumpList = useCallback(() => setListBump((v) => v + 1), []);

  const openConversation = useCallback(
    (id: string) => {
      setSelectedId(id);
      bumpList();
    },
    [bumpList],
  );

  const leaveConversation = useCallback(() => {
    setSelectedId(null);
    bumpList();
  }, [bumpList]);

  return (
    <div className="relative flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-white">
      <ConversationList
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNewChat={() => setNewChatOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        refreshKey={listBump}
      />
      <div className="hidden flex-1 lg:flex">
        {selectedId ? (
          <ConversationThread
            key={selectedId}
            conversationId={selectedId}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onReadCleared={bumpList}
            onLeft={leaveConversation}
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
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              currentUserName={currentUserName}
              onReadCleared={bumpList}
              onLeft={leaveConversation}
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
      <MessengerSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onOpenConversation={openConversation}
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
