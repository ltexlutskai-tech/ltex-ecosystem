"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useToast,
} from "@ltex/ui";
import { UserPlus } from "lucide-react";

interface ManagerOption {
  id: string;
  email: string;
  fullName: string;
  role: "manager" | "senior_manager" | "admin";
  isActive: boolean;
}

export function ClientAssignDialog({
  clientId,
  currentManager,
}: {
  clientId: string;
  currentManager: { id: string; fullName: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ManagerOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(
    currentManager?.id ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  async function openDialog(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/v1/manager/admin/users", {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { users: ManagerOption[] };
        setUsers(data.users.filter((u) => u.isActive));
      } else {
        toast({
          description: "Не вдалося завантажити список менеджерів",
          variant: "destructive",
        });
      }
    } finally {
      setLoadingUsers(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const body = { userId: selectedId === "" ? null : selectedId };
      const res = await fetch(`/api/v1/manager/clients/${clientId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка прив'язки",
          variant: "destructive",
        });
        return;
      }
      toast({ description: "Прив'язку оновлено" });
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="gap-2">
          <UserPlus className="h-4 w-4" />
          {currentManager ? "Змінити менеджера" : "Прив'язати менеджера"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Прив'язка менеджера</DialogTitle>
          <DialogDescription>
            Виберіть менеджера зі списку або зніміть прив'язку.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          {loadingUsers ? (
            <p className="text-sm text-gray-500">Завантаження…</p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">— Зняти прив'язку —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email}) · {roleLabel(u.role)}
                </option>
              ))}
            </select>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Скасувати
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function roleLabel(role: ManagerOption["role"]): string {
  if (role === "admin") return "Адмін";
  if (role === "senior_manager") return "Старший";
  return "Менеджер";
}
