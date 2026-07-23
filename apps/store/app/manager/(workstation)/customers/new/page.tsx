import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { loadDictionariesSnapshot } from "../_lib/load-clients";
import { CreateClientForm } from "./_components/create-client-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Новий клієнт — L-TEX Manager" };

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; phone?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const dictionaries = await loadDictionariesSnapshot();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Новий клієнт</h1>
        <p className="mt-1 text-sm text-gray-600">
          Заповніть основні поля. Решту даних можна додати після створення.
        </p>
      </header>
      <CreateClientForm
        priceTypes={dictionaries.priceTypes}
        searchChannels={dictionaries.channels}
        categoriesTT={dictionaries.categoriesTT}
        assortmentCodes={dictionaries.assortmentCodes}
        agents={dictionaries.agents}
        userRole={user.role}
        initialName={sp.name ?? ""}
        initialPhone={sp.phone ?? ""}
      />
    </div>
  );
}
