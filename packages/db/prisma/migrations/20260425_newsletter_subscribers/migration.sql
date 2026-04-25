-- Newsletter subscribers (footer signup, P1 #9 broadcast TODO)
CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
    "id"              TEXT          NOT NULL,
    "email"           TEXT          NOT NULL,
    "phone"           TEXT,
    "subscribed_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMP(3),
    "source"          TEXT,
    "confirmed_at"    TIMESTAMP(3),

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_email_key"
    ON "newsletter_subscribers"("email");

CREATE INDEX IF NOT EXISTS "newsletter_subscribers_subscribed_at_idx"
    ON "newsletter_subscribers"("subscribed_at");
