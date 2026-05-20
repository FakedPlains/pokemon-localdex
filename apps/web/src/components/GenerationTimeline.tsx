import type { BaseGenerationRecord } from "@pokemon-localdex/store-types";

export interface GenerationTimelineProps {
  generations?: BaseGenerationRecord[];
  title?: string;
}

/**
 * 世代变更时间线组件
 * 通用于招式页、特性页、道具页
 */
export default function GenerationTimeline({ generations, title = "世代变更" }: GenerationTimelineProps) {
  if (!generations?.length) return null;

  return (
    <div className="shared-gen-section">
      <div className="shared-gen-title">{title}</div>
      <div className="shared-gen-timeline">
        {generations.map((record, i) => (
          <div key={i} className={`shared-gen-item${record.versionExclusive ? ' shared-gen-exclusive' : ''}`}>
            <div className="shared-gen-badges">
              <div className="shared-gen-badge">
                {record.generation === 99 ? "Champions" : `Gen ${record.generation}`}
              </div>
              {(record.gameVersionName || record.gameVersionCode) && (
                <div className="shared-gen-version">{record.gameVersionName || record.gameVersionCode}</div>
              )}
              {record.versionExclusive && (
                <div className="shared-gen-exclusive-tag">仅限</div>
              )}
            </div>
            <div className="shared-gen-text">{record.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
