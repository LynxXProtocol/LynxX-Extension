"use client";
// beui.dev/components/motion/preview-rail — Tailored for LYNXX White/Light Aesthetic

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { useHoverCapable } from "@/lib/hooks/use-hover-capable";
import { cn } from "@/lib/utils";

export interface PreviewRailItem {
  id: string;
  label: string;
  description?: ReactNode;
  href: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
}

export interface PreviewRailProps {
  items: PreviewRailItem[];
  orientation?: "vertical" | "horizontal";
  activeId?: string;
  defaultActiveId?: string;
  onActiveChange?: (id: string) => void;
  renderPreview?: (item: PreviewRailItem) => ReactNode;
  children?: ReactNode;
  className?: string;
  railClassName?: string;
  previewClassName?: string;
}

function DefaultPreview({ item }: { item: PreviewRailItem }) {
  return (
    <div className="rounded-xl border border-gray-200/90 bg-white/95 backdrop-blur-xl px-4 py-2.5 shadow-2xl text-gray-900 w-max font-sans flex items-center gap-2.5">
      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 shadow-sm" />
      <span className="font-bold text-sm text-gray-900 tracking-tight whitespace-nowrap">
        {item.label}
      </span>
    </div>
  );
}

export function PreviewRail({
  items,
  orientation = "vertical",
  activeId,
  defaultActiveId,
  onActiveChange,
  renderPreview,
  children,
  className,
  railClassName,
  previewClassName,
}: PreviewRailProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const [internalActiveId, setInternalActiveId] = useState(
    defaultActiveId ?? items[0]?.id ?? "",
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const requestedActiveId = activeId ?? internalActiveId;
  const selectedId = items.some((item) => item.id === requestedActiveId)
    ? requestedActiveId
    : (items[0]?.id ?? "");
  const displayedId = hoveredId ?? focusedId ?? "";
  const displayedIndex = items.findIndex((item) => item.id === displayedId);
  const rowTemplate = items.length
    ? `repeat(${items.length}, 1.75rem)`
    : undefined;
  const isHorizontal = orientation === "horizontal";

  const selectItem = (id: string) => {
    if (activeId === undefined) setInternalActiveId(id);
    onActiveChange?.(id);
  };

  return (
    <motion.div
      layoutRoot
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusedId(null);
        }
      }}
      className={cn(
        "isolate relative flex w-full overflow-visible z-[100]",
        isHorizontal
          ? "min-h-64 flex-col items-center justify-center"
          : "items-center justify-start pt-2",
        className,
      )}
    >
      <nav
        aria-label="Section navigation"
        onPointerLeave={() => setHoveredId(null)}
        style={
          isHorizontal
            ? { gridTemplateColumns: rowTemplate }
            : { gridTemplateRows: rowTemplate }
        }
        className={cn(
          "relative z-[100] grid shrink-0",
          isHorizontal
            ? "h-12 w-fit max-w-full self-center justify-center"
            : "w-10 content-start justify-center",
          railClassName,
        )}
      >
        {items.map((item, index) => {
          const selected = item.id === selectedId;
          const displayed = item.id === displayedId;
          const highlighted = displayed;
          const distance =
            displayedIndex < 0 ? Number.POSITIVE_INFINITY : Math.abs(index - displayedIndex);
          const scale = highlighted
            ? 1
            : distance === 1
              ? 0.7
              : distance === 2
                ? 0.45
                : 0.28;

          return (
            <a
              key={item.id}
              href={item.href}
              target={item.target}
              rel={
                item.rel ??
                (item.target === "_blank" ? "noreferrer noopener" : undefined)
              }
              aria-label={item.label}
              aria-current={selected ? "page" : undefined}
              onPointerEnter={() => {
                if (canHover) setHoveredId(item.id);
              }}
              onPointerDown={() => setFocusedId(null)}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) {
                  setFocusedId(item.id);
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                selectItem(item.id);
              }}
              className={cn(
                "relative flex text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white cursor-pointer",
                isHorizontal
                  ? "h-12 w-7 items-end justify-center"
                  : "h-7 w-10 items-center justify-center",
              )}
            >
              <motion.span
                aria-hidden="true"
                animate={isHorizontal ? { scaleY: scale } : { scaleX: scale }}
                transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                className={cn(
                  "block rounded-full transition-colors duration-150",
                  isHorizontal
                    ? "h-12 w-1 origin-bottom"
                    : "h-1 w-8 origin-center",
                  highlighted
                    ? "bg-amber-500 shadow-sm"
                    : selected
                      ? "bg-gray-900"
                      : "bg-gray-300 hover:bg-gray-400",
                )}
              />
            </a>
          );
        })}
      </nav>

      {/* Floating Destination Preview Card (z-[100] so it pops in FRONT of all cards/charts!) */}
      <div
        aria-hidden="true"
        style={
          isHorizontal
            ? { gridTemplateColumns: rowTemplate }
            : { gridTemplateRows: rowTemplate }
        }
        className={cn(
          "pointer-events-none absolute z-[100] grid",
          isHorizontal
            ? "top-1/2 left-1/2 h-5 w-fit max-w-full -translate-x-1/2 -translate-y-1/2 justify-center"
            : "inset-y-0 left-12 content-start pt-2",
        )}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "relative flex h-7 items-center",
              isHorizontal ? "w-7 justify-center" : undefined,
            )}
          >
            {item.id === displayedId ? (
              <div
                className={cn(
                  isHorizontal
                    ? "absolute bottom-12 left-1/2 w-max -translate-x-1/2"
                    : "w-max",
                  previewClassName,
                )}
              >
                <motion.div
                  layoutId={`preview-rail-card-${uid}`}
                  transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={item.id}
                      initial={
                        reduce
                          ? { opacity: 0 }
                          : { opacity: 0, x: -6, filter: "blur(6px)" }
                      }
                      animate={
                        reduce
                          ? { opacity: 1 }
                          : { opacity: 1, x: 0, filter: "blur(0px)" }
                      }
                      exit={
                        reduce
                          ? { opacity: 0 }
                          : {
                              opacity: 0,
                              x: -4,
                              filter: "blur(4px)",
                              transition: {
                                duration: 0.12,
                                ease: EASE_OUT,
                              },
                            }
                      }
                      transition={{
                        duration: reduce ? 0 : 0.18,
                        ease: EASE_OUT,
                      }}
                    >
                      {renderPreview ? (
                        renderPreview(item)
                      ) : (
                        <DefaultPreview item={item} />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {children ? (
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      ) : null}
    </motion.div>
  );
}
