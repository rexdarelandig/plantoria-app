import { NextRequest, NextResponse } from "next/server";

const TREFLE_BASE = "https://trefle.io/api/v1";

/**
 * Proxies Trefle plant search so the access token stays on the server.
 * @see https://docs.trefle.io/docs/guides/searching/
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Query “q” is required." }, { status: 400 });
  }

  const token = process.env.TREFLE_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Missing TREFLE_TOKEN. Add it to .env.local (see https://trefle.io/).",
      },
      { status: 503 }
    );
  }

  const url = new URL(`${TREFLE_BASE}/plants/search`);
  url.searchParams.set("token", token);
  url.searchParams.set("q", q);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      typeof data === "object" && data !== null
        ? data
        : { error: "Trefle request failed." },
      { status: res.status }
    );
  }

  return NextResponse.json(data);
}
