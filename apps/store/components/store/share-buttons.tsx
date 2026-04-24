"use client";

import { useState } from "react";
import { Link2, Send, Phone, Check } from "lucide-react";
import { FacebookIcon } from "@/components/store/social-icons";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

interface ShareButtonsProps {
  url: string;
  title: string;
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedShare = encodeURIComponent(`${title} — ${url}`);

  const viberHref = `viber://forward?text=${encodedShare}`;
  const telegramHref = `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent fail — browser may block clipboard in insecure context
    }
  }

  const baseLinkClass =
    "inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50";

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-gray-600">
        {dict.share.title}
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyLink}
          aria-label={dict.share.copyLink}
          data-testid="share-copy-link"
          className={baseLinkClass}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
              <span className="hidden sm:inline">
                {dict.share.copyLinkToast}
              </span>
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{dict.share.copyLink}</span>
            </>
          )}
        </button>
        <a
          href={viberHref}
          aria-label={`${dict.share.title} — ${dict.share.viber}`}
          className={baseLinkClass}
          data-analytics="share-viber"
        >
          <Phone className="h-4 w-4 text-[#7360f2]" aria-hidden="true" />
          <span className="hidden sm:inline">{dict.share.viber}</span>
        </a>
        <a
          href={telegramHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${dict.share.title} — ${dict.share.telegram}`}
          className={baseLinkClass}
          data-analytics="share-telegram"
        >
          <Send className="h-4 w-4 text-[#0088cc]" aria-hidden="true" />
          <span className="hidden sm:inline">{dict.share.telegram}</span>
        </a>
        <a
          href={facebookHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${dict.share.title} — ${dict.share.facebook}`}
          className={baseLinkClass}
          data-analytics="share-facebook"
        >
          <FacebookIcon className="h-4 w-4 text-[#1877f2]" aria-hidden="true" />
          <span className="hidden sm:inline">{dict.share.facebook}</span>
        </a>
      </div>
    </div>
  );
}
