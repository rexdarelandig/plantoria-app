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
  created_at: string;
  updated_at: string;
  user_id: number;
  location_id?: number | null;
  location?: { id: number; name: string } | null;
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

export type PlantSortField = "created_at" | "name" | "scientific_name" | "updated_at";

export type PlantSortRule = {
  field: PlantSortField;
  direction: "asc" | "desc";
};

export type GetPlantsParams = {
  page?: number;
  perPage?: number;
  /**
   * Ordered sort criteria. Sent as comma-separated `sort` and `direction`
   * (e.g. `sort=name,scientific_name&direction=asc,desc`).
   */
  sortRules?: PlantSortRule[];
  /** Sent as `search`; wire this query param in Laravel (e.g. where name/description ilike). */
  search?: string;
};

export type Location = {
  id: number;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  user_id: number;
};

export type LocationSortField =
  | "created_at"
  | "name"
  | "updated_at";

function parseLocationsResponse(raw: unknown): Location[] {
  if (Array.isArray(raw)) {
    return raw as Location[];
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) {
      return o.data as Location[];
    }
  }
  return [];
}

export type PlantsListMeta = {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
};

export type PlantsListResult = {
  plants: Plant[];
  meta: PlantsListMeta;
};

function parsePlantsResponse(
  raw: unknown,
  fallback: { page: number; perPage: number }
): PlantsListResult {
  const { page, perPage } = fallback;

  if (Array.isArray(raw)) {
    const plants = (raw as unknown[]).map((p) => normalizePlantFromApi(p));
    const total = plants.length;
    return {
      plants,
      meta: {
        currentPage: 1,
        lastPage: 1,
        perPage: total || perPage,
        total,
      },
    };
  }

  if (!raw || typeof raw !== "object") {
    return {
      plants: [],
      meta: {
        currentPage: page,
        lastPage: 1,
        perPage,
        total: 0,
      },
    };
  }

  const o = raw as Record<string, unknown>;
  const plants = Array.isArray(o.data)
    ? (o.data as unknown[]).map((p) => normalizePlantFromApi(p))
    : [];

  const metaRaw = o.meta;
  if (metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)) {
    const m = metaRaw as Record<string, unknown>;
    return {
      plants,
      meta: {
        currentPage:
          typeof m.current_page === "number" ? m.current_page : page,
        lastPage: typeof m.last_page === "number" ? m.last_page : 1,
        perPage: typeof m.per_page === "number" ? m.per_page : perPage,
        total: typeof m.total === "number" ? m.total : plants.length,
      },
    };
  }

  if (
    typeof o.current_page === "number" ||
    typeof o.last_page === "number" ||
    typeof o.total === "number"
  ) {
    return {
      plants,
      meta: {
        currentPage:
          typeof o.current_page === "number" ? o.current_page : page,
        lastPage: typeof o.last_page === "number" ? o.last_page : 1,
        perPage:
          typeof o.per_page === "number" ? Number(o.per_page) : perPage,
        total: typeof o.total === "number" ? o.total : plants.length,
      },
    };
  }

  const total = plants.length;
  return {
    plants,
    meta: {
      currentPage: 1,
      lastPage: 1,
      perPage: total || perPage,
      total,
    },
  };
}

/**
 * GET /api/plants with optional Laravel-style pagination/sorting.
 * Query: page, per_page, sort, direction (comma-separated when multi), search
 */
export async function getPlants(
  token: string | null,
  params: GetPlantsParams = {},
  options?: { signal?: AbortSignal }
): Promise<PlantsListResult> {
  const base = getLaravelBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.max(1, params.perPage ?? 15);

  const searchParams = new URLSearchParams();
  searchParams.set("page", String(page));
  searchParams.set("per_page", String(perPage));
  const rules = params.sortRules?.filter((r) => r.field);
  if (rules?.length) {
    searchParams.set("sort", rules.map((r) => r.field).join(","));
    searchParams.set("direction", rules.map((r) => r.direction).join(","));
  }
  const q = params.search?.trim();
  if (q) {
    searchParams.set("search", q);
  }

  const url = `${base}/api/plants?${searchParams.toString()}`;

  const res = await fetch(url, {
    credentials: "include",
    headers,
    signal: options?.signal,
  });

  if (!res.ok) {
    throw new Error("Could not load plants.");
  }

  const raw = (await res.json()) as unknown;
  return parsePlantsResponse(raw, { page, perPage });
}

/**
 * GET /api/locations — returns the full list; filter/sort/paginate in the client.
 */
