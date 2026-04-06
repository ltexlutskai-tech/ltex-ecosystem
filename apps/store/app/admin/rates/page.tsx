export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { Card, CardContent, CardHeader, CardTitle } from "@ltex/ui";
import { RateForm } from "./rate-form";

export default async function RatesPage() {
  const rates = await prisma.exchangeRate.findMany({
    orderBy: { date: "desc" },
    take: 50,
  });

  // Group by currency pair, show latest
  const latestByPair = new Map<string, typeof rates[number]>();
  for (const rate of rates) {
    const key = `${rate.currencyFrom}_${rate.currencyTo}`;
    if (!latestByPair.has(key)) {
      latestByPair.set(key, rate);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Курси валют</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Додати/оновити курс</CardTitle>
        </CardHeader>
        <CardContent>
          <RateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Поточні курси</CardTitle>
        </CardHeader>
        <CardContent>
          {latestByPair.size === 0 ? (
            <p className="text-sm text-gray-500">Курсів ще немає</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from(latestByPair.values()).map((rate) => (
                <div
                  key={rate.id}
                  className="rounded-lg border p-4"
                >
                  <div className="text-lg font-bold">
                    {rate.currencyFrom} → {rate.currencyTo}
                  </div>
                  <div className="text-2xl font-bold text-green-700">
                    {rate.rate.toFixed(4)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {new Date(rate.date).toLocaleDateString("uk-UA")} · {rate.source}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Історія курсів</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Валюта</th>
                  <th className="pb-2 font-medium">Курс</th>
                  <th className="pb-2 font-medium">Дата</th>
                  <th className="pb-2 font-medium">Джерело</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id} className="border-b">
                    <td className="py-2">
                      {rate.currencyFrom} → {rate.currencyTo}
                    </td>
                    <td className="py-2 font-mono">{rate.rate.toFixed(4)}</td>
                    <td className="py-2">
                      {new Date(rate.date).toLocaleDateString("uk-UA")}
                    </td>
                    <td className="py-2">{rate.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
