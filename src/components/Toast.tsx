"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

type Toast = { id: number; msg: string; kind: "success" | "error" | "info" };
let listeners: ((t: Toast[]) => void)[] = [];
let toasts: Toast[] = [];
let seq = 1;

export function toast(msg: string, kind: Toast["kind"] = "info") {
  const item = { id: seq++, msg, kind };
  toasts = [...toasts.slice(-3), item];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    listeners.forEach((l) => l(toasts));
  }, 4200);
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.push(setItems);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);
  return (
    <div
      className="fixed z-[100] bottom-20 md:bottom-6 inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none"
      dir="ltr"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="toast flex items-center gap-2.5"
          style={{
            background:
              t.kind === "success" ? "#17813c" : t.kind === "error" ? "#c5221f" : "#1a2433",
          }}
          role="status"
        >
          <Icon
            name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "bell"}
            size={15}
            className="shrink-0 opacity-90"
          />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
