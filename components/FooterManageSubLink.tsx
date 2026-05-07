"use client";

import { ManageSubscriptionButton } from "components/ManageSubscriptionButton";

/**
 * Footer-styled trigger for the magic-link modal. Lives in its own client
 * component so the closure never crosses the RSC boundary — `<Footer />` is a
 * server component and can't pass a function prop to a client component.
 *
 * Renders a button styled to match `<FooterColumn />`'s plain-text link
 * siblings (Contact / Shipping & returns / Ambassador program).
 */
export function FooterManageSubLink() {
  return (
    <ManageSubscriptionButton
      trigger={({ onClick }) => (
        <button
          type="button"
          onClick={onClick}
          className="foot-link foot-link-button"
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.55)",
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            fontFamily: "inherit",
            textAlign: "left",
            cursor: "pointer",
            transition: "color 0.2s",
          }}
        >
          Manage my subscription
        </button>
      )}
    />
  );
}
