import React from "react";

/**
 * Render free text where any pasted URL is masked as a clean clickable label
 * instead of a long raw link — e.g. a Google Maps link becomes "Check in
 * Google ↗". Used on client-facing pages so agent-entered links look tidy.
 *
 * Labels are passed in (i18n is resolved server-side). Links open in a new tab
 * with rel="noopener noreferrer nofollow".
 */

const URL_RE = /(https?:\/\/[^\s]+)/gi;

function isMapsUrl(url: string): boolean {
  return /(google\.[^/]+\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url);
}

export function LinkedText({
  text,
  googleLabel,
  linkLabel,
  className,
}: {
  text: string | null | undefined;
  googleLabel: string;
  linkLabel: string;
  className?: string;
}) {
  if (!text) return null;

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(URL_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const url = m[0];
    if (m.index > last) nodes.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium text-crimson underline underline-offset-2 hover:text-crimson-strong"
      >
        {isMapsUrl(url) ? googleLabel : linkLabel} ↗
      </a>,
    );
    last = m.index + url.length;
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>);

  return <span className={className}>{nodes}</span>;
}
