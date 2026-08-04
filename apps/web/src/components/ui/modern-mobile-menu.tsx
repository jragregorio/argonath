"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ElementType, CSSProperties } from "react";
import { cn } from "@warden/ui";

type IconComponentType = ElementType<{ className?: string }>;

export interface InteractiveMenuItem {
  label: string;
  icon: IconComponentType;
  href?: string;
  onClick?: () => void;
  badge?: number;
}

export interface InteractiveMenuProps {
  items: InteractiveMenuItem[];
  activeIndex: number;
  onItemSelect: (index: number) => void;
  accentColor?: string;
  className?: string;
  "aria-label"?: string;
}

const defaultAccentColor = "var(--component-active-color-default)";

export function InteractiveMenu({
  items,
  activeIndex,
  onItemSelect,
  accentColor,
  className,
  "aria-label": ariaLabel = "Primary",
}: InteractiveMenuProps) {
  const textRefs = useRef<(HTMLElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const navStyle = useMemo(() => {
    const activeColor = accentColor || defaultAccentColor;
    return { "--component-active-color": activeColor } as CSSProperties;
  }, [accentColor]);

  useEffect(() => {
    const setLineWidth = () => {
      const activeItemElement = itemRefs.current[activeIndex];
      const activeTextElement = textRefs.current[activeIndex];

      if (activeItemElement && activeTextElement) {
        const textWidth = activeTextElement.offsetWidth;
        activeItemElement.style.setProperty("--lineWidth", `${textWidth}px`);
      }
    };

    setLineWidth();
    window.addEventListener("resize", setLineWidth);
    return () => window.removeEventListener("resize", setLineWidth);
  }, [activeIndex, items]);

  return (
    <nav
      className={cn("menu", className)}
      role="navigation"
      aria-label={ariaLabel}
      style={navStyle}
    >
      {items.map((item, index) => {
        const isActive = index === activeIndex;
        const IconComponent = item.icon;
        const badge = item.badge ?? 0;

        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            className={cn("menu__item", isActive && "active")}
            onClick={() => onItemSelect(index)}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            style={{ "--lineWidth": "0px" } as CSSProperties}
            aria-current={isActive ? "page" : undefined}
            aria-label={item.label}
          >
            <div className="menu__icon">
              <IconComponent className="icon" aria-hidden="true" />
              {badge > 0 && (
                <span className="menu__badge" aria-hidden="true">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </div>
            <strong
              className={cn("menu__text", isActive && "active")}
              ref={(el) => {
                textRefs.current[index] = el;
              }}
            >
              {item.label}
            </strong>
          </button>
        );
      })}
    </nav>
  );
}
