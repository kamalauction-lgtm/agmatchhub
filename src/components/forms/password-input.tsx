"use client";

import { useState } from "react";

/**
 * Password field with a show/hide toggle. Client component so the reveal works
 * without JS frameworks fighting the server-rendered form; the surrounding
 * <form> still posts to the server action normally.
 *
 * Labels come in as props (the app renders i18n server-side, so client
 * components have no message dictionary).
 */
export function PasswordInput({
  name,
  autoComplete,
  required = false,
  minLength,
  showLabel,
  hideLabel,
  defaultValue,
  id,
}: {
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  showLabel: string;
  hideLabel: string;
  defaultValue?: string;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        name={name}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-line bg-background px-3 py-2.5 pr-16 outline-none focus:border-crimson"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-semibold text-muted hover:text-crimson"
      >
        {visible ? hideLabel : showLabel}
      </button>
    </div>
  );
}
