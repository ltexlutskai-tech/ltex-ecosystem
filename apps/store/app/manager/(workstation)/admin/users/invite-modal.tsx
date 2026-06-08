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
  Input,
  useToast,
} from "@ltex/ui";

type Role =
  | "manager"
  | "senior_manager"
  | "admin"
  | "owner"
  | "supervisor"
  | "analyst"
  | "warehouse"
  | "bookkeeper";

const ROLE_LABELS: Record<Role, string> = {
  manager: "Менеджер",
  senior_manager: "Старший менеджер",
  admin: "Адміністратор",
  owner: "Власник",
  supervisor: "Супервайзер",
  analyst: "Аналітик",
  warehouse: "Склад",
  bookkeeper: "Бухгалтер",
};

export function InviteModal() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [loading, setLoading] = useState(false);

  function reset() {
    setEmail("");
    setFullName("");
    setRole("manager");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, role }),
      });
      if (res.ok) {
        toast({
          title: "Запрошення відправлено",
          description: `${email} отримає лист із посиланням`,
        });
        reset();
        setOpen(false);
        router.refresh();
      } else if (res.status === 409) {
        toast({
          title: "Користувач з таким email вже існує",
          variant: "destructive",
        });
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Не вдалося створити користувача",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Помилка з'єднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Запросити</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Запросити менеджера</DialogTitle>
          <DialogDescription>
            На вказаний email буде надіслано посилання для встановлення пароля.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="invite-email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div>
            <label
              htmlFor="invite-fullname"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              ПІБ
            </label>
            <Input
              id="invite-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              disabled={loading}
            />
          </div>
          <div>
            <label
              htmlFor="invite-role"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Роль
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={loading}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Надсилаємо..." : "Запросити"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
