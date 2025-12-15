import { headers } from "next/headers";
import Link from "next/link";
function getBaseUrl() {
  // Vercel 线上
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // 本地开发
  return "http://localhost:3000";
}

async function fetchNews(src: string) {
  const base = getBaseUrl();
  const url = `${base}/api/news?src=${encodeURIComponent(src)}`;

  const res = await fetch(url, { cache: "no-store" });

  const text = await res.text();
  const ct = res.headers.get("content-type") || "";

  if (!res.ok) {
    return {
      ok: false,
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  if (!ct.includes("application/json")) {
    return {
      ok: false,
      error: `返回的不是 JSON（${ct}），可能是 HTML 页面`,
    };
  }

  return JSON.parse(text);
}
const SOURCES = [
  { key: "nhk", label: "NHK" },
  { key: "kyodo", label: "共同社" },
  { key: "yahoo", label: "Yahoo" },
  { key: "cnn", label: "CNN" },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  const sp = await searchParams;               // ✅ 关键：await
  const src = sp?.src ?? "nhk";

  const data = await fetchNews(src);

  return (
    <main style={{ padding: 24 }}>
      <h1>{src.toUpperCase()} 最新新闻</h1>
{!data.ok && (
  <p style={{ color: "crimson", marginTop: 8 }}>
    {src.toUpperCase()} 暂时不可用：{data.error}
  </p>
)}
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
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

      <div style={{ marginBottom: 8 }}>共 {data.count ?? data.items?.length ?? 0} 条</div>

      <ul>
        {(data.items ?? []).map((it: any) => (
          <li key={it.link} style={{ marginBottom: 10 }}>
            <a href={it.link} target="_blank" rel="noreferrer">
              {it.title}
            </a>
            <div style={{ opacity: 0.7, fontSize: 12 }}>{it.pubDate}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}