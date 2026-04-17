/**
 * Fetch wrapper for the Kanzec API.
 *
 * - Access token lives in memory only (set via setAccessToken below).
 * - On 401 due to access expiry we try /api/auth/refresh once; on success the
 *   original request is retried. If refresh itself 401s we fall back to logout.
 * - The refresh cookie is httpOnly + Secure + SameSite=Strict, scoped to
 *   /api/auth — the fetch wrapper doesn't touch it directly.
 */

let accessToken: string | null = null;
let onLogoutHandler: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setOnLogout(fn: () => void) {
  onLogoutHandler = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `API error ${status}`);
  }
}

export interface ApiOptions extends RequestInit {
  /** Skip the auto-refresh retry — used by /api/auth/refresh itself. */
  skipRefresh?: boolean;
  /** Send the refresh cookie (for /api/auth/* calls). */
  withCookies?: boolean;
}

async function refreshOnce(): Promise<boolean> {
  try {
    const resp = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { access_token: string };
    accessToken = data.access_token;
    return true;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipRefresh, withCookies, headers, ...rest } = options;

  const doFetch = async (): Promise<Response> => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(headers as Record<string, string> | undefined),
    };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return fetch(path, {
      ...rest,
      headers: h,
      credentials: withCookies ? "include" : "same-origin",
    });
  };

  let resp = await doFetch();

  if (resp.status === 401 && !skipRefresh && !path.startsWith("/api/auth/")) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      resp = await doFetch();
    } else {
      accessToken = null;
      onLogoutHandler?.();
      throw new ApiError(401, null, "not authenticated");
    }
  }

  if (resp.status === 204) return undefined as unknown as T;

  const ctype = resp.headers.get("content-type") ?? "";
  const body = ctype.includes("application/json") ? await resp.json() : await resp.text();

  if (!resp.ok) throw new ApiError(resp.status, body, typeof body === "string" ? body : undefined);
  return body as T;
}
