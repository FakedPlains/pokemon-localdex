import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { resolvePokemonDisplayVariant } from "../../utils/helpers.js";
import { unifiedApi } from "../../utils/api.js";
import TypeChip from "../TypeChip.jsx";
import WikiLink from "../WikiLink.jsx";
import DrawerImage from "./DrawerImage.jsx";
import MetaPill from "./MetaPill.jsx";
import MovesTab from "./MovesTab.jsx";
import StatsTab from "./StatsTab.jsx";
import EvolutionTab from "./EvolutionTab.jsx";

/* ─── Drawer Content with Tabs ─── */
export default function DrawerContent({ detail, detailGeneration, onDetailGenerationChange }) {
  const [tab, setTab] = useState("stats");
  const [imageMode, setImageMode] = useState("official");
  const [detailForm, setDetailForm] = useState(null);
  const [learnsetMeta, setLearnsetMeta] = useState(null);
  const [learnsetFormOverride, setLearnsetFormOverride] = useState(null);

  // 进化链按需懒加载
  const [evolutionChain, setEvolutionChain] = useState(null);
  const [evolutionLoading, setEvolutionLoading] = useState(false);

  const pokemonId = detail.id;

  // Reset tab & form when detail changes
  useEffect(() => {
    setTab("stats");
    setImageMode("official");
    setDetailForm(null);
    setLearnsetFormOverride(null);
    setLearnsetMeta(null);
    setEvolutionChain(null);
    setEvolutionLoading(false);
  }, [detail]);

  // 加载 learnset meta（可用世代和形态列表）— 仅在切换到招式表 tab 时才加载
  useEffect(() => {
    if (tab !== "moves" || learnsetMeta) return;
    let cancelled = false;
    unifiedApi(`/pokemon/${pokemonId}/learnset/meta`).then((r) => {
      if (!cancelled) setLearnsetMeta(r.data);
    });
    return () => { cancelled = true; };
  }, [pokemonId, tab, learnsetMeta]);

  // 懒加载进化链 — 仅在切换到进化链 tab 时才加载
  useEffect(() => {
    if (tab !== "evolution" || evolutionChain) return;
    let cancelled = false;
    setEvolutionLoading(true);
    unifiedApi(`/pokemon/${pokemonId}/evolution`).then((r) => {
      if (!cancelled) {
        setEvolutionChain(r.data || []);
        setEvolutionLoading(false);
      }
    }).catch(() => {
      if (!cancelled) { setEvolutionChain([]); setEvolutionLoading(false); }
    });
    return () => { cancelled = true; };
  }, [pokemonId, tab, evolutionChain]);

  // learnset meta 中的 formId 列表（数字）
  const learnsetFormIds = useMemo(
    () => (learnsetMeta?.forms || []).map(f => f.formId),
    [learnsetMeta]
  );

  const display = useMemo(
    () => resolvePokemonDisplayVariant(detail, detailGeneration, detailForm, ""),
    [detail, detailGeneration, detailForm]
  );

  // 构建 detail form → learnset formId 的映射表（通过 formId 匹配到 learnset meta 中的 formId）
  const formToLearnsetMap = useMemo(() => {
    const map = new Map();
    const metaForms = learnsetMeta?.forms || [];
    if (metaForms.length === 0 || display.formOptions.length === 0) return map;
    const usedIds = new Set();
    // 第一轮：通过 formId 精确匹配
    for (const form of display.formOptions) {
      const matched = metaForms.find(
        (mf) => !usedIds.has(mf.formId) && mf.formId === form.id
      );
      if (matched) {
        map.set(form.id, matched.formId);
        usedIds.add(matched.formId);
      }
    }
    // 第二轮：未匹配的 form 通过 formType/nameZh 降级匹配
    for (const form of display.formOptions) {
      if (map.has(form.id)) continue;
      const matched = metaForms.find(
        (mf) => !usedIds.has(mf.formId) && (mf.formType === form.formType || mf.nameZh === form.nameZh)
      );
      if (matched) {
        map.set(form.id, matched.formId);
        usedIds.add(matched.formId);
      }
    }
    // 第三轮：未匹配的 form 按顺序分配剩余的 learnset formId
    const remaining = metaForms.filter((mf) => !usedIds.has(mf.formId));
    let ri = 0;
    for (const form of display.formOptions) {
      if (!map.has(form.id) && ri < remaining.length) {
        map.set(form.id, remaining[ri++].formId);
      }
    }
    return map;
  }, [display.formOptions, learnsetMeta]);

  const mapFormToLearnsetId = useCallback((form) => {
    if (!form) return null;
    return formToLearnsetMap.get(form.id) ?? null;
  }, [formToLearnsetMap]);

  // 当切换 detail 形态时，同时联动 learnset 的 formId
  const handleFormChange = useCallback((formId) => {
    setDetailForm(formId);
    const form = display.formOptions.find((f) => f.id === formId);
    setLearnsetFormOverride(mapFormToLearnsetId(form));
  }, [display.formOptions, mapFormToLearnsetId]);

  // 计算当前传给 MovesTab 的 learnset formId（数字）
  const activeLearnsetFormId = useMemo(() => {
    if (learnsetFormOverride != null && learnsetFormIds.includes(learnsetFormOverride)) return learnsetFormOverride;
    const mapped = mapFormToLearnsetId(display.form);
    if (mapped != null) return mapped;
    return learnsetFormIds[0] ?? null;
  }, [learnsetFormOverride, learnsetFormIds, display.form, mapFormToLearnsetId]);

  const tabs = [
    { key: "stats", label: "种族值" },
    { key: "moves", label: "招式表" },
    { key: "evolution", label: "进化链" },
  ];

  return (
    <div className="drawer-content">
      {/* Hero: image + basic info */}
      <div className="drawer-hero">
        <div className="drawer-img-box">
          <DrawerImage images={display.images} mode={imageMode} onModeChange={setImageMode} />
        </div>
        <div className="drawer-intro">
          <div className="drawer-title-row">
            <span className="drawer-dex">#{String(detail.dexNumber).padStart(4, "0")}</span>
            <h3 className="drawer-name">{detail.nameZh}</h3>
            <span className="drawer-en">{detail.nameEn || ""}</span>
            <WikiLink url={detail.source?.url} title={detail.source?.title || "Wiki"} className="drawer-wiki-link" />
          </div>
          <div className="drawer-types-row">
            <TypeChip type={display.primaryType} />
            <TypeChip type={display.secondaryType} />
          </div>
          <div className="drawer-meta-strip">
            <MetaPill label="分类" value={detail.category} />
            <MetaPill label="身高" value={detail.heightM ? `${detail.heightM}m` : null} />
            <MetaPill label="体重" value={detail.weightKg ? `${detail.weightKg}kg` : null} />
          </div>
          <div className="drawer-abilities">
            <span className="drawer-ability-label">特性</span>
            {(display.abilitiesDetailed || []).map((ab, i) => (
              <a
                key={i}
                className={`drawer-ability-chip drawer-ability-link${ab.isHidden ? " drawer-ability-hidden" : ""}`}
                href={ab.abilityId ? `#/abilities?expand=${ab.abilityId}` : "#/abilities"}
                title={ab.description || ab.nameZh}
              >
                <span className="drawer-ability-chip-text">
                  {ab.nameZh}{ab.isHidden ? " ✦" : ""}
                </span>
                {ab.description && (
                  <span className="ability-tooltip">{ab.description}</span>
                )}
              </a>
            ))}
          </div>
          {/* Form selector */}
          {display.formOptions.length > 1 && (
            <div className="drawer-form-selector">
              <span className="drawer-ability-label">形态</span>
              <div className="drawer-form-chips">
                {display.formOptions.map((form) => (
                  <button
                    key={form.id}
                    className={`drawer-form-chip ${form.id === display.form.id ? "drawer-form-chip-active" : ""}`}
                    onClick={() => handleFormChange(form.id)}
                  >
                    {form.nameZh}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="drawer-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`drawer-tab ${tab === t.key ? "drawer-tab-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="drawer-tab-body"
        >
          {tab === "stats" && (
            <StatsTab
              detail={detail}
              display={display}
              detailGeneration={detailGeneration}
              onDetailGenerationChange={onDetailGenerationChange}
            />
          )}
          {tab === "moves" && (
            <MovesTab
              detail={detail}
              display={display}
              detailGeneration={detailGeneration}
              onDetailGenerationChange={onDetailGenerationChange}
              learnsetMeta={learnsetMeta}
              externalFormId={activeLearnsetFormId}
            />
          )}
          {tab === "evolution" && (
            <EvolutionTab
              detail={detail}
              evolutionChain={evolutionChain}
              loading={evolutionLoading}
              // display.form.id 已经是数据库数字 formId
              currentFormId={display.form?.id ?? null}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
