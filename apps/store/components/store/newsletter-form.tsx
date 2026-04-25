"use client";

import { useState, FormEvent } from "react";
import { Button, Input } from "@ltex/ui";
import { getDictionary } from "@/lib/i18n";

type Status = "idle" | "submitting" | "success" | "error";

export function NewsletterForm() {
  const dict = getDictionary();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source: "footer" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("success");
        setMessage(dict.newsletter.success);
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data?.error ?? dict.newsletter.error);
      }
    } catch {
      setStatus("error");
      setMessage(dict.newsletter.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="text-center" aria-label="Newsletter">
      <h4 className="text-base font-semibold">{dict.newsletter.title}</h4>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          aria-label={dict.newsletter.placeholder}
          placeholder={dict.newsletter.placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          className="flex-1"
        />
        <Button type="submit" disabled={status === "submitting"}>
          {dict.newsletter.cta}
        </Button>
      </div>
      {message && (
        <p
          role="status"
          className={`mt-2 text-sm ${
            status === "success" ? "text-green-700" : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
