// app/api/news/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function withCors(res: NextResponse) {
  // 同源一般用不到，但加上不坏事，方便以后你前后端分离
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const src = (url.searchParams.get("src") || "nhk").toLowerCase();

    // 你的橙云域名（可选：你也可以在 V网页 的环境变量里设置 NEWS_WORKER_BASE）
    const WORKER_BASE =
      process.env.NEWS_WORKER_BASE ||
      "https://young-tree-0724.yongping0719.workers.dev";

    const base = WORKER_BASE.replace(/\/+$/, "");
    const target = `${base}/api/news?src=${encodeURIComponent(src)}`;

    // 关键：这里只做“代理”，不做任何 RSS/XML 解析
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const upstream = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
      // 让 V网页 不缓存旧数据（需要缓存的话我们下一步再加 s-maxage）
      cache: "no-store",
    }).finally(() => clearTimeout(timer));

    const text = await upstream.text();

    // 尝试按 JSON 返回；如果上游不是 JSON，就包一层错误返回
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        ok: false,
        error: "Upstream returned non-JSON",
        status: upstream.status,
        target,
        sample: text.slice(0, 500),
      };
    }

    // 把橙云的结果原样返回给前端
    const res = NextResponse.json(data, { status: upstream.ok ? 200 : 502 });
    res.headers.set("Cache-Control", "no-store");
    return withCors(res);
  } catch (err: any) {
    const res = NextResponse.json(
      {
        ok: false,
        error: "V网页 api proxy failed",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
    res.headers.set("Cache-Control", "no-store");
    return withCors(res);
  }
}