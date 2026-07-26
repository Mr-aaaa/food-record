"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DUR, EASE, useMotionPref } from "@/components/ui/motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** 语义标签，默认 "对话框"。 */
  label?: string;
}

/**
 * 可复用弹窗：framer-motion AnimatePresence 进出过渡。
 * - 遮罩淡入 200ms ease-out / 淡出 150ms ease-in。
 * - 面板缩放+上移 280ms 进 / 180ms 出（退出快于进入）。
 * - 支持 Esc 关闭、点遮罩关闭、关闭后焦点回退到触发元素。
 * - role="dialog" aria-modal，简易焦点陷阱。
 */
export default function Modal({ open, onClose, title, description, children, label = "对话框" }: Readonly<ModalProps>) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { reduce } = useMotionPref();

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      else if (event.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    // 进入即聚焦面板首个可聚焦元素
    const id = window.setTimeout(() => {
      const node = panelRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      node?.focus();
    }, 0);
    return () => { document.removeEventListener("keydown", onKey, true); window.clearTimeout(id); };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) triggerRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: DUR.base, ease: EASE.out as unknown as number[] }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.div
            ref={panelRef}
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={reduce
              ? { duration: 0 }
              : { duration: DUR.enter, ease: EASE.out as unknown as number[] }}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{title}</h3>
                {description && <p className="modal-desc">{description}</p>}
              </div>
              <button type="button" className="modal-close" aria-label={`关闭${label}`} onClick={onClose}>×</button>
            </div>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}