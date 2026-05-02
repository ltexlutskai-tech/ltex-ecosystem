import { getCurrentRate } from "@/lib/exchange-rate";
import { CartClient } from "./cart-client";

export default async function CartPage() {
  const rate = await getCurrentRate();
  return <CartClient rate={rate} />;
}
