/**
 * Auth context. Holds the current user in React state and owns the login /
 * logout / refresh-on-mount flow. Access token lives in api.ts (not React
 * state) so it's never serialized into React DevTools / localStorage.
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ApiError,
  api,
  getAccessToken,
  setAccessToken,
  setOnLogout,
} from "./api";

export type Role = "admin" | "operator" | "viewer";

export interface User {
  id: number;
  username: string;
  role: Role;
}

interface TokenResponse {
  access_token: string;
  user: User;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, try a silent refresh. If it succeeds, we've got a session
  // from a previous page load; if it fails, the user must log in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (!resp.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = (await resp.json()) as TokenResponse;
        if (cancelled) return;
        setAccessToken(data.access_token);
        setUser(data.user);
      } catch {
        /* network error; treat as logged out */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* swallow — we're logging out locally regardless */
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  // Let api.ts yank us back to a clean state on refresh failure.
  useEffect(() => {
    setOnLogout(() => {
      setAccessToken(null);
      setUser(null);
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      withCookies: true,
    });
    setAccessToken(data.access_token);
    setUser(data.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

export function hasRole(user: User | null, ...roles: Role[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

// Surface ApiError so callers can pattern-match on .status without importing api.ts.
export { ApiError, getAccessToken };
