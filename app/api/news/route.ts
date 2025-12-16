// app/api/news/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * 只读橙云，不在 V网页 里直接抓 RSS（避免跨站、反爬、XML 解析差异等问题）
 *
 * 允许的 src：
 * - nhk
 * - yahoo
 * - kyodo
 * - cnn
 *
 * 访问示例：
 * /api/news?src=nhk
 */
const ALLOWED = new Set(["nhk", "yahoo", "kyodo", "cnn"]);

// ✅ 你的橙云域名（按你要求：直接给完整可点开的）
const WORKER_BASE = "https://young-tree-0724.yongping0719.workers.dev";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const src = (url.searchParams.get("src") || "nhk").toLowerCase();

    if (!ALLOWED.has(src)) {
      return NextResponse.json(
        { ok: false, error: "Invalid src", allowed: Array.from(ALLOWED) },
        { status: 400 }
      );
    }

    // 转发到橙云
    const upstream = `${WORKER_BASE}/api/news?src=${encodeURIComponent(src)}`;

    const res = await fetch(upstream, {
      // 轻量缓存：让边缘节点缓存一会儿，减少频繁打到橙云
      // 你也可以之后再调大
      next: { revalidate: 30 },
      headers: {
        // 传一个简单 UA（可选）
        "User-Agent": "news-web (Vercel) proxy",
        Accept: "application/json",
      },
    });

    // 橙云返回非 200：把内容透传回来，方便你排错
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `Upstream ${res.status}`,
          upstream,
          sample: text.slice(0, 300),
        },
        { status: 502 }
      );
    }

    // 正常：把 JSON 原样转回给前端
    const data = await res.json();

    // 统一加一点缓存头（浏览器/边缘都能吃到）
    return NextResponse.json(data, {
      status: 200,
      headers: {
        // public: 允许 CDN 缓存；s-maxage: CDN 缓存 30s；stale-while-revalidate: 60s
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Server error",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}