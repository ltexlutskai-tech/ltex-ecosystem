"use client";

import { Button, useToast } from "@ltex/ui";

export function ClientActionButtons() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          toast({
            description: "Створення замовлення з картки буде у M1.5",
          })
        }
      >
        Створити замовлення
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          toast({
            description: "Viber-повідомлення про борг буде у M1.8",
          })
        }
      >
        Повідомлення про борг
      </Button>
    </div>
  );
}
