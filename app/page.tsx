import Link from "next/link";

function getBaseUrl() {
  // V网页线上（Vercel）
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // 本地开发
  return "http://localhost:3000";
}

async function fetchNews(src: string): Promise<any> {
  const base = getBaseUrl();
  const url = `${base}/api/news?src=${encodeURIComponent(src)}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e: any) {
    return {
      ok: false,
      error: "请求失败（网络/服务器不可达）",
      message: e?.message ?? String(e),
      items: [],
      count: 0,
    };
  }

  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) {
    return {
      ok: false,
      error: `HTTP ${res.status}`,
      message: text.slice(0, 200),
      items: [],
      count: 0,
    };
  }

  if (!ct.includes("application/json")) {
    return {
      ok: false,
      error: `返回的不是 JSON（${ct}）`,
      message: "可能返回了 HTML/文本（比如错误页）",
      sample: text.slice(0, 200),
      items: [],
      count: 0,
    };
  }

  try {
    return JSON.parse(text);
  } catch (e: any) {
    return {
      ok: false,
      error: "JSON 解析失败",
      message: e?.message ?? String(e),
      sample: text.slice(0, 200),
      items: [],
      count: 0,
    };
  }
}

const SOURCES = [
  { key: "nhk", label: "NHK" },
  { key: "kyodo", label: "共同社" },
  { key: "yahoo", label: "Yahoo" },
  { key: "cnn", label: "CNN" },
];

export default async function Home(props: any) {
  // 兼容：searchParams 可能是对象，也可能是 Promise
  const sp = await Promise.resolve(props?.searchParams ?? {});
  const src =
    (typeof sp?.src === "string" && sp.src) ||
    (Array.isArray(sp?.src) ? sp.src[0] : "") ||
    "nhk";

  const data = await fetchNews(src);

  const items = Array.isArray(data?.items) ? data.items : [];
  const count = typeof data?.count === "number" ? data.count : items.length;

  return (
    <main style={{ padding: 24 }}>
      <h1>{src.toUpperCase()} 最新新闻</h1>

      {!data?.ok && (
        <p style={{ color: "crimson", marginTop: 8, whiteSpace: "pre-wrap" }}>
          {src.toUpperCase()} 暂时不可用：{data?.error}
          {data?.message ? `\n${data.message}` : ""}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          margin: "12px 0",
          flexWrap: "wrap",
        }}
      >
        <span>切换来源：</span>
        {SOURCES.map((s) => (
          <Link
            key={s.key}
            href={`/?src=${s.key}`}
            style={{
              padding: "4px 10px",
              border: "1px solid #ccc",
              borderRadius: 8,
              background: src === s.key ? "#e5e7eb" : "transparent",
              textDecoration: "none",
              color: "#111",
            }}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>共 {count} 条</div>

      <ul>
        {items.map((it: any) => (
          <li
            key={it?.link ?? it?.title ?? Math.random()}
            style={{ marginBottom: 10 }}
          >
            <a href={it.link} target="_blank" rel="noreferrer">
              {it.title ?? "(无标题)"}
            </a>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              {it.pubDate ?? it.published ?? ""}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}