export async function getLocations(
  token: string | null,
  options?: { signal?: AbortSignal }
): Promise<Location[]> {
  const base = getLaravelBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${base}/api/locations`;

  const res = await fetch(url, {
    credentials: "include",
    headers,
    signal: options?.signal,
  });

  if (!res.ok) {
    throw new Error("Could not load locations.");
  }

  const raw = (await res.json()) as unknown;
  return parseLocationsResponse(raw);
}

export type CreatePlantPayload = {
  name: string;
  description: string;
  /** Required when plants belong to a location. */
  location_id: number;
  scientific_name?: string;
  image_url?: string;
  trefle_id?: number;
};

export type UpdatePlantPayload = {
  name: string;
  description: string;
  scientific_name?: string;
  location_id: number | null;
};

function formatCreatePlantError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    const errs = o.errors;
    if (errs && typeof errs === "object" && !Array.isArray(errs)) {
      const first = Object.values(errs)[0];
      if (Array.isArray(first) && typeof first[0] === "string") return first[0];
      if (typeof first === "string") return first;
    }
  }
  if (status === 401) return "You must be signed in to add a plant.";
  if (status === 422) return "Please check the plant details.";
  return "Could not save plant.";
}

function formatUpdatePlantError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    const errs = o.errors;
    if (errs && typeof errs === "object" && !Array.isArray(errs)) {
      const first = Object.values(errs)[0];
      if (Array.isArray(first) && typeof first[0] === "string") return first[0];
      if (typeof first === "string") return first;
    }
  }
  if (status === 401) return "You must be signed in to update a plant.";
  if (status === 404) return "Plant not found.";
  if (status === 422) return "Please check the plant details.";
  return "Could not update plant.";
}

function formatDeletePlantError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    const errs = o.errors;
    if (errs && typeof errs === "object" && !Array.isArray(errs)) {
      const first = Object.values(errs)[0];
      if (Array.isArray(first) && typeof first[0] === "string") return first[0];
      if (typeof first === "string") return first;
    }
  }
  if (status === 401) return "You must be signed in to delete a plant.";
  if (status === 404) return "Plant not found.";
  return "Could not delete plant.";
}

function normalizePlantFromApi(item: unknown): Plant {
  if (!item || typeof item !== "object") {
    return item as Plant;
  }
  const raw = item as Record<string, unknown>;
  const plant = item as Plant;

  let nestedLoc: { id: number; name: string } | undefined;
  const locVal = raw.location;
  if (locVal && typeof locVal === "object" && !Array.isArray(locVal)) {
    const L = locVal as Record<string, unknown>;
    if (typeof L.id === "number") {
      nestedLoc = {
        id: L.id,
        name: typeof L.name === "string" ? L.name : "",
      };
    }
  }

  let locationId: number | null | undefined;
  const lidRaw = raw.location_id;
  if (typeof lidRaw === "number") {
    locationId = lidRaw;
  } else if (lidRaw === null) {
    locationId = null;
  } else if (
    typeof lidRaw === "string" &&
    lidRaw.trim() !== "" &&
    !Number.isNaN(Number(lidRaw))
  ) {
    locationId = Number(lidRaw);
  } else if (typeof raw.locationId === "number") {
    locationId = raw.locationId;
  } else if (raw.locationId === null) {
    locationId = null;
  } else if (
    typeof raw.locationId === "string" &&
    raw.locationId.trim() !== "" &&
    !Number.isNaN(Number(raw.locationId))
  ) {
    locationId = Number(raw.locationId);
  } else if (nestedLoc !== undefined) {
    locationId = nestedLoc.id;
  } else if (typeof plant.location_id === "number") {
    locationId = plant.location_id;
  } else if (plant.location_id === null) {
    locationId = null;
  }

  return {
    ...plant,
    ...(locationId !== undefined ? { location_id: locationId } : {}),
    ...(nestedLoc !== undefined
      ? { location: nestedLoc }
      : plant.location !== undefined
        ? { location: plant.location }
        : {}),
  };
}

function parseCreatedPlant(raw: unknown): Plant {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const inner =
      o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : o;
    if (typeof inner.name === "string") {
      return normalizePlantFromApi(inner);
    }
  }
  throw new Error("Unexpected response when creating plant.");
}

function parseCreatedLocation(raw: unknown): Location {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (o.data && typeof o.data === "object") {
      return o.data as Location;
    }
    if (typeof o.name === "string" && typeof o.id === "number") {
      return raw as Location;
    }
  }
  throw new Error("Unexpected response when creating location.");
}

export type CreateLocationPayload = {
  name: string;
  description?: string | null;
};

export type UpdateLocationPayload = {
  name: string;
  description?: string | null;
};

function formatCreateLocationError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    const errs = o.errors;
    if (errs && typeof errs === "object" && !Array.isArray(errs)) {
      const first = Object.values(errs)[0];
      if (Array.isArray(first) && typeof first[0] === "string") return first[0];
      if (typeof first === "string") return first;
    }
  }
  if (status === 401) return "You must be signed in to add a location.";
  if (status === 422) return "Please check the location details.";
  return "Could not save location.";
}

function formatUpdateLocationError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    const errs = o.errors;
    if (errs && typeof errs === "object" && !Array.isArray(errs)) {
      const first = Object.values(errs)[0];
      if (Array.isArray(first) && typeof first[0] === "string") return first[0];
      if (typeof first === "string") return first;
    }
  }
  if (status === 401) return "You must be signed in to update a location.";
  if (status === 404) return "Location not found.";
  if (status === 422) return "Please check the location details.";
  return "Could not update location.";
}

function formatDeleteLocationError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    const errs = o.errors;
    if (errs && typeof errs === "object" && !Array.isArray(errs)) {
      const first = Object.values(errs)[0];
      if (Array.isArray(first) && typeof first[0] === "string") return first[0];
      if (typeof first === "string") return first;
    }
  }
  if (status === 401) return "You must be signed in to delete a location.";
  if (status === 404) return "Location not found.";
  return "Could not delete location.";
}

export async function deleteLocation(
  token: string | null,
  id: number
): Promise<void> {
  const base = getLaravelBaseUrl();
  await ensureSanctumCsrfCookie();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}/api/locations/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as unknown;
    throw new Error(formatDeleteLocationError(raw, res.status));
  }
}

export async function createPlant(
  token: string | null,
  payload: CreatePlantPayload
): Promise<Plant> {
  const base = getLaravelBaseUrl();
  await ensureSanctumCsrfCookie();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}/api/plants`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({
      name: payload.name.trim(),
      description: payload.description.trim(),
      location_id: payload.location_id,
      ...(payload.scientific_name !== undefined && payload.scientific_name !== ""
        ? { scientific_name: payload.scientific_name.trim() }
        : {}),
      ...(payload.image_url !== undefined && payload.image_url !== ""
        ? { image_url: payload.image_url.trim() }
        : {}),
      ...(payload.trefle_id !== undefined ? { trefle_id: payload.trefle_id } : {}),
    }),
  });

  const raw = (await res.json().catch(() => ({}))) as unknown;

  if (!res.ok) {
    throw new Error(formatCreatePlantError(raw, res.status));
  }

  return parseCreatedPlant(raw);
}

