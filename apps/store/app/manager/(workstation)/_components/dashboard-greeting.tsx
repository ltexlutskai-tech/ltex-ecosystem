export function DashboardGreeting({ fullName }: { fullName: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800">Вітаємо, {fullName}!</h1>
      <p className="mt-1 text-sm text-gray-600">Робочий стіл L-TEX Manager.</p>
    </div>
  );
}
