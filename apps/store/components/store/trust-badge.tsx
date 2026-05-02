import { ShieldCheck } from "lucide-react";

export function TrustBadge() {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
      <span>Усі фото є оригінальними — зроблені на нашому складі</span>
    </div>
  );
}
