const ROLE_LABELS: Record<string, string> = {
  admin: "Адміністратор",
  owner: "Власник",
  manager: "Менеджер",
  senior_manager: "Старший менеджер",
  supervisor: "Керівник",
  warehouse: "Склад",
  expeditor: "Експедитор",
  analyst: "Аналітик",
  bookkeeper: "Бухгалтер",
  videozone: "Відеозона",
};

/** Людська назва ролі українською для показу в месенджері. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
