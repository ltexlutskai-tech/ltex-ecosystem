"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { Badge, Button } from "@ltex/ui";
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@ltex/shared";
import { OrderStatusForm } from "./order-status-form";
import { addOrderNote } from "./actions";
import { toast } from "@ltex/ui";

interface OrderItem {
  id: string;
  productName: string;
  barcode: string;
  weight: number;
  priceEur: number;
  quantity: number;
}

interface OrderRowProps {
  order: {
    id: string;
    code1C: string | null;
    status: string;
    totalEur: number;
    totalUah: number;
    notes: string | null;
    createdAt: string;
    customerName: string;
    customerPhone: string | null;
    itemCount: number;
    items: OrderItem[];
  };
  statusColor: "default" | "secondary" | "destructive" | "outline" | "accent";
}

export function OrderDetailRow({ order, statusColor }: OrderRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function handleSaveNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const currentNotes = order.notes ?? "";
      const timestamp = new Date().toLocaleString("uk-UA");
      const newNote = currentNotes
        ? `${currentNotes}\n[${timestamp}] ${noteText.trim()}`
        : `[${timestamp}] ${noteText.trim()}`;
      await addOrderNote(order.id, newNote);
      order.notes = newNote;
      setNoteText("");
      toast({
        title: "Коментар додано",
        variant: "success",
      });
    } catch {
      toast({
        title: "Помилка",
        description: "Не вдалося зберегти коментар",
        variant: "destructive",
      });
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <>
      <tr
        className="border-b hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <button className="text-gray-400">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-4 py-3 font-mono text-xs">
          {order.code1C ?? order.id.slice(0, 8)}
        </td>
        <td className="px-4 py-3">
          <div>{order.customerName}</div>
          {order.customerPhone && (
            <div className="text-xs text-gray-400">{order.customerPhone}</div>
          )}
        </td>
        <td className="px-4 py-3">
          <Badge variant={statusColor}>
            {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
          </Badge>
        </td>
        <td className="px-4 py-3">€{order.totalEur.toFixed(2)}</td>
        <td className="px-4 py-3">₴{order.totalUah.toFixed(2)}</td>
        <td className="px-4 py-3">{order.itemCount}</td>
        <td className="px-4 py-3">
          {new Date(order.createdAt).toLocaleDateString("uk-UA")}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <OrderStatusForm
            orderId={order.id}
            currentStatus={order.status as OrderStatus}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-gray-50/50">
          <td colSpan={9} className="px-8 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Order items */}
              <div>
                <h4 className="mb-2 text-sm font-bold text-gray-700">
                  Позиції замовлення
                </h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="pb-1 text-left font-medium">Товар</th>
                      <th className="pb-1 text-left font-medium">Штрихкод</th>
                      <th className="pb-1 text-right font-medium">Вага</th>
                      <th className="pb-1 text-right font-medium">Ціна EUR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="py-1">{item.productName}</td>
                        <td className="py-1 font-mono">{item.barcode}</td>
                        <td className="py-1 text-right">{item.weight} кг</td>
                        <td className="py-1 text-right">
                          €{item.priceEur.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              <div>
                <h4 className="mb-2 text-sm font-bold text-gray-700">
                  <MessageSquare className="mr-1 inline h-4 w-4" />
                  Коментарі
                </h4>
                {order.notes && (
                  <pre className="mb-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-white p-2 text-xs text-gray-600">
                    {order.notes}
                  </pre>
                )}
                <div className="flex gap-2">
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Додати коментар..."
                    className="flex-1 rounded-md border px-2 py-1 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveNote();
                    }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteText.trim()}
                  >
                    {savingNote ? "..." : "Додати"}
                  </Button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
