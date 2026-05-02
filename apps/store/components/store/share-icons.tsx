"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

interface ShareIconsProps {
  url: string;
  title: string;
}

const iconClass = "h-4 w-4";

export function ShareIcons({ url, title }: ShareIconsProps) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedShare = encodeURIComponent(`${title} — ${url}`);

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
      // Silent fail — clipboard may be blocked in insecure context
    }
  }

  return (
    <div className="flex items-center gap-3 border-t pt-3">
      <span className="text-sm text-gray-500">{dict.share.title}:</span>

      <button
        type="button"
        onClick={copyLink}
        title={copied ? dict.share.copyLinkToast : dict.share.copyLink}
        aria-label={dict.share.copyLink}
        data-testid="share-copy-link"
        className="rounded-full p-2 text-gray-600 hover:bg-gray-100"
      >
        {copied ? (
          <Check className={`${iconClass} text-green-600`} aria-hidden />
        ) : (
          <Link2 className={iconClass} aria-hidden />
        )}
      </button>

      <a
        href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        title={dict.share.telegram}
        aria-label={`${dict.share.title} — ${dict.share.telegram}`}
        data-analytics="share-telegram"
        className="rounded-full p-2 text-[#229ED9] hover:bg-blue-50"
      >
        <svg
          className={iconClass}
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M11.944 0C5.353 0 0 5.353 0 11.944s5.353 11.944 11.944 11.944 11.944-5.353 11.944-11.944S18.535 0 11.944 0zm5.583 8.16l-1.864 8.79c-.14.62-.51.77-1.03.48l-2.85-2.1-1.37 1.32c-.15.15-.28.28-.57.28l.2-2.92 5.31-4.8c.23-.2-.05-.32-.36-.12l-6.56 4.13-2.83-.88c-.61-.19-.62-.61.13-.9l11.06-4.27c.51-.18.96.13.79.97z" />
        </svg>
      </a>

      <a
        href={`viber://forward?text=${encodedShare}`}
        title={dict.share.viber}
        aria-label={`${dict.share.title} — ${dict.share.viber}`}
        data-analytics="share-viber"
        className="rounded-full p-2 text-[#7360F2] hover:bg-purple-50"
      >
        <svg
          className={iconClass}
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M11.4 1.5C9.5 1.6 6.7 1.9 5 3.4 3.7 4.7 3.2 6.7 3.1 9.1c-.1 2.4-.2 6.9 4 8.1v2c0 .6.7.9 1.1.5l2.1-2.3c2.9.2 5.1-.4 5.4-.5 2.4-.8 3.8-3.2 4-5.6.2-2.5-.1-4.5-1.2-6-2-2.7-5.6-2.8-7.1-2.8ZM10 5.6c.4 0 .8.1 1.2.2.4.1.5.2.4.6-.1.4-.3.4-.7.3-1.5-.4-2.6.6-2.7 2 0 .4-.1.6-.5.6-.4 0-.5-.3-.5-.7.2-1.6 1.4-3 2.8-3ZM12 4c.4 0 .8.1 1.2.1.5 0 1 .2 1.4.4.5.2.9.5 1.3.9.4.4.7.8.9 1.3.2.5.3 1 .4 1.5 0 .4 0 .5-.4.6-.4 0-.5-.2-.6-.5-.1-2-1.3-3.2-3.3-3.4-.4 0-.8-.1-.7-.5 0-.4.2-.4.5-.4Zm-2.6 3.6c.5-.1.7.1 1 .8l.4.9c.1.3.2.6 0 .9l-.3.4c-.2.2-.2.4-.1.6.5 1.1 1.3 1.9 2.4 2.4.2.1.4.1.6-.1l.4-.3c.2-.2.5-.2.8 0l1.7 1.1c.4.2.5.6.2 1-.5.7-1.4 1.3-2.3 1.1-.5-.1-2.6-.7-4.4-2.5-1.7-1.7-2.4-3.8-2.5-4.4-.2-.9.4-1.7 1.1-2 .3-.1 1-.2.9.1.1 0 .1 0 .1 0Zm.8-2c.7-.1 1.4.2 1.7.9.1.3.2.5-.2.7-.4.1-.5-.1-.6-.4-.2-.5-.5-.6-1-.5-.4.1-.5-.1-.5-.4 0-.3 0-.3.6-.3Z" />
        </svg>
      </a>

      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        title={dict.share.facebook}
        aria-label={`${dict.share.title} — ${dict.share.facebook}`}
        data-analytics="share-facebook"
        className="rounded-full p-2 text-[#1877F2] hover:bg-blue-50"
      >
        <svg
          className={iconClass}
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </a>

      <a
        href={`https://wa.me/?text=${encodedShare}`}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        aria-label={`${dict.share.title} — WhatsApp`}
        data-analytics="share-whatsapp"
        className="rounded-full p-2 text-[#25D366] hover:bg-green-50"
      >
        <svg
          className={iconClass}
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.030-.967-.273-.099-.471-.148-.670.150-.197.297-.767.966-.940 1.164-.173.199-.347.223-.644.075-.297-.150-1.255-.463-2.39-1.475-.883-.788-1.480-1.761-1.653-2.059-.173-.297-.018-.458.130-.606.134-.133.297-.347.446-.520.149-.174.198-.298.298-.497.099-.198.050-.371-.025-.520-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.500-.669-.510-.173-.008-.371-.010-.570-.010-.198 0-.520.074-.792.371-.272.298-1.040 1.016-1.040 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.200 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.360.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.570-.347m-5.421 7.403h-.004a9.870 9.870 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.860 9.860 0 01-1.51-5.260c.001-5.450 4.436-9.884 9.890-9.884 2.640 0 5.122 1.030 6.988 2.898a9.825 9.825 0 012.893 6.992c-.003 5.450-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.050 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </a>
    </div>
  );
}
