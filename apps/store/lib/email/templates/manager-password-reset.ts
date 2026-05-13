function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

export interface ManagerPasswordResetEmailInput {
  fullName: string;
  resetUrl: string;
}

export interface ManagerEmailPayload {
  subject: string;
  html: string;
  text: string;
}

export function buildManagerPasswordResetEmail({
  fullName,
  resetUrl,
}: ManagerPasswordResetEmailInput): ManagerEmailPayload {
  const safeName = escapeHtml(fullName);
  const safeUrl = escapeHtml(resetUrl);
  return {
    subject: "Скидання пароля L-TEX Manager",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:auto;padding:20px;color:#374151">
        <h2 style="color:#16a34a;margin:0 0 16px">Скидання пароля</h2>
        <p style="line-height:1.6">Шановний(а) ${safeName}, ви запросили скидання пароля до L-TEX Manager. Щоб задати новий пароль — натисніть кнопку нижче:</p>
        <p style="margin:24px 0">
          <a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">
            Скинути пароль
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px">Якщо кнопка не працює — скопіюйте посилання:<br/><code style="word-break:break-all">${safeUrl}</code></p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Посилання дійсне 1 годину. Якщо ви не запрошували скидання — просто проігноруйте цей лист, ваш пароль залишиться попереднім.</p>
      </div>
    `,
    text: `Скидання пароля L-TEX Manager\n\nЩоб задати новий пароль:\n${resetUrl}\n\nПосилання дійсне 1 годину.`,
  };
}
