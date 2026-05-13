import { redirect } from "next/navigation";
import Link from "next/link";
import { Toaster } from "@ltex/ui";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export const metadata = {
  title: "L-TEX Manager",
};

export default async function WorkstationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/manager" className="text-lg font-bold text-green-700">
            L-TEX Manager
          </Link>
          <nav className="flex items-center gap-4 text-sm text-gray-600">
            <Link href="/manager" className="hover:text-green-700">
              Робочий стіл
            </Link>
            {user.role === "admin" && (
              <Link
                href="/manager/admin/users"
                className="hover:text-green-700"
              >
                Користувачі
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">{user.fullName}</span>
          <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
            {user.role}
          </span>
          <form action="/api/v1/manager/auth/logout" method="post">
            <button
              type="submit"
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Вийти
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6">{children}</main>
      <Toaster />
    </div>
  );
}
