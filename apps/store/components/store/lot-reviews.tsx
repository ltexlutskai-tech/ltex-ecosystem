import { LotReviewCard, type LotReviewCardData } from "./lot-review-card";

interface LotReviewsProps {
  lots: LotReviewCardData[];
  productId: string;
  productName: string;
  rate: number;
}

export function LotReviews({
  lots,
  productId,
  productName,
  rate,
}: LotReviewsProps) {
  if (lots.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-xl font-bold">Огляди лотів</h2>
        <div className="mt-4 rounded-lg border bg-gray-50 p-6 text-center text-sm text-gray-500">
          Лотів зараз немає. Зв'яжіться з менеджером — підкажемо, коли буде
          надходження.
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-bold">
          Огляди лотів{" "}
          <span className="font-normal text-gray-400">({lots.length})</span>
        </h2>
        <span className="text-sm text-gray-500">
          Оберіть конкретний лот для замовлення
        </span>
      </div>

      <div className="space-y-3">
        {lots.map((lot) => (
          <LotReviewCard
            key={lot.id}
            lot={lot}
            productId={productId}
            productName={productName}
            rate={rate}
          />
        ))}
      </div>
    </section>
  );
}
