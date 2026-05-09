import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-auth";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ customer: null });
  }
  return NextResponse.json({
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
  });
}
