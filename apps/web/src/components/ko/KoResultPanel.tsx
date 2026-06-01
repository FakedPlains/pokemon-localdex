/**
 * KO 分析结果展示面板（表格模式）
 * 参考宝可梦伤害计算器常见表格布局：
 * 斩杀线列：打击目标 | HP | 招式 | 伤害范围 | 伤害百分比 | KO判定 | 说明
 * 防守线列：攻击来源 | 招式 | 伤害范围 | 伤害百分比 | KO判定 | 说明
 */
import { KO_GROUPS, DEFENSE_GROUPS, describeKO } from "../../utils/koCalculation";
import type {
  AttackResultGroups,
  DefenseResultGroups,
  AttackResultItem,
  DefenseResultItem,
  PokemonMember,
} from "../../utils/koCalculation";
import TypeChip from "../TypeChip.jsx";

interface KoResultPanelProps {
  mode: "attack" | "defense";
  attackResults: AttackResultGroups | null;
  defenseResults: DefenseResultGroups | null;
  moveName?: string;
}

// 分组配置
interface GroupMeta {
  key: string;
  label: string;
  colorClass: string;
}

const ATTACK_GROUPS: GroupMeta[] = [
  { key: KO_GROUPS.GUARANTEED_KO, label: "确定 OHKO", colorClass: "ko-row--guaranteed" },
  { key: KO_GROUPS.PROBABLE_KO, label: "概率 OHKO", colorClass: "ko-row--probable" },
  { key: KO_GROUPS.MULTI_HKO, label: "多次击杀", colorClass: "ko-row--multi" },
  { key: KO_GROUPS.IMMUNE, label: "免疫/无效", colorClass: "ko-row--immune" },
];

const DEFENSE_GROUPS_META: GroupMeta[] = [
  { key: DEFENSE_GROUPS.FATAL, label: "致命威胁", colorClass: "ko-row--fatal" },
  { key: DEFENSE_GROUPS.HIGH_RISK, label: "高风险", colorClass: "ko-row--risk" },
  { key: DEFENSE_GROUPS.SAFE, label: "可承受", colorClass: "ko-row--safe" },
  { key: DEFENSE_GROUPS.IMMUNE, label: "免疫", colorClass: "ko-row--immune" },
];

