// app/api/news/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Src = "nhk" | "kyodo" | "yahoo" | "cnn";

function normalizeSrc(raw: string | null): Src {
  const v = (raw || "nhk").toLowerCase().trim();
  if (v === "nhk" || v === "kyodo" || v === "yahoo" || v === "cnn") return v;
  return "nhk";
}

function jsonOk(payload: unknown, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init?.headers || {}),
    },
  });
}

_toggle:
function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

/**
 * 你要把下面这个地址改成你自己的橙云地址（workers.dev）
 * 例如：
 *   https://young-tree-0724.yongping0719.workers.dev
 */
const WORKER_BASE = process.env.CF_WORKER_BASE_URL || "https://young-tree-0724.yongping0719.workers.dev";

// 橙云拿 RSS 原文时可能比较慢，给它一个合理超时（10~15 秒）
const UPSTREAM_TIMEOUT_MS = Number(process.env.CF_WORKER_TIMEOUT_MS || 15000);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const src = normalizeSrc(url.searchParams.get("src"));

  // 组装橙云请求地址：/ ?src=xxx
  const workerUrl = new URL(WORKER_BASE);
  workerUrl.searchParams.set("src", src);

  const { signal, clear } = withTimeout(UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(workerUrl.toString(), {
      method: "GET",
      signal,
      headers: {
        // 给橙云/上游一个更像浏览器的 UA（部分站点会挑 UA）
        "user-agent": "Mozilla/5.0 (RSS Proxy via Cloudflare Worker)",
        accept: "application/json,text/plain,*/*",
      },
      // next/node 环境下显式禁用缓存更直观
      cache: "no-store",
    });

    clear();

    // 只要橙云不是 2xx，就不要把它的错误原文透传到前端（避免红字/泄漏）
    if (!res.ok) {
      return jsonOk(
        {
          ok: false,
          source: src,
          items: [],
          error: `Worker upstream not ok (${res.status})`,
        },
        { status: 200 }
      );
    }

    // 橙云可能返回：
    // 1) 你未来会改成 JSON（建议）
    // 2) 现在还是原始 RSS/XML 文本（也可以先凑合）
    //
    // 所以这里：优先尝试 JSON；失败就把文本包装一下返回
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        return jsonOk(
          { ok: false, source: src, items: [], error: "Worker JSON parse failed" },
          { status: 200 }
        );
      }

      // 兜底：不让前端因为结构不对而崩
      if (!data || typeof data !== "object") {
        return jsonOk(
          { ok: false, source: src, items: [], error: "Worker JSON invalid" },
          { status: 200 }
        );
      }

      // 如果橙云已经返回 { ok:true, items:[...] } 这种结构，直接透传
      // 否则也做一层规范化
      const ok = Boolean((data as any).ok);
      const items = Array.isArray((data as any).items) ? (data as any).items : [];

      return jsonOk(
        {
          ok,
          source: (data as any).source || src,
          items,
          // 可选：保留 message/error 字段，但不给前端展示原始上游 HTML
          error: ok ? "" : String((data as any).error || ""),
        },
        { status: 200 }
      );
    }

    // 非 JSON：当作文本（RSS/XML）返回，但为了“前端稳定”，依然包装成统一 JSON
    const text = await res.text();

    return jsonOk(
      {
        ok: true,
        source: src,
        // 你现在前端如果还在用 fast-xml-parser 解析 RSS，
        // 可以改为：在前端解析 text（但你说“只读橙云”，所以先把数据放这里）
        rssText: text,
        items: [],
      },
      { status: 200 }
    );
  } catch (e: any) {
    clear();

    // 超时 / 网络错误 / 橙云宕机：统一返回“空数据”，前端不红字
    const isAbort = e?.name === "AbortError";

    return jsonOk(
      {
        ok: false,
        source: src,
        items: [],
        error: isAbort ? "Worker request timeout" : "Worker request failed",
      },
      { status: 200 }
    );
  }
}