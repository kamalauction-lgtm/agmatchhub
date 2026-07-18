import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";

export default async function NotificationsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("notificationsPage");

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, kind, payload, href, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  async function markAllRead() {
    "use server";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    revalidatePath("/notifications");
  }

  return (
    <AgentShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {rows?.some((r) => !r.read_at) && (
          <form action={markAllRead}>
            <button type="submit"
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-crimson hover:text-crimson">
              {t("markAllRead")}
            </button>
          </form>
        )}
      </div>

      {!rows?.length ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id}
              className={`rounded-lg border px-4 py-3 text-sm ${
                n.read_at ? "border-line" : "border-crimson/40 bg-crimson-soft/30"
              }`}>
              <div className="flex items-center justify-between gap-4">
                <span className={n.read_at ? "" : "font-semibold"}>
                  {t(`kinds.${n.kind.replaceAll(".", "_")}`)}
                  {(n.payload as { ref?: string })?.ref && (
                    <span className="ml-2 font-mono text-xs text-muted">
                      {(n.payload as { ref?: string }).ref}
                    </span>
                  )}
                </span>
                <span className="text-xs whitespace-nowrap text-muted">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>
              {n.href && (
                <Link href={n.href} className="mt-1 inline-block text-xs font-medium text-crimson hover:underline">
                  {t("open")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </AgentShell>
  );
}
