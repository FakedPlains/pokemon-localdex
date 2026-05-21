import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "../utils/api";
import type { DataResponse } from "../utils/apiTypes";
import { useInfiniteApi } from "../hooks/useInfiniteApi";
import { parseExpandParam } from "../utils/helpers";
import type { BaseGenerationRecord } from "@pokemon-localdex/store-types";
import Loading from "../components/Loading";
import GenerationTimeline from "../components/GenerationTimeline";
import WikiLink from "../components/WikiLink";

export interface ItemsPageProps {
  query?: string;
}

type ItemListItem = {
  id: string;
  slug?: string;
  nameZh: string;
  nameEn?: string;
  imageUrl?: string;
  category?: string;
  effectSummary?: string;
};

type ItemDetail = {
  id: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  imageUrl?: string;
  category?: string;
  effectSummary?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  source?: { url?: string; title?: string };
  generations?: BaseGenerationRecord[];
};

export default function ItemsPage({ query = "" }: ItemsPageProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ItemDetail>>({});
  const pendingExpandRef = useRef<string | null>(parseExpandParam());

  // Reset expanded when filters change
  useEffect(() => { setExpanded(null); }, [query]);

  // 构建分页请求路径
  const itemsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/items?${qs}` : "/items";
  }, [query]);

  const { data: items, total, loading, loadingMore, hasMore, sentinelRef, loadMore } = useInfiniteApi<ItemListItem>(itemsPath, { pageSize: 50 });

  // Auto-expand item from URL hash param (e.g. #/items?expand=some-slug)
  useEffect(() => {
    const expandId = pendingExpandRef.current;
    if (!expandId || loading) return;
    if (items.length === 0 && !hasMore) {
      pendingExpandRef.current = null;
      return;
    }
    if (items.length === 0) return;

    const target = items.find((it) => it.slug === expandId || it.id === expandId);
    if (target) {
      pendingExpandRef.current = null;
      const key = target.id;
      setExpanded(key);
      if (!detailCache[key]) {
        api<DataResponse<ItemDetail>>(`/items/${key}`).then((r) => {
          setDetailCache((prev) => ({ ...prev, [key]: r.data }));
        });
      }
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-item-id="${key}"]`);
        if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      });
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        window.history.replaceState(null, "", hash.slice(0, qIdx));
      }
    } else if (hasMore && !loadingMore) {
      loadMore();
    } else if (!hasMore) {
      pendingExpandRef.current = null;
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        window.history.replaceState(null, "", hash.slice(0, qIdx));
      }
    }
  }, [items, loading, hasMore, loadingMore, loadMore]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = useCallback((key: string) => {
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (!detailCache[key]) {
      api<DataResponse<ItemDetail>>(`/items/${key}`).then((r) => {
        setDetailCache((prev) => ({ ...prev, [key]: r.data }));
      });
    }
  }, [expanded, detailCache]);

  if (loading && items.length === 0) return <Loading />;

  return (
    <section className="it-page">
      <div className="panel it-panel">
        <div className="it-header">
          <h2 className="panel-title">道具资料</h2>
          <span className="panel-subtitle">
            共收录 {total > 0 ? total : items.length} 个道具，按编号排序。点击展开查看详细效果与世代变更。
          </span>
        </div>

        {items.length === 0 && !loading && (
          <div className="it-empty">没有找到匹配的道具。</div>
        )}

        <div className="it-list">
          {items.map((item) => {
            const key = item.id;
            const isExpanded = expanded === key;
            const detail = detailCache[key];
            return (
              <div key={item.id} data-item-id={key} className={`it-row${isExpanded ? " it-row-expanded" : ""}`}>
                <button className="it-row-header" onClick={() => toggleExpand(key)}>
                  <span className="it-row-thumb">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" referrerPolicy="no-referrer" />
                      : <span className="it-row-thumb-placeholder">?</span>}
                  </span>
                  <span className="it-row-name">{item.nameZh}</span>
                  {item.nameEn && <span className="it-row-name-en">{item.nameEn}</span>}
                  <span className="it-row-cat">
                    <span className="chip">{item.category || "未分类"}</span>
                  </span>
                  <span className="it-row-desc">
                    {item.effectSummary || "暂无说明"}
                  </span>
                  <span className={`it-row-arrow${isExpanded ? " it-row-arrow-open" : ""}`}>
                    ▾
                  </span>
                </button>

                {isExpanded && (
                  <div className="it-row-detail">
                    {!detail ? (
                      <div className="shared-detail-loading">
                        <div className="pulse-dot" />
                        <span>加载中…</span>
                      </div>
                    ) : (
                      <>
                        {/* 图片 */}
                        {detail.imageUrl && (
                          <div className="it-detail-image">
                            <img src={detail.imageUrl} alt={detail.nameZh} referrerPolicy="no-referrer" />
                          </div>
                        )}

                        {/* 名称标签 */}
                        <div className="it-detail-names">
                          {detail.nameJa && <span className="shared-name-tag shared-name-ja">{detail.nameJa}</span>}
                          {detail.nameEn && <span className="shared-name-tag shared-name-en">{detail.nameEn}</span>}
                          {detail.introducedGeneration && (
                            <span className="shared-name-tag shared-name-gen">第 {detail.introducedGeneration} 世代引入</span>
                          )}
                          {detail.category && (
                            <span className="shared-name-tag it-name-cat">{detail.category}</span>
                          )}
                          <WikiLink url={detail.source?.url ?? ""} title={detail.source?.title ?? "Wiki"} />
                        </div>

                        {/* 效果说明 */}
                        <div className="shared-detail-effect">
                          <div className="shared-detail-effect-title">效果说明</div>
                          <div className="shared-detail-effect-text">
                            {detail.effectSummary || "暂无说明"}
                          </div>
                        </div>

                        {/* 效果详情 */}
                        {detail.effectDetail && (
                          <div className="shared-detail-effect">
                            <div className="shared-detail-effect-title">效果详情</div>
                            <div className="shared-detail-effect-text">
                              {detail.effectDetail}
                            </div>
                          </div>
                        )}

                        {/* 世代变更 */}
                        <GenerationTimeline generations={detail.generations} />

                        {/* 来源 */}
                        {detail.source?.url && (
                          <div className="shared-source">
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

        {hasMore && (
          <div className="it-load-more" ref={sentinelRef}>
            <div className="pulse-dot" />
          </div>
        )}
      </div>
    </section>
  );
}
