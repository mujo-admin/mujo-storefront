"use client";

import { useEffect, useState } from "react";

type MobileStickyCTAProps = {
  href?: string;
  onClick?: () => void;
  label: string;
  /** Pixels of scroll before the CTA reveals. Default 300. */
  revealAfter?: number;
};

/**
 * <MobileStickyCTA /> — fixed bottom CTA, mobile-only, scroll-reveal.
 * Used on Ritual landing + Ritual PDP + Lemna landing + Lemna PDP.
 */
export function MobileStickyCTA({
  href,
  onClick,
  label,
  revealAfter = 300,
}: MobileStickyCTAProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > revealAfter);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [revealAfter]);

  const Tag: React.ElementType = href ? "a" : "button";
  const tagProps: Record<string, unknown> = href
    ? { href }
    : { type: "button", onClick };

  return (
    <>
      <Tag
        className={`msc ${visible ? "show" : ""}`}
        aria-hidden={!visible}
        {...tagProps}
      >
        {label}
      </Tag>
      <style>{`
        .msc {
          position: fixed;
          left: 16px;
          right: 16px;
          bottom: max(16px, env(safe-area-inset-bottom));
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 52px;
          padding: 14px 24px;
          background: var(--orange);
          color: var(--cream);
          font-family: var(--f-display);
          font-size: 16px;
          font-weight: 500;
          letter-spacing: var(--track-cta);
          text-decoration: none;
          border: 0;
          border-radius: var(--radius-cta);
          box-shadow: 0 12px 32px rgba(242, 104, 47, 0.35);
          transform: translateY(calc(100% + 24px));
          opacity: 0;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
          pointer-events: none;
          cursor: pointer;
        }
        .msc.show {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        .msc:hover { background: var(--orange-deep); }
        @media (min-width: 768px) {
          .msc { display: none; }
        }
      `}</style>
    </>
  );
}
