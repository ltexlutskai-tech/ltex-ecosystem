"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button, useToast } from "@ltex/ui";

export function LogoutButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/auth/logout", {
        method: "POST",
      });
      if (!res.ok) {
        toast({ title: "Не вдалося вийти", variant: "destructive" });
        return;
      }
      router.push("/manager/login");
      router.refresh();
    } catch {
      toast({ title: "Помилка з'єднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="destructive"
      onClick={handleClick}
      disabled={loading}
    >
      <LogOut className="mr-2 h-4 w-4" />
      {loading ? "Вихід..." : "Вийти"}
    </Button>
  );
}
