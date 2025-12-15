import { NextResponse } from "next/server";

const WORKER_BASE =
  process.env.NEWS_WORKER_BASE_URL || "https://young-tree-0724.yongping0719.workers.dev";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const src = (searchParams.get("src") || "nhk").toLowerCase();

    const url = `${WORKER_BASE}/?src=${encodeURIComponent(src)}`;
    const res = await fetch(url, { cache: "no-store" });

    const text = await res.text();
    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Worker ${res.status} ${res.statusText}: ${text.slice(0, 200)}` },
        { status: 200 }
      );
    }

    // Worker 应该返回 JSON；万一不是，也把原文吐出来方便排查
    if (!ct.includes("application/json")) {
      return NextResponse.json(
        { ok: false, error: `Worker returned non-JSON (${ct}). First bytes: ${text.slice(0, 200)}` },
        { status: 200 }
      );
    }

    const data = JSON.parse(text);
    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 200 });
  }
}