// app/api/news/route.ts
import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";

// ✅ 只走 Worker（不要再直连任何 RSS 源站）
const WORKER_BASE =
  process.env.WORKER_BASE_URL || "https://young-tree-0724.yongping0719.workers.dev";

// 允许的来源（前端传 ?src=nhk / yahoo / cnn / kyodo）
const ALLOWED = new Set(["nhk", "yahoo", "cnn", "kyodo"]);

function pickItems(parsed: any) {
  // 兼容 RSS 2.0 / Atom / RDF 的常见结构
  const rssChannel = parsed?.rss?.channel;
  const rdfChannel = parsed?.RDF?.channel;
  const atomFeed = parsed?.feed;

  // RSS2 / RDF
  const channel = rssChannel || rdfChannel;
  const rssItems = channel?.item;

  // Atom
  const atomEntries = atomFeed?.entry;

  // 统一成数组
  const items = Array.isArray(rssItems)
    ? rssItems
    : rssItems
    ? [rssItems]
    : Array.isArray(atomEntries)
    ? atomEntries
    : atomEntries
    ? [atomEntries]
    : [];

  // 取标题/链接/时间（做最大兼容）
  return items.slice(0, 30).map((it: any) => {
    // title
    const title =
      it?.title?.["#text"] ??
      it?.title?._text ??
      it?.title ??
      it?.["atom:title"] ??
      "";

    // link（RSS: <link>xxx</link>；Atom: <link href="..."/> 或 link[]）
    let link =
      it?.link?.["#text"] ??
      it?.link?._text ??
      it?.link ??
      "";

    if (!link && it?.link?.["@_href"]) link = it.link["@_href"];
    if (!link && Array.isArray(it?.link)) {
      const alt =
        it.link.find((x: any) => x?.["@_rel"] === "alternate") || it.link[0];
      link = alt?.["@_href"] || "";
    }

    // pubDate / updated / date
    const pubDate =
      it?.pubDate ??
      it?.updated ??
      it?.date ??
      it?.published ??
      "";

    return { title: String(title), link: String(link), pubDate: String(pubDate) };
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const srcRaw = (searchParams.get("src") || "nhk").toLowerCase();

    if (!ALLOWED.has(srcRaw)) {
      return NextResponse.json(
        { ok: false, error: `Unknown src: ${srcRaw}` },
        { status: 400 }
      );
    }

    // ✅ 只请求 Worker，不请求任何 RSS 源站
    const workerUrl = `${WORKER_BASE.replace(/\/$/, "")}/?src=${encodeURIComponent(
      srcRaw
    )}`;

    const wRes = await fetch(workerUrl, {
      cache: "no-store",
      headers: {
        // 让 Worker/中间层更像正常请求（可有可无）
        "Accept": "application/json,text/plain,*/*",
      },
    });

    const wText = await wRes.text();

    // Worker 理想返回：{ ok:true, source:"nhk", rss:"<xml...>" }
    // 但也兼容 Worker 直接返回 XML 文本
    let payload: any = null;
    try {
      payload = JSON.parse(wText);
    } catch {
      payload = null;
    }

    // 如果是 JSON 且 ok=false，直接把错误透传给前端（保持你现在的红字逻辑）
    if (payload && payload.ok === false) {
      const msg = payload.error || "Worker returned ok=false";
      return NextResponse.json(
        { ok: false, error: msg, detail: payload },
        { status: 502 }
      );
    }

    // 拿到 RSS XML 字符串
    const rssXml =
      (payload && typeof payload.rss === "string" && payload.rss) ||
      // 兼容：Worker 直接返回 XML
      (typeof wText === "string" ? wText : "");

    if (!rssXml || !rssXml.includes("<")) {
      return NextResponse.json(
        { ok: false, error: "No RSS XML received from Worker", sample: wText?.slice?.(0, 200) },
        { status: 502 }
      );
    }

    // 解析 RSS
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      // 允许各种奇怪的 RSS
      removeNSPrefix: true,
      parseTagValue: true,
      parseAttributeValue: true,
      trimValues: true,
    });

    const parsed = parser.parse(rssXml);
    const items = pickItems(parsed);

    return NextResponse.json({
      ok: true,
      source: srcRaw,
      worker: workerUrl,
      count: items.length,
      items,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}