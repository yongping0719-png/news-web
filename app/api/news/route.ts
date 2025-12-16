import { NextRequest, NextResponse } from "next/server";

// ✅ 只做转发，不在 V网页 侧抓 RSS
// ✅ 默认走你当前的橙云域名（可改成环境变量更安全）
const WORKER_BASE =
  process.env.WORKER_BASE_URL?.replace(/\/$/, "") ||
  "https://young-tree-0724.yongping0719.workers.dev";

const ALLOWED = new Set(["nhk", "yahoo", "kyodo", "cnn"]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const srcRaw = (searchParams.get("src") || "nhk").toLowerCase();
    const src = ALLOWED.has(srcRaw) ? srcRaw : "nhk";

    // ✅ 关键：永远只请求橙云
    const workerUrl = `${WORKER_BASE}/api/news?src=${encodeURIComponent(src)}`;

    const res = await fetch(workerUrl, {
      // V网页这边不缓存，让橙云自己缓存（你橙云里已经配了 cf cacheTtl）
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const text = await res.text();

    // 直接透传橙云的 JSON
    // 如果橙云返回的不是 JSON，也原样返回，方便排错
    const contentType = res.headers.get("content-type") || "application/json; charset=utf-8";

    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": contentType,
        "access-control-allow-origin": "*",
        // 可选：给浏览器/边缘一点点缓存（你要更实时可以删掉）
        "cache-control": "public, max-age=0, s-maxage=60",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "V网页 api route exception", message: String(e) },
      { status: 500 }
    );
  }
}