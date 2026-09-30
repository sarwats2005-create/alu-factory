"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for every `table.data` in the app:
 *  - copies each column header onto its cells as `data-label`, so on phones
 *    the CSS can restack rows into labelled cards instead of forcing a
 *    sideways scroll (people rarely discover horizontal scroll);
 *  - right-aligns a header when its column's cells are right-aligned, so
 *    numbers and their headings share one edge (the eye scans one line).
 * Runs on mount and whenever table markup changes (pagination, filters, i18n).
 */
export default function TableEnhancer() {
  useEffect(() => {
    let frame = 0;
    const enhance = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>("table.data").forEach((table) => {
        const heads = Array.from(table.tHead?.rows[0]?.cells ?? []);
        if (!heads.length) return;
        const labels = heads.map((th) => th.textContent?.trim() ?? "");
        const firstRow = table.tBodies[0]?.rows[0];
        heads.forEach((th, i) => {
          const cell = firstRow?.cells[i];
          if (!cell || cell.colSpan > 1) return;
          const align = getComputedStyle(cell).textAlign;
          const rtl = getComputedStyle(cell).direction === "rtl";
          const isEnd = align === "end" || (!rtl && align === "right") || (rtl && align === "left");
          th.classList.toggle("th-end", isEnd);
        });
        for (const body of Array.from(table.tBodies)) {
          for (const row of Array.from(body.rows)) {
            Array.from(row.cells).forEach((td, i) => {
              if (td.colSpan > 1) td.setAttribute("data-full", "");
              const label = labels[i] ?? "";
              if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
            });
          }
        }
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(enhance);
    };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      obs.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
