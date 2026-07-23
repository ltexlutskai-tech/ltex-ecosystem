import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { VIDEO_LINK_DEFS } from "@/lib/manager/video-links";
import { VideoLinksEditor } from "./_components/video-links-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Посилання відеоопису — L-TEX Manager" };

const WRITE_ROLES = ["admin", "owner"];

export default async function VideoLinksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!WRITE_ROLES.includes(user.role)) notFound();

  const rows = await prisma.mgrVideoLink.findMany({
    select: { key: true, url: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.url]));

  const links = VIDEO_LINK_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    defaultUrl: d.url,
    url: byKey.get(d.key)?.trim() || "",
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Посилання відеоопису</h1>
        <p className="mt-1 text-sm text-gray-500">
          Значення, що підставляються у YouTube-опис відеоогляду (Відеозона):
          контакти, сайт, соцмережі, хештеги. Порожнє поле — використовується
          значення за замовчуванням.
        </p>
      </div>
      <VideoLinksEditor initial={links} />
    </div>
  );
}
