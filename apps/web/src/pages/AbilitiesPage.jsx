import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "../utils/api.js";
import { GENERATION_OPTIONS } from "../utils/constants.js";
import Loading from "../components/Loading.jsx";

export default function AbilitiesPage() {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [generation, setGeneration] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [abilities, setAbilities] = useState([]);
  const [detailCache, setDetailCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState(80);

  const composingRef = useRef(false);
  const debounceRef = useRef(null);

  // Debounced query update — respects IME composition
  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setInputValue(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!composingRef.current) {
      debounceRef.current = setTimeout(() => {
        setQuery(value);
      }, 300);
    }
  }, []);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleCompositionEnd = useCallback((e) => {
    composingRef.current = false;
    const value = e.target.value;
    setInputValue(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(value);
    }, 300);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchAbilities = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (generation) params.set("generation", generation);
    const result = await api(`/abilities?${params.toString()}`);
    setAbilities(result.data);
    setLoading(false);
  }, [query, generation]);

  useEffect(() => { fetchAbilities(); }, [fetchAbilities]);
  useEffect(() => { setVisibleLimit(80); }, [query, generation]);

  const visibleAbilities = useMemo(() => abilities.slice(0, visibleLimit), [abilities, visibleLimit]);

  const toggleExpand = useCallback((slug) => {
    if (expanded === slug) {
      setExpanded(null);
      return;
    }
    setExpanded(slug);
    if (!detailCache[slug]) {
      api(`/abilities/${encodeURIComponent(slug)}`).then((r) => {
        setDetailCache((prev) => ({ ...prev, [slug]: r.data }));
      });
    }
  }, [expanded, detailCache]);

  if (loading && abilities.length === 0) return <Loading />;

  return (
    <section className="ab-page">
      <div className="panel ab-panel">
        <div className="ab-header">
          <h2 className="panel-title">特性资料</h2>
          <p className="panel-subtitle">
            共收录 {abilities.length} 个特性，按编号排序。点击展开查看详细效果与世代变更。
          </p>
        </div>

        <div className="ab-toolbar">
          <input
            className="ab-search"
            placeholder="搜索特性名（中文 / 英文 / 日文）"
            value={inputValue}
            onChange={handleInputChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />
          <select
            className="ab-gen-select"
            value={generation}
            onChange={(e) => setGeneration(e.target.value)}
          >
            <option value="">全部世代</option>
            {GENERATION_OPTIONS.map((g) => (
              <option key={g} value={g}>第 {g} 世代</option>
            ))}
          </select>
        </div>

        {visibleAbilities.length === 0 && (
          <div className="ab-empty">没有找到匹配的特性。</div>
        )}

        <div className="ab-list">
          {visibleAbilities.map((ability) => {
            const key = ability.nameZh;
            const isExpanded = expanded === key;
            const detail = detailCache[key];
            return (
              <div key={ability.id} className={`ab-row${isExpanded ? " ab-row-expanded" : ""}`}>
                <button className="ab-row-header" onClick={() => toggleExpand(key)}>
                  <span className="ab-row-number">
                    {ability.number ? String(ability.number).padStart(3, "0") : "—"}
                  </span>
                  <span className="ab-row-name">{ability.nameZh}</span>
                  {ability.nameEn && <span className="ab-row-name-en">{ability.nameEn}</span>}
                  <span className="ab-row-desc">
                    {ability.description || "暂无说明"}
                  </span>
                  <span className={`ab-row-arrow${isExpanded ? " ab-row-arrow-open" : ""}`}>
                    ▾
                  </span>
                </button>

                {isExpanded && (
                  <div className="ab-row-detail">
                    {!detail ? (
                      <div className="ab-detail-loading">
                        <div className="pulse-dot" />
                        <span>加载中…</span>
                      </div>
                    ) : (
                      <>
                        {/* 名称标签 */}
                        <div className="ab-detail-names">
                          {detail.nameJa && <span className="ab-name-tag ab-name-ja">{detail.nameJa}</span>}
                          {detail.nameEn && <span className="ab-name-tag ab-name-en">{detail.nameEn}</span>}
                          {detail.introducedGeneration && (
                            <span className="ab-name-tag ab-name-gen">第 {detail.introducedGeneration} 世代引入</span>
                          )}
                        </div>

                        {/* 详细效果 */}
                        <div className="ab-detail-effect">
                          <div className="ab-detail-effect-title">特性效果</div>
                          <div className="ab-detail-effect-text">
                            {detail.effectDetail || detail.description || "暂无详细说明"}
                          </div>
                        </div>

                        {/* 世代变更 */}
                        {detail.generations?.length > 0 && (
                          <div className="ab-gen-section">
                            <div className="ab-gen-title">世代变更</div>
                            <div className="ab-gen-timeline">
                              {detail.generations.map((record, i) => (
                                <div key={i} className="ab-gen-item">
                                  <div className="ab-gen-badge">Gen {record.generation}</div>
                                  <div className="ab-gen-text">{record.description}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 来源 */}
                        {detail.source?.url && (
                          <div className="ab-source">
                            <a href={detail.source.url} target="_blank" rel="noopener noreferrer">
                              来源：{detail.source.title || "52Poké Wiki"}
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {visibleAbilities.length < abilities.length && (
          <div className="ab-load-more">
            <button className="secondary" onClick={() => setVisibleLimit((v) => v + 80)}>
              再显示 {Math.min(80, abilities.length - visibleAbilities.length)} 个特性
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
