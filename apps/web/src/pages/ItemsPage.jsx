import { useState, useEffect, useMemo } from "react";
import { api } from "../utils/api.js";
import Loading from "../components/Loading.jsx";

export default function ItemsPage({ query: externalQuery = "" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [visibleLimit, setVisibleLimit] = useState(120);

  useEffect(() => {
    api("/items").then((r) => {
      setItems(r.data);
      setLoading(false);
    });
  }, []);

  const itemCategories = useMemo(() =>
    [...new Set(items.map((item) => item.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = externalQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !q ||
        [item.id, item.slug, item.nameZh, item.nameJa, item.nameEn, item.effectSummary]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesCategory = !category || item.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [items, externalQuery, category]);

  const visibleItems = useMemo(() => filteredItems.slice(0, visibleLimit), [filteredItems, visibleLimit]);

  // Auto-select
  useEffect(() => {
    const isVisible = filteredItems.some((item) => item.id === selected || item.slug === selected);
    if ((!selected || !isVisible) && filteredItems[0]) {
      setSelected(filteredItems[0].slug || filteredItems[0].id);
    } else if (!filteredItems[0]) {
      setSelected(null);
    }
  }, [filteredItems]);

  // Fetch detail
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    api(`/items/${encodeURIComponent(selected)}`).then((r) => {
      if (!cancelled) setDetail(r.data);
    });
    return () => { cancelled = true; };
  }, [selected]);

  if (loading) return <Loading />;

  return (
    <section className="view-grid items-layout">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">道具资料</h2>
            <p className="panel-subtitle">当前展示本地已导入的真实道具详情，支持按名称、说明和分类筛选。</p>
          </div>
          <span className="chip">{filteredItems.length} / {items.length} 个道具</span>
        </div>
        <div className="toolbar">
          <div className="toolbar-row">
            <select value={category} onChange={(e) => { setCategory(e.target.value); setVisibleLimit(120); setSelected(null); }}>
              <option value="">全部分类</option>
              {itemCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="item-list">
          {visibleItems.length === 0 && <div className="muted" style={{ padding: "0 24px 24px" }}>没有命中道具。</div>}
          {visibleItems.map((item) => (
            <button
              key={item.id}
              className="list-card secondary"
              onClick={() => setSelected(item.slug || item.id)}
            >
              <div className="card-topline">
                <strong>{item.nameZh}</strong>
                <span className="chip">{item.category || "未分类"}</span>
              </div>
              <div className="muted">{item.nameEn || ""}</div>
              <div>{item.effectSummary || "暂无说明"}</div>
            </button>
          ))}
        </div>
        {visibleItems.length < filteredItems.length && (
          <div className="toolbar-row" style={{ padding: "0 24px 24px" }}>
            <button className="secondary" onClick={() => setVisibleLimit((v) => v + 120)}>
              再显示 {Math.min(120, filteredItems.length - visibleItems.length)} 个道具
            </button>
          </div>
        )}
      </div>
      <div className="panel detail-panel">
        {detail ? (
          <>
            <div className="detail-title-row">
              <div>
                <div className="muted">{detail.category || "未分类"}</div>
                <h2>{detail.nameZh}</h2>
                <div className="muted">{detail.nameEn || ""}</div>
              </div>
            </div>
            <div className="media-layout">
              {detail.image?.url
                ? <div className="media-viewer"><img src={detail.image.url} alt={detail.image.alt || detail.nameZh} className="entity-image item-image" referrerPolicy="no-referrer" /></div>
                : <div className="media-placeholder">暂无图片</div>}
              <div className="subpanel">
                <strong>道具图片</strong>
                <p className="panel-subtitle">当前先展示导入数据中的主图，后续可补充不同世代外观或图标资源。</p>
              </div>
            </div>
            <div className="meta-grid">
              <div className="meta-card"><strong>日文名</strong><div>{detail.nameJa || "未记录"}</div></div>
              <div className="meta-card"><strong>来源</strong><div>{detail.source?.title || "本地标准化"}</div></div>
            </div>
            <div className="subpanel" style={{ marginTop: 16 }}>
              <strong>效果说明</strong>
              <p className="panel-subtitle">{detail.effectSummary || "暂无说明"}</p>
            </div>
          </>
        ) : (
          <div className="detail-empty">请选择一个道具查看详情。</div>
        )}
      </div>
    </section>
  );
}
