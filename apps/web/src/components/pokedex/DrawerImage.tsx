import type { ImageAsset } from "@pokemon-localdex/store-types";

export interface DrawerImageProps {
  images?: Record<string, ImageAsset | string>;
  mode: string;
  onModeChange: (mode: string) => void;
}

/* ─── Drawer Image ─── */
export default function DrawerImage({ images, mode, onModeChange }: DrawerImageProps) {
  const resolveUrl = (name: string): string | undefined => {
    const val = images?.[name];
    if (typeof val === "string") return val;
    if (val && typeof val === "object" && "url" in val) return val.url;
    return undefined;
  };

  const resolveAlt = (name: string): string | undefined => {
    const val = images?.[name];
    if (typeof val === "string") return undefined;
    if (val && typeof val === "object" && "alt" in val) return val.alt;
    return undefined;
  };

  const srcUrl = mode === "shiny"
    ? resolveUrl("shinyOfficial") || resolveUrl("shinySprite") || resolveUrl("official") || resolveUrl("sprite")
    : resolveUrl("official") || resolveUrl("sprite") || resolveUrl("shinyOfficial") || resolveUrl("shinySprite");

  const srcAlt = mode === "shiny"
    ? resolveAlt("shinyOfficial") || resolveAlt("shinySprite") || resolveAlt("official") || resolveAlt("sprite")
    : resolveAlt("official") || resolveAlt("sprite") || resolveAlt("shinyOfficial") || resolveAlt("shinySprite");

  return (
    <div className="drawer-img-inner">
      {srcUrl
        ? <img src={srcUrl} alt={srcAlt || ""} referrerPolicy="no-referrer" />
        : <span className="drawer-img-empty">暂无图片</span>}
      <div className="drawer-img-toggle">
        <button className={mode === "official" ? "active" : ""} onClick={() => onModeChange("official")}>普通</button>
        <button className={mode === "shiny" ? "active" : ""} onClick={() => onModeChange("shiny")}>闪光</button>
      </div>
    </div>
  );
}
