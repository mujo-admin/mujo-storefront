import Link from "next/link";
import { FooterManageSubLink } from "components/FooterManageSubLink";

/**
 * <Footer /> — canonical 4-column sage footer used on every page.
 * Source: extracted from mujo_nav_system.html v1.0.
 * URL patches per W3 plan: /products/lemna-bar → /products/lemna,
 * /policies/* → /legal/*, /affiliate → /ambassador.
 */
export function Footer() {
  return (
    <footer
      className="mujo-foot"
      style={{
        background: "var(--sage)",
        color: "rgba(255,255,255,0.5)",
        padding: "56px 0 28px",
      }}
    >
      <div
        style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}
      >
        <div className="foot-grid">
          <div className="foot-brand">
            <img
              src="/images/logo/mujo-logo-orange.png"
              alt="Mujo"
              style={{ height: 28, width: "auto", marginBottom: 14 }}
            />
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.6)",
                maxWidth: 320,
                marginBottom: 18,
              }}
            >
              Conscious performance nutrition for people who read the label.
            </p>
            <form
              data-mujo-form="rebel-club"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                maxWidth: 320,
              }}
            >
              <input
                type="email"
                name="email"
                required
                placeholder="your@email.com"
                aria-label="Email address"
                style={{
                  flex: "1 1 180px",
                  minWidth: 0,
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontFamily: "var(--f-body)",
                  fontSize: 13,
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: 0,
                  background: "var(--orange)",
                  color: "#fff",
                  fontFamily: "var(--f-display)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Join Rebel Club →
              </button>
            </form>
            {/* "Pick a tribe" chips removed 2026-05-25 — confusing without context.
                "About the Club" link kept so people can learn more. */}
            <a
              href="/rebel-club"
              style={{
                display: "inline-block",
                marginTop: 14,
                fontSize: 12,
                color: "rgba(255,255,255,0.5)",
                textDecoration: "none",
                borderBottom: "1px solid rgba(255,255,255,0.2)",
                paddingBottom: 1,
              }}
            >
              About the Club →
            </a>
          </div>
          <FooterColumn
            title="Shop"
            links={[
              { href: "/products/mujo-ritual", label: "Mujo Ritual" },
              // Points to the /lemna landing — the pre-order PDP (/products/lemna)
              // is hidden until launch (see next.config.ts redirects). Restore to
              // /products/lemna when pre-orders open.
              { href: "/lemna", label: "Lemna Bar" },
              { href: "/shop", label: "Subscribe & save" },
              { href: "/rebel-club", label: "Rebel Club" },
            ]}
          />
          <FooterColumn
            title="Learn"
            links={[
              { href: "/ingredients", label: "Ingredients" },
              { href: "/science", label: "The Science" },
              { href: "/about", label: "Our story" },
              { href: "/journal", label: "Journal" },
            ]}
          />
          <FooterColumn
            title="Support"
            links={[
              { href: "/contact", label: "Contact" },
              { href: "/legal/shipping", label: "Shipping & returns" },
              { href: "/ambassador", label: "Ambassador program" },
            ]}
          >
            <FooterManageSubLink />
          </FooterColumn>
        </div>
        <div
          className="foot-bottom"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.3)",
              maxWidth: 680,
              fontFamily: "var(--f-mono)",
              letterSpacing: "0.02em",
            }}
          >
            *These statements have not been evaluated by the FDA. This product
            is not intended to diagnose, treat, cure, or prevent any disease.
            Individual results may vary.
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 18px",
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
            }}
          >
            <Link
              href="/legal/privacy"
              style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}
            >
              Privacy Policy
            </Link>
            <Link
              href="/legal/terms"
              style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}
            >
              Terms &amp; Conditions
            </Link>
          </div>
          <div
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.3)",
            }}
          >
            © {new Date().getFullYear()} Mujo
          </div>
        </div>
      </div>
      <style>{`
        /* Mobile / tablet (default): brand spans full width centered;
           Shop + Learn share col 1 stacked; Support col 2 with Manage at bottom */
        .mujo-foot .foot-grid {
          display: grid;
          gap: 28px;
          grid-template-columns: 1fr 1fr;
          grid-template-areas:
            "brand brand"
            "shop support"
            "learn support";
          margin-bottom: 32px;
        }
        .mujo-foot .foot-grid > :nth-child(1) { grid-area: brand; }
        .mujo-foot .foot-grid > :nth-child(2) { grid-area: shop; }
        .mujo-foot .foot-grid > :nth-child(3) { grid-area: learn; }
        .mujo-foot .foot-grid > :nth-child(4) { grid-area: support; }

        /* Mobile/tablet brand block: centered */
        @media (max-width: 1023px) {
          .mujo-foot .foot-brand { text-align: center; }
          .mujo-foot .foot-brand img { display: inline-block; }
          .mujo-foot .foot-brand p {
            margin-left: auto;
            margin-right: auto;
          }
          .mujo-foot .foot-brand form {
            margin-left: auto;
            margin-right: auto;
            justify-content: center;
          }
          .mujo-foot .foot-brand a { display: inline-block; }
        }

        /* Desktop: single row, 4 columns left-aligned (canonical layout) */
        @media (min-width: 1024px) {
          .mujo-foot .foot-grid {
            grid-template-columns: 1.6fr 1fr 1fr 1fr;
            grid-template-areas: "brand shop learn support";
          }
          .mujo-foot .foot-brand { text-align: left; }
          .mujo-foot .foot-brand p { margin-left: 0; margin-right: 0; }
          .mujo-foot .foot-brand form {
            margin-left: 0;
            margin-right: 0;
            justify-content: flex-start;
          }
        }

        @media (min-width: 768px) {
          .mujo-foot .foot-bottom {
            flex-direction: row !important;
            justify-content: space-between;
            align-items: flex-start;
            gap: 32px;
          }
        }
        .mujo-foot .foot-link:hover { color: var(--sage-light) !important; }

        /* Sub-tribe chip selector inside the brand block */
        .mujo-foot .foot-tribes {
          margin-top: 14px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px 8px;
          align-items: center;
          max-width: 320px;
        }
        .mujo-foot .foot-tribes-label {
          font-family: var(--f-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          width: 100%;
          margin-bottom: 2px;
        }
        .mujo-foot .foot-tribe-chip {
          display: inline-block;
          padding: 5px 12px;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.04);
          font-family: var(--f-body);
          font-size: 11.5px;
          font-weight: 500;
          color: rgba(255,255,255,0.7);
          text-decoration: none;
          transition: border-color 0.2s, color 0.2s, background 0.2s;
          white-space: nowrap;
        }
        .mujo-foot .foot-tribe-chip:hover {
          border-color: var(--orange);
          color: #fff;
          background: rgba(242,104,47,0.12);
        }

        /* Mobile/tablet: brand block centered, chips center too */
        @media (max-width: 1023px) {
          .mujo-foot .foot-tribes {
            margin-left: auto;
            margin-right: auto;
            justify-content: center;
          }
          .mujo-foot .foot-tribes-label { text-align: center; }
        }
      `}</style>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
  children,
}: {
  title: string;
  links: { href: string; label: string }[];
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--f-mono)",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--orange)",
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="foot-link"
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.55)",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
          >
            {l.label}
          </Link>
        ))}
        {children}
      </div>
    </div>
  );
}
