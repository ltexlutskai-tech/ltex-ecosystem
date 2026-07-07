import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  SIMPLE_DICTS,
  isSimpleDictType,
} from "@/lib/manager/simple-dict-config";
import { loadDictRows } from "@/lib/manager/simple-dict-actions";
import { DictionaryEditor } from "./_components/dictionary-editor";

export const dynamic = "force-dynamic";

export default async function DictionaryPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!isSimpleDictType(type)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const cfg = SIMPLE_DICTS[type];
  const canEdit = user.role === "owner" || user.role === "admin";
  const rows = await loadDictRows(type);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager/registry"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Довідники та регістри
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-800">{cfg.title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {cfg.desc}
          {!canEdit && " Редагувати може лише власник або адміністратор."}
        </p>
      </div>
      <DictionaryEditor
        type={type}
        rows={rows}
        hasColor={cfg.hasColor}
        isRoute={cfg.kind === "route"}
        canEdit={canEdit}
      />
    </div>
  );
}