export async function deletePlant(
  token: string | null,
  id: number
): Promise<void> {
  const base = getLaravelBaseUrl();
  await ensureSanctumCsrfCookie();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `${base}/api/plants/${encodeURIComponent(String(id))}`,
    {
      method: "DELETE",
      credentials: "include",
      headers,
    },
  );

  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as unknown;
    throw new Error(formatDeletePlantError(raw, res.status));
  }
}

/**
 * PATCH /api/plants/:id
 */
export async function updatePlant(
  token: string | null,
  id: number,
  payload: UpdatePlantPayload
): Promise<Plant> {
  const base = getLaravelBaseUrl();
  await ensureSanctumCsrfCookie();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `${base}/api/plants/${encodeURIComponent(String(id))}`,
    {
      method: "PATCH",
      credentials: "include",
      headers,
      body: JSON.stringify({
        name: payload.name.trim(),
        description: payload.description.trim(),
        scientific_name: payload.scientific_name?.trim() ?? "",
        location_id: payload.location_id,
      }),
    },
  );

  const raw = (await res.json().catch(() => ({}))) as unknown;

  if (!res.ok) {
    throw new Error(formatUpdatePlantError(raw, res.status));
  }

  return parseCreatedPlant(raw);
}

export async function createLocation(
  token: string | null,
  payload: CreateLocationPayload
): Promise<Location> {
  const base = getLaravelBaseUrl();
  await ensureSanctumCsrfCookie();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base}/api/locations`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });

  const raw = (await res.json().catch(() => ({}))) as unknown;

  if (!res.ok) {
    throw new Error(formatCreateLocationError(raw, res.status));
  }

  return parseCreatedLocation(raw);
}

/**
 * PATCH /api/locations/:id
 */
export async function updateLocation(
  token: string | null,
  id: number,
  payload: UpdateLocationPayload
): Promise<Location> {
  const base = getLaravelBaseUrl();
  await ensureSanctumCsrfCookie();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...xsrfHeaders(),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `${base}/api/locations/${encodeURIComponent(String(id))}`,
    {
      method: "PATCH",
      credentials: "include",
      headers,
      body: JSON.stringify({
        name: payload.name.trim(),
        description:
          payload.description === undefined || payload.description === null
            ? ""
            : String(payload.description).trim(),
      }),
    },
  );

  const raw = (await res.json().catch(() => ({}))) as unknown;

  if (!res.ok) {
    throw new Error(formatUpdateLocationError(raw, res.status));
  }

  return parseCreatedLocation(raw);
}