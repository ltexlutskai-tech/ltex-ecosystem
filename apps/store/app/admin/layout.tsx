import { AdminSidebar } from "@/components/admin/sidebar";
import { Toaster } from "@ltex/ui";

export const metadata = {
  title: "Адмін-панель | L-TEX",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 md:flex-row">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      <Toaster />
    </div>
  );
}
