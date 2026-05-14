"use client";

import { Button, useToast } from "@ltex/ui";

export function ClientActionButtons({
  clientId: _clientId,
}: { clientId?: string } = {}) {
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
            description:
              "Чат-інтеграцію (Viber/Telegram повідомлення про борг) зробимо у M1.8",
          })
        }
      >
        Повідомити про борг
      </Button>
    </div>
  );
}
