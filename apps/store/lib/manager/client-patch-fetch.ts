import type { EditableClientFields } from "@/app/manager/(workstation)/customers/[id]/_hooks/use-client-edit";

export interface PatchClientResult {
  ok: boolean;
  status: number;
  error?: string;
}

export async function patchClient(
  clientId: string,
  payload: Partial<EditableClientFields>,
): Promise<PatchClientResult> {
  const res = await fetch(`/api/v1/manager/clients/${clientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let error = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) error = data.error;
    } catch {
      // ignore non-json
    }
    return { ok: false, status: res.status, error };
  }

  return { ok: true, status: res.status };
}
