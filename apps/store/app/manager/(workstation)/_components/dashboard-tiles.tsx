import { ClipboardList, Route, Truck, Wallet } from "lucide-react";
import { DashboardTile } from "./dashboard-tile";

export interface DashboardTileCounts {
  orders: number;
  sales: number;
  payments: number;
  routeSheets: number;
}

export function DashboardTiles({ counts }: { counts: DashboardTileCounts }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DashboardTile
        href="/manager/orders"
        icon={ClipboardList}
        title="Замовлення"
        count={counts.orders}
        countLabel="нових сьогодні"
      />
      <DashboardTile
        href="/manager/sales"
        icon={Truck}
        title="Реалізація"
        count={counts.sales}
        countLabel="чекають на відвантаження"
      />
      <DashboardTile
        href="/manager/payments"
        icon={Wallet}
        title="Оплати"
        count={counts.payments}
        countLabel="у касі"
      />
      <DashboardTile
        href="/manager/routes"
        icon={Route}
        title="Маршрутні листи"
        count={counts.routeSheets}
        countLabel="активних"
      />
    </div>
  );
}
