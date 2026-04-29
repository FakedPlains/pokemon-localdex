export default function ImageViewer({ images, imageMode, onModeChange }) {
  const selected = imageMode === "shiny"
    ? images?.shinyOfficial || images?.shinySprite || images?.official || images?.sprite
    : images?.official || images?.sprite || images?.shinyOfficial || images?.shinySprite;

  if (!selected?.url) {
    return <div className="media-placeholder">暂无图片</div>;
  }

  return (
    <div className="media-viewer">
      <img src={selected.url} alt={selected.alt || "图片"} className="entity-image" referrerPolicy="no-referrer" />
      {onModeChange && (
        <div className="toolbar-row" style={{ marginTop: 12 }}>
          <button
            className={imageMode === "official" ? "" : "secondary"}
            style={{ padding: "8px 12px", fontSize: 12 }}
            onClick={() => onModeChange("official")}
          >
            普通
          </button>
          <button
            className={imageMode === "shiny" ? "" : "secondary"}
            style={{ padding: "8px 12px", fontSize: 12 }}
            onClick={() => onModeChange("shiny")}
          >
            闪光
          </button>
        </div>
      )}
    </div>
  );
}
