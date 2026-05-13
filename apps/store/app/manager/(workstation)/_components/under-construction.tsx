import { Construction } from "lucide-react";

export function UnderConstruction({
  session,
  description,
}: {
  session: string;
  description?: string;
}) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <Construction className="mx-auto h-12 w-12 text-amber-500" />
      <h2 className="mt-4 text-xl font-semibold text-gray-800">
        Цей розділ ще будується
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        {description ?? "Реальний функціонал з'явиться у наступних оновленнях."}
      </p>
      <p className="mt-1 text-xs text-gray-400">Очікувано: сесія {session}</p>
    </div>
  );
}
