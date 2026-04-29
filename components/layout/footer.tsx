import Link from "next/link";
import { ManageSubscriptionButton } from "components/ManageSubscriptionButton";

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
        marginTop: 56,
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
              }}
            >
              Conscious performance nutrition for people who read the label.
              Built in Portugal. Shipped globally.
            </p>
          </div>
          <FooterColumn
            title="Shop"
            links={[
              { href: "/products/mujo-ritual", label: "Mujo Ritual" },
              { href: "/products/lemna", label: "Lemna Bar" },
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
            <ManageSubscriptionButton />
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
        .mujo-foot .foot-grid {
          display: grid;
          gap: 32px;
          grid-template-columns: 1fr;
          margin-bottom: 32px;
        }
        @media (min-width: 640px) {
          .mujo-foot .foot-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 1024px) {
          .mujo-foot .foot-grid { grid-template-columns: 1.6fr 1fr 1fr 1fr; }
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
