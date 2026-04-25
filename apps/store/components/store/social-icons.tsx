import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function FacebookIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M13.5 21v-7.5h2.53l.38-2.94H13.5V8.69c0-.85.24-1.43 1.46-1.43h1.56V4.63c-.27-.04-1.19-.12-2.27-.12-2.24 0-3.78 1.37-3.78 3.88v2.16H8v2.94h2.47V21h3.03Z" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function YoutubeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42A2.51 2.51 0 0 0 2.42 7.19 26.1 26.1 0 0 0 2 12a26.1 26.1 0 0 0 .42 4.81 2.51 2.51 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77A26.1 26.1 0 0 0 22 12a26.1 26.1 0 0 0-.42-4.81ZM10 15V9l5.2 3L10 15Z" />
    </svg>
  );
}

export function TikTokIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M19.6 6.32a4.79 4.79 0 0 1-3.77-4.32h-3.05v13.4a2.7 2.7 0 0 1-2.7 2.7 2.7 2.7 0 0 1-2.7-2.7 2.7 2.7 0 0 1 2.7-2.7c.27 0 .52.05.77.12V9.7a5.78 5.78 0 0 0-.77-.05 5.77 5.77 0 0 0-5.77 5.77 5.77 5.77 0 0 0 5.77 5.77 5.77 5.77 0 0 0 5.77-5.77V8.96a7.84 7.84 0 0 0 4.55 1.46V7.4a4.84 4.84 0 0 1-.8-1.08Z" />
    </svg>
  );
}

export function ViberIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M11.4 1.5C9.5 1.6 6.7 1.9 5 3.4 3.7 4.7 3.2 6.7 3.1 9.1c-.1 2.4-.2 6.9 4 8.1v2c0 .6.7.9 1.1.5l2.1-2.3c2.9.2 5.1-.4 5.4-.5 2.4-.8 3.8-3.2 4-5.6.2-2.5-.1-4.5-1.2-6-2-2.7-5.6-2.8-7.1-2.8ZM10 5.6c.4 0 .8.1 1.2.2.4.1.5.2.4.6-.1.4-.3.4-.7.3-1.5-.4-2.6.6-2.7 2 0 .4-.1.6-.5.6-.4 0-.5-.3-.5-.7.2-1.6 1.4-3 2.8-3ZM12 4c.4 0 .8.1 1.2.1.5 0 1 .2 1.4.4.5.2.9.5 1.3.9.4.4.7.8.9 1.3.2.5.3 1 .4 1.5 0 .4 0 .5-.4.6-.4 0-.5-.2-.6-.5-.1-2-1.3-3.2-3.3-3.4-.4 0-.8-.1-.7-.5 0-.4.2-.4.5-.4Zm-2.6 3.6c.5-.1.7.1 1 .8l.4.9c.1.3.2.6 0 .9l-.3.4c-.2.2-.2.4-.1.6.5 1.1 1.3 1.9 2.4 2.4.2.1.4.1.6-.1l.4-.3c.2-.2.5-.2.8 0l1.7 1.1c.4.2.5.6.2 1-.5.7-1.4 1.3-2.3 1.1-.5-.1-2.6-.7-4.4-2.5-1.7-1.7-2.4-3.8-2.5-4.4-.2-.9.4-1.7 1.1-2 .3-.1 1-.2.9.1.1 0 .1 0 .1 0Zm.8-2c.7-.1 1.4.2 1.7.9.1.3.2.5-.2.7-.4.1-.5-.1-.6-.4-.2-.5-.5-.6-1-.5-.4.1-.5-.1-.5-.4 0-.3 0-.3.6-.3Z" />
    </svg>
  );
}
