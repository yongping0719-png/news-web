// app/api/news/route.ts
import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";

const RSS_MAP: Record<string, string> = {
  nhk: "https://www3.nhk.or.jp/rss/news/cat0.xml",
  yahoo: "https://news.yahoo.co.jp/rss/topics/top-picks.xml",
  cnn: "https://edition.cnn.com/rss/cnn_topstories.rss",
  // kyodo: "把你的共同社RSS填在这里（你贴链接我帮你定）",
};

function pickItems(parsed: any) {
  // 兼容 RSS 2.0 / RDF / Atom 的常见结构
  const channel = parsed?.rss?.channel;
  const rssItems = channel?.item;

  const items = Array.isArray(rssItems) ? rssItems : rssItems ? [rssItems] : [];

  return items.slice(0, 30).map((it: any) => ({
    title: it.title?.["#text"] ?? it.title ?? "",
    link: it.link?.["#text"] ?? it.link ?? "",
    pubDate: it.pubDate ?? it.date ?? "",
    source: channel?.title?.["#text"] ?? channel?.title ?? "",
  }));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const src = (searchParams.get("src") || "nhk").toLowerCase();

    const rssUrl = RSS_MAP[src];
    if (!rssUrl) {
      return NextResponse.json({ ok: false, error: `Unknown src: ${src}` }, { status: 400 });
    }

    const res = await fetch(rssUrl, {
      headers: {
        // 很多站会拦 “无UA/像机器人”的请求
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` },
        { status: 200 }
      );
    }

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(text);

    const items = pickItems(parsed);
    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 200 });
  }
}