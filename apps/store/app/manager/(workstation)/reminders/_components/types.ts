export type ReminderPeriod =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "event";

export interface ReminderItem {
  id: string;
  productId: string;
  quantity: number;
  done: boolean;
  productName: string;
  articleCode: string | null;
}

export interface ReminderRow {
  id: string;
  body: string;
  remindAt: string;
  completedAt: string | null;
  snoozedUntilAt: string | null;
  periodicity: ReminderPeriod;
  isProductReminder: boolean;
  orderVideo: boolean;
  actionType: string;
  source: string;
  lotId: string | null;
  productId: string | null;
  clientId: string | null;
  orderId: string | null;
  createdAt: string;
  client: {
    id: string;
    name: string;
    phone: string | null;
    code1C: string | null;
  } | null;
  order: {
    id: string;
    number1C: string | null;
  } | null;
  owner: { id: string; fullName: string } | null;
  items?: ReminderItem[];
}

export interface ReminderClientPickItem {
  id: string;
  name: string;
  tradePointName: string | null;
  city: string | null;
  code1C: string | null;
  isOwned: boolean;
  agent: { id: string; fullName: string } | null;
}

export const PERIOD_OPTIONS: { value: ReminderPeriod; label: string }[] = [
  { value: "none", label: "Не повторювати" },
  { value: "daily", label: "Щодня" },
  { value: "weekly", label: "Щотижня" },
  { value: "monthly", label: "Щомісяця" },
  { value: "event", label: "По події" },
];

export const PERIOD_BADGE: Record<ReminderPeriod, string | null> = {
  none: null,
  daily: "Щодня",
  weekly: "Щотижня",
  monthly: "Щомісяця",
  yearly: "Щороку",
  event: "По події",
};
