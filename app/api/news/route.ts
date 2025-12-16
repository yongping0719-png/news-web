// app/api/news/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const WORKER_BASE = "https://young-tree-0724.yongping0719.workers.dev";
const ALLOWED_SRC = new Set(["nhk", "yahoo", "kyodo", "cnn"]);

/**
 * V网页 /api/news 只做一件事：
 *   把请求转发给橙云 /api/news，并把结果原样返回（不再自己抓 RSS）
 *
 * 例：
 *   /api/news?src=nhk  ->  https://young-tree-0724.yongping0719.workers.dev/api/news?src=nhk
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const srcRaw = (url.searchParams.get("src") || "nhk").toLowerCase().trim();

    if (!ALLOWED_SRC.has(srcRaw)) {
      return NextResponse.json(
        { ok: false, error: "Unknown source", allowed: Array.from(ALLOWED_SRC) },
        { status: 400 }
      );
    }

    const upstreamUrl = `${WORKER_BASE}/api/news?src=${encodeURIComponent(srcRaw)}`;

    // 超时保护：避免橙云偶发卡住时把 V网页 也拖死
    const controller = new AbortController();
    const timeoutMs = 12_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const upstreamRes = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        // 基本上保持 JSON
        Accept: "application/json,text/plain,*/*",
        // 给橙云一个可识别的 UA，便于你在橙云日志里筛查
        "User-Agent": "news-web (Vercel) -> Cloudflare Worker proxy",
      },
      signal: controller.signal,
      // Edge fetch 默认支持缓存，但我们这里用 revalidate 控制
      // （NextResponse 的 cache headers 也会起作用）
    }).finally(() => clearTimeout(timer));

    const contentType = upstreamRes.headers.get("content-type") || "";
    const bodyText = await upstreamRes.text();

    // 透传状态码；同时尽量透传橙云的 content-type
    // 再加一个 V网页侧的短缓存：减少对橙云的压力（你想更实时可以改小）
    const headers: Record<string, string> = {
      "content-type": contentType.includes("application/json")
        ? contentType
        : "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
    };

    // 如果橙云返回的不是 JSON（极少数情况下可能返回了 HTML 错误页）
    // 我们也统一包装成 JSON，方便前端显示红字
    if (!contentType.includes("application/json")) {
      return new NextResponse(
        JSON.stringify({
          ok: false,
          error: "Upstream did not return JSON",
          upstreamStatus: upstreamRes.status,
          upstreamUrl,
          sample: bodyText.slice(0, 800),
        }),
        { status: 502, headers }
      );
    }

    // 正常情况：原样返回橙云 JSON（但保持我们自己的 cache-control）
    return new NextResponse(bodyText, {
      status: upstreamRes.status,
      headers,
    });
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Upstream timeout"
        : (err?.message as string) || "Unknown error";

    return NextResponse.json(
      { ok: false, error: msg },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}