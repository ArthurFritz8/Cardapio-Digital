"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  busy?: boolean;
  placement?: "center" | "bottom";
  children: ReactNode;
}

/** showModal fornece foco contido e fundo inerte, inclusive para teclado/leitor de tela. */
export function Modal({ open, onClose, labelledBy, busy = false, placement = "center", children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-inherit backdrop:bg-black/50"
    >
      <div className={cn("pointer-events-none flex min-h-full justify-center", placement === "bottom" ? "items-end" : "items-center p-4")}>
        <div className={cn("pointer-events-auto w-full overflow-y-auto bg-white p-5 dark:bg-neutral-950", placement === "bottom" ? "max-h-[85dvh] max-w-lg rounded-t-3xl" : "max-h-[85dvh] max-w-sm rounded-2xl")}>
          {children}
        </div>
      </div>
    </dialog>
  );
}