export default function KoResultPanel({ mode, attackResults, defenseResults, moveName }: KoResultPanelProps) {
  if (mode === "attack" && !attackResults) return null;
  if (mode === "defense" && !defenseResults) return null;

  const groupsMeta = mode === "attack" ? ATTACK_GROUPS : DEFENSE_GROUPS_META;
  const results: Record<string, any[]> = (mode === "attack" ? attackResults : defenseResults) as Record<string, any[]>;

  // 汇总所有结果（按分组顺序）
  const allRows: Array<{ item: AttackResultItem | DefenseResultItem; groupMeta: GroupMeta }> = [];
  for (const gm of groupsMeta) {
    const items = results[gm.key] || [];
    for (const item of items) {
      allRows.push({ item, groupMeta: gm });
    }
  }

  if (allRows.length === 0) return null;

  // 统计摘要
  const totalCount = allRows.length;
  const guaranteedKoCount = mode === "attack"
    ? (results[KO_GROUPS.GUARANTEED_KO]?.length || 0)
    : (results[DEFENSE_GROUPS.FATAL]?.length || 0);

  return (
    <div className="ko-table-container">
      {/* 表格标题摘要 */}
      <div className="ko-table-summary">
        <span className="ko-table-summary-title">
          {mode === "attack" ? "进攻端" : "防守端"}
        </span>
        {moveName && <span className="ko-table-summary-move">{moveName}</span>}
        <span className="ko-table-summary-stat">
          共 {totalCount} 项
          {mode === "attack" && guaranteedKoCount > 0 && ` · 确杀 ${guaranteedKoCount} 只`}
          {mode === "defense" && guaranteedKoCount > 0 && ` · 致命威胁 ${guaranteedKoCount} 项`}
        </span>
      </div>

      {/* 表格 */}
      <div className="ko-table-wrapper">
        <table className="ko-table">
          <thead>
            <tr>
              <th className="ko-th ko-th-target">{mode === "attack" ? "打击目标" : "攻击来源"}</th>
              <th className="ko-th ko-th-hp">HP</th>
              {mode === "defense" && <th className="ko-th ko-th-move">招式</th>}
              <th className="ko-th ko-th-damage">伤害范围</th>
              <th className="ko-th ko-th-percent">伤害百分比</th>
              <th className="ko-th ko-th-ko">KO判定</th>
              <th className="ko-th ko-th-desc">说明</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map(({ item, groupMeta }, idx) => {
              const pk = mode === "attack" ? (item as AttackResultItem).target : (item as DefenseResultItem).source;
              const rowKey = `${pk?.pokemonId || idx}-${(item as any).moveName || idx}`;
              return <KoTableRow key={rowKey} item={item} mode={mode} colorClass={groupMeta.colorClass} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 表格行组件 ──

interface KoTableRowProps {
  item: AttackResultItem | DefenseResultItem;
  mode: "attack" | "defense";
  colorClass: string;
}

function KoTableRow({ item, mode, colorClass }: KoTableRowProps) {
  const pokemon: PokemonMember | undefined =
    mode === "attack"
      ? (item as AttackResultItem).target
      : (item as DefenseResultItem).source;

  const name = pokemon?.nameZh || pokemon?.pokemonId || "未知";
  const img = pokemon?.imageUrl || "";
  const hp = item.damageData?.defenderHp || "—";

  // 免疫情况
  if (item.immuneInfo?.immune) {
    return (
      <tr className={`ko-tr ${colorClass}`}>
        <td className="ko-td ko-td-target">
          <div className="ko-td-target-inner">
            {img && <img className="ko-td-img" src={img} alt="" referrerPolicy="no-referrer" />}
            <span className="ko-td-name">{name}</span>
            {pokemon?.primaryType && <TypeChip type={pokemon.primaryType} size="xs" />}
            {pokemon?.secondaryType && <TypeChip type={pokemon.secondaryType} size="xs" />}
          </div>
        </td>
        <td className="ko-td ko-td-hp">—</td>
        {mode === "defense" && <td className="ko-td ko-td-move">{(item as DefenseResultItem).moveName || "—"}</td>}
        <td className="ko-td ko-td-damage">—</td>
        <td className="ko-td ko-td-percent">0%</td>
        <td className="ko-td ko-td-ko"><span className="ko-badge ko-badge--immune">免疫</span></td>
        <td className="ko-td ko-td-desc">{item.immuneInfo.reason}</td>
      </tr>
    );
  }

  const damageData = item.damageData;
  const koResult = item.koResult;
  const koText = describeKO(koResult);

  // 伤害范围（具体数值）
  const minDmg = damageData?.min ?? 0;
  const maxDmg = damageData?.max ?? 0;
  const damageRange = minDmg === maxDmg ? `${minDmg}` : `${minDmg}-${maxDmg}`;

  // 伤害百分比
  const minPct = damageData?.minPercent || 0;
  const maxPct = damageData?.maxPercent || 0;
  const pctText = minPct === maxPct
    ? `${minPct.toFixed(1)}%`
    : `${minPct.toFixed(1)}% - ${maxPct.toFixed(1)}%`;

  // KO badge
  const koBadgeClass = getKoBadgeClass(koResult);

  // 说明文字
  const desc = buildDescription(item, mode);

  // 防守线招式名
  const moveNameText = mode === "defense" ? ((item as DefenseResultItem).moveName || "—") : null;

  return (
    <tr className={`ko-tr ${colorClass}`}>
      <td className="ko-td ko-td-target">
        <div className="ko-td-target-inner">
          {img && <img className="ko-td-img" src={img} alt="" referrerPolicy="no-referrer" />}
          <span className="ko-td-name">{name}</span>
          {pokemon?.primaryType && <TypeChip type={pokemon.primaryType} size="xs" />}
          {pokemon?.secondaryType && <TypeChip type={pokemon.secondaryType} size="xs" />}
        </div>
      </td>
      <td className="ko-td ko-td-hp">{hp}</td>
      {mode === "defense" && <td className="ko-td ko-td-move">{moveNameText}</td>}
      <td className="ko-td ko-td-damage">{damageRange}</td>
      <td className="ko-td ko-td-percent">{pctText}</td>
      <td className="ko-td ko-td-ko"><span className={`ko-badge ${koBadgeClass}`}>{koText}</span></td>
      <td className="ko-td ko-td-desc">{desc}</td>
    </tr>
  );
}

// ── 辅助函数 ──

function getKoBadgeClass(koResult: { n: number; guaranteed: boolean; percent: number | null } | null): string {
  if (!koResult) return "ko-badge--immune";
  if (koResult.n === 1 && koResult.guaranteed) return "ko-badge--guaranteed";
  if (koResult.n === 1) return "ko-badge--probable";
  if (koResult.n === 2) return "ko-badge--2hko";
  return "ko-badge--multi";
}

function buildDescription(item: AttackResultItem | DefenseResultItem, mode: string): string {
  const parts: string[] = [];
  const pokemon = mode === "attack" ? (item as AttackResultItem).target : (item as DefenseResultItem).source;

  if (pokemon?.nature && pokemon.nature !== "认真") parts.push(pokemon.nature);
  if (pokemon?.itemName) parts.push(pokemon.itemName);
  if (pokemon?.abilityName) parts.push(pokemon.abilityName);

  // 判定说明
  const koResult = item.koResult;
  if (koResult) {
    if (koResult.n === 1 && koResult.guaranteed) {
      parts.push("确定一击必杀");
    } else if (koResult.n === 1 && koResult.percent !== null) {
      parts.push(`${koResult.percent.toFixed(0)}%概率一击`);
    } else if (koResult.n >= 4) {
      parts.push("难以击杀");
    }
  }

  return parts.join(" · ") || "—";
}
