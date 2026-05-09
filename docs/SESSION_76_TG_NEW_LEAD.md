# Session 76 — Telegram notification at new customer login

**Type:** Worker session (mini)
**Branch:** `claude/tg-new-lead-{XXXX}`
**Goal:** При першому login нового customer (S73) — fire-and-forget повідомлення у Telegram групу менеджера, щоб не пропускали leads.

---

## ⚠️ HARD RULES

1. **DO NOT block login** на TG send. Fire-and-forget (`.catch(() => {})`).
2. **Тільки на CREATE Customer** — не на existing customer login (інакше spam).
3. **DO NOT log повний phone** у консоль (PII per S64). Log тільки masked: "+380XX\*\*\*\*XX".
4. Reuse existing `NEWSLETTER_TELEGRAM_CHAT_ID` env var (вже використовується для newsletter).
5. **DO NOT touch existing newsletter notification** — тільки нова функція.

---

## Current state

`apps/store/app/api/auth/customer/login/route.ts` — створено в S73. На novyh customer робить `prisma.customer.create({ ... })`. Треба після `setCustomerCookie` додати TG notify, але **тільки якщо customer just created**, не на existing.

`apps/store/lib/notifications.ts` — існує (S70 era), є `sendTelegramMessage(chatId, text)` чи подібне. Перевір signature.

---

## Tasks

### 1. Helper `sendNewLeadNotification`

Місце: розширити `apps/store/lib/notifications.ts` або створити нову функцію `notifyNewLead`.

```typescript
export async function notifyNewLead(params: {
  customerId: string;
  phone: string;
  name: string;
  source?: string; // "web" | "mobile" | "telegram-bot" — для S76 завжди "web"
}): Promise<void> {
  const chatId = process.env.NEWSLETTER_TELEGRAM_CHAT_ID;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) {
    console.warn("[L-TEX] notifyNewLead: TELEGRAM env missing, skipping");
    return;
  }

  // Mask phone for logging only — actual TG message has full phone (manager needs it)
  const maskedPhone = params.phone.replace(
    /(\+?\d{2,4})\d+(\d{2,4})/,
    "$1***$2",
  );

  const message = [
    `🆕 *Новий лід*`,
    ``,
    `*Імʼя:* ${escapeMarkdown(params.name)}`,
    `*Телефон:* \`${params.phone}\``,
    `*Джерело:* ${params.source ?? "web"}`,
    `*Час:* ${new Date().toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })}`,
    ``,
    `Customer ID: \`${params.customerId}\``,
  ].join("\n");

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
        }),
        signal: AbortSignal.timeout(5000), // 5s ceiling
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        "[L-TEX] notifyNewLead failed:",
        res.status,
        body.slice(0, 200),
      );
    }
  } catch (err) {
    console.warn(
      "[L-TEX] notifyNewLead error:",
      maskedPhone,
      err instanceof Error ? err.message : err,
    );
  }
}

function escapeMarkdown(s: string): string {
  return s.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
```

### 2. Hook у login route

`apps/store/app/api/auth/customer/login/route.ts` — після `setCustomerCookie` (тільки коли `wasCreated`):

```typescript
// ...existing code...

let wasCreated = false;
let customer = await prisma.customer.findFirst({
  where: { phone },
  select: { id: true, name: true },
});
if (!customer) {
  customer = await prisma.customer.create({
    data: { phone, name: parsed.data.name },
    select: { id: true, name: true },
  });
  wasCreated = true;  // NEW
}

await setCustomerCookie(customer.id);

// Fire-and-forget Telegram notify (нова логіка)
if (wasCreated) {
  notifyNewLead({
    customerId: customer.id,
    phone,
    name: parsed.data.name,
    source: "web",
  }).catch(() => {});  // never throw
}

return NextResponse.json({ ok: true, customer: { ... } });
```

⚠️ НЕ `await` — fire-and-forget, не блокувати response.

### 3. Optional — same pattern для quick-order

`apps/store/app/api/quick-order/route.ts` — теж створює Customer. Додай той самий `notifyNewLead({ source: "quick-order" })` коли customer створено через цей endpoint. Це покращить S62 quick-order flow — менеджер бачитиме одразу хто замовив у 1 клік.

### 4. Tests

`lib/notifications.test.ts` (extend):

- `notifyNewLead` сама не throw при missing env vars (warns + returns)
- `notifyNewLead` calls fetch with correct body shape (mock fetch)
- `escapeMarkdown` test cases

`app/api/auth/customer/login/route.test.ts` (extend):

- Existing customer login → `notifyNewLead` НЕ викликається (mock spy)
- New customer create → `notifyNewLead` викликається 1 раз

---

## Acceptance criteria

- [ ] `pnpm format:check`/`typecheck`/`test`/`build` зелені
- [ ] `notifyNewLead` додано у `lib/notifications.ts`
- [ ] Login route викликає тільки коли `wasCreated`, fire-and-forget
- [ ] Quick-order route також (за pattern)
- [ ] Тести підтверджують no-call для existing customer
- [ ] Push на `claude/tg-new-lead-{XXXX}` (НЕ merge!)

---

## User-action post-merge

`.\scripts\deploy.ps1` — redeploy, без env (NEWSLETTER_TELEGRAM_CHAT_ID + TELEGRAM_BOT_TOKEN вже встановлені)

---

## Reference

- `apps/store/lib/notifications.ts` — existing TG send patterns
- `apps/store/app/api/auth/customer/login/route.ts` — S73 login
- `apps/store/app/api/quick-order/route.ts` — S62 quick-order pattern
- `apps/store/app/api/newsletter/route.ts` — приклад використання `NEWSLETTER_TELEGRAM_CHAT_ID`
