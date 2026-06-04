import { useState, type ImgHTMLAttributes } from "react";

interface ExternalImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onError"> {
  /** 图片 URL */
  src: string | undefined;
  /** 加载失败时展示的文字占位符，默认 "?" */
  fallbackText?: string;
  /** 占位符额外类名 */
  fallbackClassName?: string;
}

/**
 * 通用外部图片组件。
 * - 自动添加 referrerPolicy="no-referrer" 绕过 52poke 等站点防盗链
 * - 加载失败时渲染文字占位符
 * - 支持所有 <img> 标准属性透传
 */
export default function ExternalImage({
  src,
  alt = "",
  fallbackText = "?",
  fallbackClassName = "",
  className,
  ...rest
}: ExternalImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={`external-img-fallback ${fallbackClassName}`.trim()}>
        {fallbackText}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
