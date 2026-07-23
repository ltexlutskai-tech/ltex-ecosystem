import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { PriceRequestForm } from "./price-request-form";

export const metadata: Metadata = {
  title: "Отримати прайс лист — L-TEX секонд хенд та сток гуртом",
  description:
    "Залиште імʼя, телефон та область — менеджер L-TEX надішле актуальний прайс на секонд хенд, сток, іграшки та Bric-a-Brac гуртом від 10 кг.",
};

export default function GetPricePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: "Отримати прайс лист" }]} />

      <div className="mx-auto mt-6 max-w-md">
        <h1 className="text-3xl font-bold">Отримати прайс лист</h1>
        <p className="mt-2 text-gray-500">
          Залиште контакти — менеджер вашої області надішле актуальний прайс на
          секонд хенд, сток, іграшки та Bric-a-Brac (гурт від 10 кг).
        </p>
        <div className="mt-6">
          <PriceRequestForm />
        </div>
      </div>
    </div>
  );
}
