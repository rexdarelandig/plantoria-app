/** Base URL for the Laravel app (no trailing slash). */
export function getLaravelBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_LARAVEL_URL?.replace(/\/$/, "") ??
    "http://localhost:8000"
  );
}

export type AuthUser = {
  email: string;
  id?: number;
  name?: string;
};

export type LoginJson = {
  token?: string;
  user?: AuthUser;
  data?: { token?: string; user?: AuthUser };
  message?: string;
  errors?: Record<string, string[] | string>;
};

export type Plant = {
  id: number;
  name: string;
  scientific_name: string;
  description: string;
  image_url: string;
  slug: string;
  created_at: string;
  updated_at: string;
  user_id: number;
};

function pickToken(body: LoginJson): string | undefined {
  return body.token ?? body.data?.token;
}

function pickUser(body: LoginJson): AuthUser | undefined {
  const nested = body.user ?? body.data?.user;
  if (nested?.email) return nested;
  const flat = body as unknown as Record<string, unknown>;
  if (typeof flat.email === "string") {
    return {
      email: flat.email,
      id: typeof flat.id === "number" ? flat.id : undefined,
      name: typeof flat.name === "string" ? flat.name : undefined,
    };
  }
  return undefined;
}

export function formatLoginError(body: LoginJson, status: number): string {
  if (body.errors) {
    const first = Object.values(body.errors)[0];
    if (Array.isArray(first) && first[0]) return first[0];
    if (typeof first === "string") return first;
  }
  if (body.message) return body.message;
  return status === 401 ? "Invalid email or password." : "Sign in failed.";
}

/** Laravel sets this after `GET /sanctum/csrf-cookie` (must send on state-changing requests). */
function readXsrfTokenFromCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const row = document.cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="));
  if (!row) return undefined;
  const value = row.slice("XSRF-TOKEN=".length);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function xsrfHeaders(): Record<string, string> {
  const token = readXsrfTokenFromCookie();
  return token ? { "X-XSRF-TOKEN": token } : {};
}

/** Call before login (or other cookie + CSRF-protected POSTs) when using Sanctum SPA mode. */
export async function ensureSanctumCsrfCookie(): Promise<void> {
  const base = getLaravelBaseUrl();
  const res = await fetch(`${base}/sanctum/csrf-cookie`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error("Could not initialize session (CSRF cookie).");
  }
}

export async function loginWithPassword(
  email: string,
  password: string
): Promise<{ token: string | null; user: AuthUser }> {
  const base = getLaravelBaseUrl();
  await ensureSanctumCsrfCookie();

  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...xsrfHeaders(),
    },
    body: JSON.stringify({ email, password }),
  });

  const body = (await res.json()) as LoginJson;

  if (!res.ok) {
    throw new Error(formatLoginError(body, res.status));
  }

  const token = pickToken(body) ?? null;
  let user = pickUser(body);

  if (!user?.email) {
    user = await fetchCurrentUser(token);
  }

  if (!user?.email) {
    throw new Error("Signed in but user details were not returned.");
  }

  return { token, user };
}

export async function fetchCurrentUser(
  token: string | null
): Promise<AuthUser> {
  const base = getLaravelBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}/api/user`, {
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    throw new Error("Could not load your profile.");
  }

  const raw = (await res.json()) as unknown;
  let user: AuthUser | null = pickUser(raw as LoginJson) ?? null;
  if (!user?.email && raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const d = o.data;
    if (d && typeof d === "object") {
      const inner = d as Record<string, unknown>;
      if (typeof inner.email === "string") {
        user = {
          email: inner.email,
          id: typeof inner.id === "number" ? inner.id : undefined,
          name: typeof inner.name === "string" ? inner.name : undefined,
        };
      }
    }
  }
  if (!user?.email && raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.email === "string") {
      user = {
        email: o.email,
        id: typeof o.id === "number" ? o.id : undefined,
        name: typeof o.name === "string" ? o.name : undefined,
      };
    }
  }
  if (!user?.email) {
    throw new Error("Profile response did not include an email.");
  }
  return user;
}

export async function logoutOnServer(token: string | null): Promise<void> {
  const base = getLaravelBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    await fetch(`${base}/api/logout`, {
      method: "POST",
      credentials: "include",
      headers,
    });
  } catch {
    /* best-effort */
  }
}

export async function getPlants(
  token: string | null,
  options?: { signal?: AbortSignal }
): Promise<Plant[]> {
  const base = getLaravelBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}/api/plants`, {
    credentials: "include",
    headers,
    signal: options?.signal,
  });

  if (!res.ok) {
    throw new Error("Could not load plants.");
  }

  const raw = (await res.json()) as unknown;
  if (Array.isArray(raw)) {
    return raw as Plant[];
  }
  if (
    raw &&
    typeof raw === "object" &&
    "data" in raw &&
    Array.isArray((raw as { data: unknown }).data)
  ) {
    return (raw as { data: Plant[] }).data;
  }
  return [];
}