import TypeChip from "../TypeChip";
import type { EvolutionStep, PokemonEntry } from "@pokemon-localdex/store-types";

/**
 * 格式化进化条件为简短的展示文本。
 * 优先显示等级/道具等关键信息，condition 作为补充。
 */
function formatCondition(evo: EvolutionStep): string {
  const parts: string[] = [];
  if (evo.level) parts.push(`Lv.${evo.level}`);
  if (evo.item) parts.push(evo.item);
  if (evo.condition) parts.push(evo.condition);
  if (parts.length === 0 && evo.method) parts.push(evo.method);
  return parts.join(" ");
}

/**
 * 判断进化链是否包含形态分支（地区形态、mega、gigantamax 等）。
 * 有形态分支时需要按树形展示，否则按 stage 分组展示。
 */
function hasFormBranches(chain: EvolutionStep[]): boolean {
  return chain.some((e) => e.stage > 0 && (e.fromFormId || e.toFormId));
}

/** 树节点 */
interface TreeNodeData {
  evo: EvolutionStep | null;
  children: TreeNodeData[];
}

/**
 * 将进化链构建为树结构。
 *
 * 返回一棵或多棵树的根节点数组，每个节点：
 *   { evo, children: [{ evo, children }] }
 *
 * 共享前缀只出现一次，分叉点的多个后继作为 children 并列。
 */
function buildTree(chain: EvolutionStep[]): TreeNodeData[] {
  const bases = chain.filter((e) => e.stage === 0);
  const nonBases = chain.filter((e) => e.stage > 0);
  const used = new Set<number>();

  function findChildren(pid: number, fid: number | undefined): number[] {
    const result: number[] = [];
    nonBases.forEach((step, idx) => {
      if (used.has(idx)) return;
      if (Number(step.fromPokemonId) !== Number(pid)) return;
      if ((step.fromFormId || null) !== (fid || null)) return;
      result.push(idx);
    });
    return result;
  }

  function expand(evo: EvolutionStep): TreeNodeData {
    const childIdxs = findChildren(evo.toPokemonId, evo.toFormId);
    for (const idx of childIdxs) used.add(idx);
    return {
      evo,
      children: childIdxs.map((idx) => expand(nonBases[idx]!)),
    };
  }

  const roots = bases.map((b) => expand(b));

  // 兜底：未被覆盖的步骤
  const uncovered = nonBases.filter((_, i) => !used.has(i));
  if (uncovered.length > 0) {
    roots.push({ evo: null, children: uncovered.map((e) => ({ evo: e, children: [] })) });
  }

  return roots;
}

/** 渲染单个宝可梦成员卡片 */
interface EvoMemberProps {
  evo: EvolutionStep;
  detail: PokemonEntry;
  currentFormId: number | null;
}

function EvoMember({ evo, detail, currentFormId }: EvoMemberProps) {
  const isCurrent =
    Number(evo.toPokemonId) === Number(detail.id) &&
    (evo.toFormId
      ? Number(evo.toFormId) === Number(currentFormId)
      : !currentFormId || currentFormId === (detail.forms || []).find((f) => f.isDefault)?.id
    );

  return (
    <a
      className={`evo-member${isCurrent ? " evo-member-current" : ""}`}
      href={!isCurrent && evo.toPokemonId ? `#/pokemon?id=${evo.toPokemonId}` : undefined}
    >
      {evo.toImage?.url && (
        <img
          className="evo-member-img"
          src={evo.toImage.url}
          alt={evo.toImage.alt || evo.toNameZh}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      )}
      <span className="evo-member-name">
        {evo.toFormName || evo.toNameZh}
      </span>
      {evo.toTypes && evo.toTypes.length > 0 && (
        <div className="evo-member-types">
          {evo.toTypes.map((t) => (
            <TypeChip key={t} type={t} />
          ))}
        </div>
      )}
    </a>
  );
}

/**
 * 按 stage 分组展示（用于无形态分支的普通进化链）。
 * 同一 stage 的多个成员纵向排列，箭头与成员一一对齐。
 */
interface StageGroupViewProps {
  chain: EvolutionStep[];
  detail: PokemonEntry;
  currentFormId: number | null;
}

