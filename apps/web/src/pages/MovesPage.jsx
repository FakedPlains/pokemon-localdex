import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import { ALL_TYPE_OPTIONS, GENERATION_OPTIONS } from "../utils/constants.js";
import TypeChip from "../components/TypeChip.jsx";
import Loading from "../components/Loading.jsx";

export default function MovesPage({ initialSelected }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [generation, setGeneration] = useState("");
  const [selected, setSelected] = useState(initialSelected || null);
  const [moves, setMoves] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMoves = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    if (generation) params.set("generation", generation);
    const result = await api(`/moves?${params.toString()}`);
    setMoves(result.data);
    setLoading(false);
  }, [query, type, generation]);

  useEffect(() => { fetchMoves(); }, [fetchMoves]);

  // Auto-select
  useEffect(() => {
    const isVisible = moves.some((m) => m.id === selected || m.slug === selected);
    if ((!selected || !isVisible) && moves[0]) {
      setSelected(moves[0].slug || moves[0].id);
    } else if (!moves[0]) {
      setSelected(null);
    }
  }, [moves]);

  // Fetch detail
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    api(`/moves/${encodeURIComponent(selected)}`).then((r) => {
      if (!cancelled) setDetail(r.data);
    });
    return () => { cancelled = true; };
  }, [selected]);

  if (loading && moves.length === 0) return <Loading />;

  return (
    <section className="view-grid items-layout">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">招式资料</h2>
            <p className="panel-subtitle">支持按关键字、属性和世代检索，并查看不同世代的威力、PP 和效果差异。</p>
          </div>
          <span className="chip">{moves.length} 个招式</span>
        </div>
        <div className="toolbar">
          <div className="toolbar-row">
            <input placeholder="搜索招式名" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="toolbar-row">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">全部属性</option>
              {ALL_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={generation} onChange={(e) => setGeneration(e.target.value)}>
              <option value="">全部世代</option>
              {GENERATION_OPTIONS.map((g) => <option key={g} value={g}>第 {g} 世代</option>)}
            </select>
          </div>
        </div>
        <div className="item-list">
          {moves.map((move) => (
            <button
              key={move.id}
              className="list-card secondary media-list-card"
              onClick={() => setSelected(move.slug || move.id)}
            >
              <div className="list-thumb move-thumb">
                {move.image?.url
                  ? <img src={move.image.url} alt={move.image.alt || move.nameZh} referrerPolicy="no-referrer" loading="lazy" />
                  : <span>{move.type || "招式"}</span>}
              </div>
              <div className="list-card-body">
                <div className="card-topline">
                  <strong>{move.nameZh}</strong>
                  <span className="chip">{move.type || "未知"} · {move.category || "未分类"}</span>
                </div>
                <div className="muted">{move.nameEn || ""}</div>
                <div>{move.effectSummary || "暂无说明"}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="panel detail-panel">
        {detail ? (
          <>
            <div className="detail-title-row">
              <div>
                <div className="muted">{detail.type || "未知"} · {detail.category || "未分类"}</div>
                <h2>{detail.nameZh}</h2>
                <div className="muted">{detail.nameEn || ""}</div>
              </div>
            </div>
            <div className="media-layout">
              {detail.image?.url
                ? <div className="media-viewer"><img src={detail.image.url} alt={detail.image.alt || detail.nameZh} className="entity-image item-image" referrerPolicy="no-referrer" /></div>
                : <div className="media-placeholder">暂无图片</div>}
              <div className="subpanel">
                <strong>当前世代前台摘要</strong>
                <div className="info-stack">
                  <div>威力：{detail.power ?? "-"}</div>
                  <div>命中：{detail.accuracy || "-"}</div>
                  <div>PP：{detail.pp ?? "-"}</div>
                  <div>{detail.effectSummary || "暂无说明"}</div>
                </div>
              </div>
            </div>
            <div className="subpanel" style={{ marginTop: 16 }}>
              <strong>按世代效果</strong>
              <div className="generation-card-grid">
                {(detail.generations || []).map((record, i) => (
                  <div key={i} className="meta-card generation-card">
                    <strong>第 {record.generation} 世代</strong>
                    <div className="info-stack">
                      <div>属性：{record.type || detail.type || "未记录"}</div>
                      <div>分类：{record.category || detail.category || "未记录"}</div>
                      <div>威力：{record.power ?? detail.power ?? "-"}</div>
                      <div>命中：{record.accuracy || detail.accuracy || "-"}</div>
                      <div>PP：{record.pp ?? detail.pp ?? "-"}</div>
                      <div>{record.effectSummary}</div>
                      {record.notes && <div className="muted">{record.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="detail-empty">请选择一个招式查看详情。</div>
        )}
      </div>
    </section>
  );
}
