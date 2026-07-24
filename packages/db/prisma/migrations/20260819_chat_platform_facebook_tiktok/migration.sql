-- Картка клієнта — месенджери (2026-07-24).
-- Розширюємо перелік платформ об'єднаного inbox-у під майбутні канали
-- (Facebook Messenger, TikTok). Instagram + WhatsApp вже були у enum-і.
-- Additive-only: наявні розмови/повідомлення не зачіпаються; нові значення
-- нікуди ще не пишуться (вебхуків FB/TikTok поки немає) — це заділ, щоб
-- підключення нового каналу було одним рядком, без переробки картки/списку.
ALTER TYPE "chat_platform" ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE "chat_platform" ADD VALUE IF NOT EXISTS 'tiktok';
