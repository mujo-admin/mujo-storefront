import type { ReactNode } from "react";

type HeroVariant = "cold-ad" | "warm-pdp" | "brand";

type HeroProps = {
  variant?: HeroVariant;
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  primaryCta?: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  /** Right-side media slot. Pass an <Image> or a placeholder div. */
  media?: ReactNode;
  /** Adds extra contrast pad/background — useful on cold-ad pages. */
  emphasis?: boolean;
};

/**
 * <Hero variant /> — variant-driven landing/PDP/brand hero.
 * cold-ad: problem-first, single primary CTA, mobile-first.
 * warm-pdp: product-first, dual subscribe/one-time CTAs, larger media.
 * brand: editorial, cinematic spacing, no media required.
 */
export function Hero({
  variant = "brand",
  eyebrow,
  title,
  body,
  primaryCta,
  secondaryCta,
  media,
  emphasis = false,
}: HeroProps) {
  return (
    <section className={`mujo-hero mujo-hero--${variant}`}>
      <div className={`mujo-hero-inner ${emphasis ? "emph" : ""}`}>
        <div className="mujo-hero-copy reveal">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {body && <p>{body}</p>}
          {(primaryCta || secondaryCta) && (
            <div className="mujo-hero-ctas">
              {primaryCta && (
                <a className="cta-primary" href={primaryCta.href}>
                  {primaryCta.label}
                </a>
              )}
              {secondaryCta && (
                <a className="cta-secondary" href={secondaryCta.href}>
                  {secondaryCta.label}
                </a>
              )}
            </div>
          )}
        </div>
        {media && <div className="mujo-hero-media reveal d2">{media}</div>}
      </div>
      <style>{`
        .mujo-hero {
          padding: 56px 20px 40px;
          background: var(--cream);
        }
        @media (min-width: 768px) {
          .mujo-hero { padding: 80px 32px 56px; }
        }
        .mujo-hero-inner {
          max-width: var(--container-wide);
          margin: 0 auto;
          display: grid;
          gap: 32px;
          grid-template-columns: 1fr;
          align-items: center;
        }
        .mujo-hero-inner.emph {
          background: var(--sand);
          border-radius: var(--radius-card);
          padding: 32px 24px;
        }
        @media (min-width: 1024px) {
          .mujo-hero-inner { grid-template-columns: 1.1fr 0.9fr; gap: 64px; }
        }
        .mujo-hero-copy h1 {
          margin: 12px 0 16px;
        }
        .mujo-hero-copy p {
          color: var(--ink-soft);
          line-height: var(--lh-body);
          max-width: 560px;
        }
        .mujo-hero-ctas {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: var(--space-3);
        }
        .cta-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 18px 28px;
          background: transparent;
          color: var(--ink);
          font-family: var(--f-display);
          font-size: 16px;
          font-weight: 500;
          letter-spacing: var(--track-cta);
          text-decoration: none;
          border: 1.5px solid var(--ink);
          border-radius: var(--radius-cta);
          transition: background 0.15s, color 0.15s;
        }
        .cta-secondary:hover { background: var(--ink); color: var(--cream); }
      `}</style>
    </section>
  );
}
