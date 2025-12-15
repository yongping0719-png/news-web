import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";

const WORKER_BASE =
  process.env.NEWS_WORKER_BASE_URL || "https://young-tree-0724.yongping0719.workers.dev";
// 例如： https://young-tree-0724.yongping0719.workers.dev

function json(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const src = (searchParams.get("src") || "nhk").toLowerCase();

    const url = `${WORKER_BASE}/?src=${encodeURIComponent(src)}`;

    const res = await fetch(url, {
      headers: {
        // 有些情况下加个 UA 更稳
        "user-agent": "Mozilla/5.0 (RSS Proxy via Cloudflare Worker)",
        accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await res.text();
    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
      return json(
        {
          ok: false,
          error: `Upstream ${res.status} ${res.statusText}`,
          detail: text.slice(0, 500),
        },
        502
      );
    }

    // Worker 应该返回 JSON；万一没返回也给你明确错误
    if (!ct.includes("application/json")) {
      return json(
        {
          ok: false,
          error: `Upstream returned non-JSON (${ct || "unknown"})`,
          detail: text.slice(0, 500),
        },
        502
      );
    }

    // 这里直接把 Worker 的 JSON 透传给前端
    const data = JSON.parse(text);
    return json(data, 200);
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: e?.message || String(e),
      },
      500
    );
  }
}