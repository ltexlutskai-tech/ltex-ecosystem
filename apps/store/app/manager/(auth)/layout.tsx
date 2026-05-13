import { Toaster } from "@ltex/ui";

export const metadata = {
  title: "L-TEX Manager",
};

export default function ManagerAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-700">L-TEX</h1>
          <p className="mt-1 text-sm text-gray-500">Manager Workstation</p>
        </div>
        {children}
      </div>
      <Toaster />
    </div>
  );
}
