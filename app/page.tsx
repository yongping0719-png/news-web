import { headers } from "next/headers";
import Link from "next/link";

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

  const h = await headers();
const host = h.get("host");
const protocol = process.env.NODE_ENV === "development" ? "http" : "https";

const res = await fetch(`${protocol}://${host}/api/news?src=${src}`, {
  cache: "no-store",
});
const data = await res.json();

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