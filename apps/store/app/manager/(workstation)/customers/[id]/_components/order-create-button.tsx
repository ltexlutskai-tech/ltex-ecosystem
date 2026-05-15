"use client";

import { Plus } from "lucide-react";
import { Button, useToast } from "@ltex/ui";

export function OrderCreateButton() {
  const { toast } = useToast();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        toast({
          description:
            "Створення замовлення зробимо у M1.5 (з SOAP write-back у 1С)",
        })
      }
    >
      <Plus className="mr-1 h-4 w-4" />
      Створити замовлення
    </Button>
  );
}
