import Parser from "rss-parser";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 你可以把 retry 设为 0/1：0=不重试，1=失败重试一次
const RETRY_ONCE = 1;

// 超时（ms）
const TIMEOUT_MS = 12000;

const parser = new Parser({
  timeout: TIMEOUT_MS,
  headers: {
    "User-Agent": "news-web/1.0",
  },
});

// 这里的 kyodo 很可能不是 RSS（会返回 HTML），所以我们用“先判断再解析”来保证稳定
const RSS: Record<string, { title: string; url: string }> = {
  nhk: { title: "NHKニュース", url: "https://www3.nhk.or.jp/rss/news/cat0.xml" },
  yahoo: { title: "Yahoo", url: "https://news.yahoo.co.jp/rss/topics/top-picks.xml" },

  // 共同社：如果这个地址返回 HTML，就会稳定报 “NOT_RSS”
  kyodo: { title: "共同通信", url: "https://www.kyodo.co.jp/rss/news/" },

  cnn: { title: "CNN", url: "https://rss.cnn.com/rss/cnn_topstories.rss" },
};

type OkResp = {
  ok: true;
  src: string;
  feedTitle: string;
  count: number;
  items: { title: string; link: string; pubDate: string }[];
};

type ErrResp = {
  ok: false;
  src: string;
  feedTitle: string;
  code: string; // 统一错误码
  error: string; // 给前端展示的错误信息
};

function errJson(src: string, feedTitle: string, code: string, error: string) {
  const body: ErrResp = { ok: false, src, feedTitle, code, error };
  // 注意：这里统一返回 200，让前端只看 ok 字段，不让页面炸
  return NextResponse.json(body, { status: 200 });
}

function okJson(src: string, feedTitle: string, items: OkResp["items"]) {
  const body: OkResp = {
    ok: true,
    src,
    feedTitle,
    count: items.length,
    items,
  };
  return NextResponse.json(body, { status: 200 });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTextWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "news-web/1.0",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "ja,en;q=0.8,zh;q=0.6",
      },
    });

    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(t);
  }
}

// 粗判断：避免把 HTML 当 RSS/XML 解析（共同社最常见问题）
function looksLikeXmlOrRss(text: string) {
  const head = text.trim().slice(0, 300).toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return false;
  // RSS/Atom 常见开头
  return head.includes("<rss") || head.includes("<?xml") || head.includes("<feed");
}

// 修复常见坏实体：把“裸 & ”变成 &amp;（不保证救活所有站，但会更稳）
function sanitizeXml(xml: string) {
  // 去掉控制字符（XML 不允许的一些字符）
  const noCtrl = xml.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // 把不是合法实体的 & 变成 &amp;
  // 合法：&amp; &lt; &gt; &quot; &apos; &#123; &#x1A;
  const fixed = noCtrl.replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[a-f0-9]+;)/gi,
    "&amp;"
  );

  return fixed;
}

async function loadFeedOnce(url: string) {
  const { res, text } = await fetchTextWithTimeout(url, TIMEOUT_MS);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  if (!looksLikeXmlOrRss(text)) {
    // 这就是共同社那种：返回 HTML 的典型情况
    throw new Error("NOT_RSS");
  }

  const safeXml = sanitizeXml(text);
  const feed = await parser.parseString(safeXml);
  return feed;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const src = (searchParams.get("src") || "nhk").toLowerCase();

  const conf = RSS[src];
  if (!conf) {
    // 只有 unknown src 才返回 400（这是调用方错误）
    return NextResponse.json(
      { ok: false, src, feedTitle: "", code: "UNKNOWN_SRC", error: "unknown src" } satisfies ErrResp,
      { status: 400 }
    );
  }

  const feedTitle = conf.title;

  const attempts = 1 + (RETRY_ONCE ? 1 : 0);

  for (let i = 0; i < attempts; i++) {
    try {
      const feed = await loadFeedOnce(conf.url);

      const items =
        (feed.items || []).slice(0, 20).map((it: any) => ({
          title: it?.title || "(no title)",
          link: it?.link || "",
          pubDate: it?.pubDate || it?.isoDate || "",
        })) ?? [];

      return okJson(src, feed.title || feedTitle, items);
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);

      // 最后一次才返回错误；否则等待一下重试
      if (i < attempts - 1) {
        await sleep(350);
        continue;
      }

      // 统一错误码
      if (msg === "NOT_RSS") {
        return errJson(
          src,
          feedTitle,
          "NOT_RSS",
          "该地址返回的不是 RSS/XML（可能是网页HTML），换一个 RSS 链接才会正常"
        );
      }
      if (msg.includes("aborted") || msg.includes("AbortError")) {
        return errJson(src, feedTitle, "TIMEOUT", "请求超时（已尝试重试）");
      }
      if (msg.toLowerCase().includes("tls") || msg.toLowerCase().includes("fetch failed")) {
        return errJson(src, feedTitle, "NETWORK", `网络/TLS 失败（已尝试重试）：${msg}`);
      }
      if (msg.startsWith("HTTP ")) {
        return errJson(src, feedTitle, "HTTP", `上游返回错误：${msg}`);
      }

      return errJson(src, feedTitle, "PARSE", `解析失败（已尝试重试）：${msg}`);
    }
  }

  // 理论不会走到这里
  return errJson(src, feedTitle, "UNKNOWN", "未知错误");
}