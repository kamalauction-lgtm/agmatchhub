import "server-only";

/**
 * Meta Graph API client for the Content Studio's publishing pipeline.
 *
 * Everything here degrades gracefully when META_APP_ID / META_APP_SECRET are
 * absent: `metaConfigured()` is false, the connect page explains what is
 * missing, and nothing else is reachable. The credentials come from a Meta
 * developer app that must pass App Review for `instagram_content_publish` and
 * `pages_manage_posts` — see docs/module-content-studio.md §8 (added with this
 * build) for the exact setup steps.
 *
 * What Meta permits, so nobody wonders later:
 *   - Facebook PAGES and Instagram BUSINESS/CREATOR accounts only. Personal
 *     FB profiles and personal IG accounts have no publishing API at all.
 *   - Instagram publishing requires a PUBLIC image URL — text-only posts do
 *     not exist on IG. The schedule action enforces this up front.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const OAUTH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";

/** Everything the pipeline needs from Meta, in one place. */
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

export function metaConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function redirectUri(): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:8151";
  return `${base}/api/social/oauth/callback`;
}

export function oauthStartUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri(),
    state,
    scope: SCOPES,
    response_type: "code",
  });
  return `${OAUTH_DIALOG}?${params}`;
}

type GraphError = { error?: { message?: string; type?: string; code?: number } };

/** One place to call Graph and turn its error envelope into a thrown Error. */
async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, init);
  const body = (await res.json()) as T & GraphError;
  if (!res.ok || body.error) {
    // Meta error messages are agent-safe (no tokens); tokens never appear in
    // paths we log because they travel in the body/query we do not echo.
    throw new Error(body.error?.message ?? `Graph API ${res.status}`);
  }
  return body;
}

/** OAuth code → short-lived user token → long-lived (~60 days). */
export async function exchangeCodeForLongLivedToken(code: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const short = await graph<{ access_token: string }>(
    `/oauth/access_token?${new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: redirectUri(),
      code,
    })}`
  );

  const long = await graph<{ access_token: string; expires_in?: number }>(
    `/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: short.access_token,
    })}`
  );

  const seconds = long.expires_in ?? 60 * 24 * 60 * 60;
  return { token: long.access_token, expiresAt: new Date(Date.now() + seconds * 1000) };
}

export type MetaPage = {
  id: string;
  name: string;
  /** Page access token — what both FB and IG publishing actually use. */
  access_token: string;
  instagram_business_account?: { id: string; username?: string; name?: string } | null;
};

/** The pages this user manages, each with its page token and any linked IG. */
export async function fetchPages(userToken: string): Promise<MetaPage[]> {
  const res = await graph<{ data: MetaPage[] }>(
    `/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{id,username,name}",
      limit: "50",
      access_token: userToken,
    })}`
  );
  return res.data ?? [];
}

/** Post to a Facebook Page. Photo post when an image exists, text post otherwise. */
export async function publishToFacebookPage(opts: {
  pageId: string;
  pageToken: string;
  caption: string;
  imageUrl?: string | null;
}): Promise<string> {
  if (opts.imageUrl) {
    const res = await graph<{ post_id?: string; id: string }>(`/${opts.pageId}/photos`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        url: opts.imageUrl,
        message: opts.caption,
        access_token: opts.pageToken,
      }),
    });
    return res.post_id ?? res.id;
  }
  const res = await graph<{ id: string }>(`/${opts.pageId}/feed`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: opts.caption, access_token: opts.pageToken }),
  });
  return res.id;
}

/**
 * Post to an Instagram Business account: create a media container, then
 * publish it. Two calls by API design, not by choice.
 */
export async function publishToInstagram(opts: {
  igUserId: string;
  pageToken: string;
  caption: string;
  imageUrl: string;
}): Promise<string> {
  const container = await graph<{ id: string }>(`/${opts.igUserId}/media`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      image_url: opts.imageUrl,
      caption: opts.caption,
      access_token: opts.pageToken,
    }),
  });

  const published = await graph<{ id: string }>(`/${opts.igUserId}/media_publish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: opts.pageToken,
    }),
  });
  return published.id;
}
