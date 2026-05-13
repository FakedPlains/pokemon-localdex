import { useState, useEffect, useCallback } from "react";
import { unifiedApi } from "../utils/api.js";
import { TYPE_BG_COLORS_CARD } from "@pokemon-localdex/store-types/constants";
import { typeIconSrc } from "../utils/iconPaths.js";

const POKEMON_PAGE_SIZE = 20;

/**
 * 宝可梦网格组件（后端分页）
 * 通用于招式页和特性页，通过 apiPath 参数区分数据来源
 *
 * @param {string} apiPath - API 路径，如 "/moves/123/pokemon" 或 "/abilities/456/pokemon"
 * @param {string} [emptyText="暂无数据"] - 空数据提示文字
 * @param {Function} [labelFn] - 可选的标签渲染函数，接收 pokemon 对象
 */
export default function PokemonGrid({ apiPath, emptyText = "暂无数据", labelFn }) {
  const [pokemon, setPokemon] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback((newOffset) => {
    setLoading(true);
    unifiedApi(`${apiPath}?limit=${POKEMON_PAGE_SIZE}&offset=${newOffset}`)
      .then((r) => {
        setPokemon(r.data || []);
        setTotal(r.total ?? 0);
        setOffset(newOffset);
      })
      .finally(() => setLoading(false));
  }, [apiPath]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  if (loading && pokemon.length === 0) {
    return (
      <div className="shared-detail-loading">
        <div className="pulse-dot" />
        <span>加载中…</span>
      </div>
    );
  }

  if (!loading && total === 0) {
    return <div className="shared-pokemon-empty">{emptyText}</div>;
  }

  const totalPages = Math.ceil(total / POKEMON_PAGE_SIZE);
  const page = Math.floor(offset / POKEMON_PAGE_SIZE);

  return (
    <>
      {loading && (
        <div className="shared-detail-loading" style={{ padding: "8px 0" }}>
          <div className="pulse-dot" />
          <span>加载中…</span>
        </div>
      )}
      <div className="shared-pokemon-grid" style={{ opacity: loading ? 0.5 : 1 }}>
        {pokemon.map((p) => (
          <a
            key={p.id}
            className="shared-pokemon-card"
            href={`#/pokemon?id=${p.id}`}
            style={{ background: TYPE_BG_COLORS_CARD[p.primaryType] || "rgba(200,200,200,0.12)" }}
          >
            {p.image && (
              <img
                className="shared-pokemon-card-img"
                src={p.image}
                alt={p.nameZh}
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={(e) => { e.target.style.display = "none"; e.target.insertAdjacentHTML("afterend", '<span class="shared-pokemon-card-img-fallback">?</span>'); }}
              />
            )}
            <span className="shared-pokemon-card-dex">#{String(p.dexNumber).padStart(4, "0")}</span>
            <span className="shared-pokemon-card-name">{p.nameZh}</span>
            <span className="shared-pokemon-card-types">
              {p.primaryType && (
                <span className={`shared-pokemon-card-type-icon type-${p.primaryType}`} title={p.primaryType}>
                  <img src={typeIconSrc(p.primaryType)} alt={p.primaryType} />
                </span>
              )}
              {p.secondaryType && (
                <span className={`shared-pokemon-card-type-icon type-${p.secondaryType}`} title={p.secondaryType}>
                  <img src={typeIconSrc(p.secondaryType)} alt={p.secondaryType} />
                </span>
              )}
            </span>
            {labelFn && <span className="shared-pokemon-card-label">{labelFn(p)}</span>}
          </a>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="shared-pokemon-pager">
          <button
            className="shared-pokemon-pager-btn"
            disabled={page === 0 || loading}
            onClick={() => fetchPage((page - 1) * POKEMON_PAGE_SIZE)}
          >
            ‹ 上一页
          </button>
          <span className="shared-pokemon-pager-info">
            {offset + 1}–{Math.min(offset + POKEMON_PAGE_SIZE, total)} / {total}
          </span>
          <button
            className="shared-pokemon-pager-btn"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => fetchPage((page + 1) * POKEMON_PAGE_SIZE)}
          >
            下一页 ›
          </button>
        </div>
      )}
    </>
  );
}