function StageGroupView({ chain, detail, currentFormId }: StageGroupViewProps) {
  const stages = new Map<number, EvolutionStep[]>();
  for (const evo of chain) {
    const stage = evo.stage ?? 0;
    if (!stages.has(stage)) stages.set(stage, []);
    stages.get(stage)!.push(evo);
  }

  return (
    <div className="evo-chain">
      {[...stages.entries()]
        .sort(([a], [b]) => a - b)
        .map(([stage, evos], stageIdx) => (
          <div key={stage} className="evo-stage-group">
            {stageIdx > 0 && (
              <div className="evo-arrow-col">
                {evos.map((evo, i) => {
                  const cond = formatCondition(evo);
                  return (
                    <div key={`arrow-${evo.toPokemonId}-${i}`} className="evo-arrow-cell">
                      {cond && <span className="evo-arrow-cond">{cond}</span>}
                      <span className="evo-arrow-icon">→</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="evo-stage-members">
              {evos.map((evo, i) => (
                <EvoMember key={`${evo.toPokemonId}-${i}`} evo={evo} detail={detail} currentFormId={currentFormId} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

/**
 * 递归渲染树节点的子分支。
 * 共享前缀水平排列，分叉点后的多个子分支纵向堆叠。
 */
interface TreeNodeProps {
  node: TreeNodeData;
  detail: PokemonEntry;
  isRoot: boolean;
  currentFormId: number | null;
}

function TreeNode({ node, detail, isRoot, currentFormId }: TreeNodeProps) {
  // 沿着单链（只有一个 child）收集线性路径，直到遇到分叉或叶子
  const linear: TreeNodeData[] = [];
  let cur = node;
  while (cur.children.length === 1) {
    linear.push(cur.children[0]!);
    cur = cur.children[0]!;
  }

  // cur 现在是叶子（children.length === 0）或分叉点（children.length > 1）
  const forkChildren = cur.children;

  return (
    <div className="evo-tree-node">
      {/* 当前节点 + 线性后继 水平排列 */}
      <div className="evo-tree-linear">
        {node.evo && (
          <div className="evo-branch-step">
            {!isRoot && (
              <div className="evo-arrow-cell">
                {formatCondition(node.evo) && (
                  <span className="evo-arrow-cond">{formatCondition(node.evo)}</span>
                )}
                <span className="evo-arrow-icon">→</span>
              </div>
            )}
            <EvoMember evo={node.evo} detail={detail} currentFormId={currentFormId} />
          </div>
        )}
        {linear.map((child, i) => {
          const cond = child.evo ? formatCondition(child.evo) : "";
          return (
            <div key={`${child.evo?.toPokemonId}-${child.evo?.toFormId || "d"}-${i}`} className="evo-branch-step">
              <div className="evo-arrow-cell">
                {cond && <span className="evo-arrow-cond">{cond}</span>}
                <span className="evo-arrow-icon">→</span>
              </div>
              {child.evo && <EvoMember evo={child.evo} detail={detail} currentFormId={currentFormId} />}
            </div>
          );
        })}

        {/* 分叉子分支纵向堆叠 */}
        {forkChildren.length > 1 && (
          <div className="evo-tree-fork">
            {forkChildren.map((child, i) => (
              <TreeNode
                key={`${child.evo?.toPokemonId}-${child.evo?.toFormId || "d"}-${i}`}
                node={child}
                detail={detail}
                isRoot={false}
                currentFormId={currentFormId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 树形分支展示（用于有形态分支的进化链）。
 * 共享前缀只渲染一次，分叉点后的分支纵向排列。
 */
interface BranchViewProps {
  chain: EvolutionStep[];
  detail: PokemonEntry;
  currentFormId: number | null;
}

function BranchView({ chain, detail, currentFormId }: BranchViewProps) {
  const roots = buildTree(chain);

  return (
    <div className="evo-branches">
      {roots.map((root, i) => (
        <TreeNode
          key={i}
          node={root}
          detail={detail}
          isRoot={true}
          currentFormId={currentFormId}
        />
      ))}
    </div>
  );
}

/* ─── Evolution Tab (懒加载) ─── */
export interface EvolutionTabProps {
  detail: PokemonEntry;
  evolutionChain: EvolutionStep[] | null;
  loading: boolean;
  currentFormId: number | null;
}

export default function EvolutionTab({ detail, evolutionChain, loading, currentFormId }: EvolutionTabProps) {
  if (loading) {
    return (
      <div className="tab-evolution">
        <div className="dex-drawer-loading">
          <div className="pulse-dot" />
          <span>加载进化链…</span>
        </div>
      </div>
    );
  }

  if (!evolutionChain || evolutionChain.length === 0) {
    return (
      <div className="tab-evolution">
        <p className="muted">该宝可梦没有进化链数据。</p>
      </div>
    );
  }

  const useBranches = hasFormBranches(evolutionChain);

  return (
    <div className="tab-evolution">
      {useBranches ? (
        <BranchView chain={evolutionChain} detail={detail} currentFormId={currentFormId} />
      ) : (
        <StageGroupView chain={evolutionChain} detail={detail} currentFormId={currentFormId} />
      )}
    </div>
  );
}
