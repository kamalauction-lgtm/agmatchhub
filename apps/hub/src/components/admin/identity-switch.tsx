"use client";

import { setPartnerIdentity } from "@/app/(admin)/admin/identity/actions";

/**
 * The activation button.
 *
 * Confirmed before it fires. This is not a destructive action, but it is a
 * public and irreversible-in-practice one: once the affiliation has been shown
 * to real visitors, switching it back off does not unsee it. That deserves the
 * same friction as a delete.
 */
export function IdentitySwitch({
  isPublic,
  labels,
}: {
  isPublic: boolean;
  labels: {
    activate: string;
    hide: string;
    confirmActivate: string;
    confirmHide: string;
    activateHelp: string;
    hideHelp: string;
    cacheNote: string;
  };
}) {
  return (
    <form
      action={setPartnerIdentity}
      onSubmit={(e) => {
        const message = isPublic ? labels.confirmHide : labels.confirmActivate;
        if (!confirm(message)) e.preventDefault();
      }}
    >
      <input type="hidden" name="enable" value={isPublic ? "false" : "true"} />
      <button
        type="submit"
        className={`rounded-lg px-5 py-3 text-sm font-semibold ${
          isPublic
            ? "border border-line hover:border-danger hover:text-danger"
            : "bg-crimson text-white hover:bg-crimson-strong"
        }`}
      >
        {isPublic ? labels.hide : labels.activate}
      </button>
      <p className="mt-2 max-w-xl text-xs text-muted">
        {isPublic ? labels.hideHelp : labels.activateHelp}
      </p>
      {/* The marketplace is a separate deployment with its own cache. Saying so
          beats an admin refreshing the public site and thinking it failed. */}
      <p className="mt-1 max-w-xl text-xs text-muted">{labels.cacheNote}</p>
    </form>
  );
}
