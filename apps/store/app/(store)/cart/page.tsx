import { getCurrentRate } from "@/lib/exchange-rate";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { CartClient } from "./cart-client";

export default async function CartPage() {
  const [rate, customer] = await Promise.all([
    getCurrentRate(),
    getCurrentCustomer(),
  ]);
  return (
    <CartClient
      rate={rate}
      initialName={customer?.name ?? ""}
      initialPhone={customer?.phone ?? ""}
    />
  );
}
