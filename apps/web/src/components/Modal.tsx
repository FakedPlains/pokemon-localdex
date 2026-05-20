import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 通用弹窗组件
 * 支持 Escape 关闭、点击遮罩关闭、锁定 body 滚动
 */
export default function Modal({ open, onClose, title, headerExtra, children }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" ref={backdropRef} onClick={(e: React.MouseEvent<HTMLDivElement>) => { if (e.target === backdropRef.current) onClose(); }}>
      <div className="modal-container">
        <div className="modal-header">
          <strong className="modal-title">{title}</strong>
          {headerExtra && <div className="modal-header-extra">{headerExtra}</div>}
          <button className="modal-close-btn" onClick={onClose} title="关闭">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.11 3.05a.75.75 0 0 0-1.06 1.06L6.94 8l-3.89 3.89a.75.75 0 1 0 1.06 1.06L8 9.06l3.89 3.89a.75.75 0 1 0 1.06-1.06L9.06 8l3.89-3.89a.75.75 0 0 0-1.06-1.06L8 6.94 4.11 3.05z"/></svg>
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
