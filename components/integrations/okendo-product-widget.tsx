"use client";

import Script from "next/script";

type OkendoProductWidgetProps = {
  shopifyProductId?: string;
};

/**
 * <OkendoProductWidget /> — review widget on the Ritual PDP.
 * If NEXT_PUBLIC_OKENDO_API_KEY + shopifyProductId are present, renders the
 * Okendo widget div + script. Otherwise renders a placeholder slot styled to
 * match the page section (cutover-state acceptable).
 */
export function OkendoProductWidget({
  shopifyProductId,
}: OkendoProductWidgetProps) {
  const apiKey = process.env.NEXT_PUBLIC_OKENDO_API_KEY;
  const ready = Boolean(apiKey && shopifyProductId);

  if (!ready) {
    return (
      <div
        data-okendo-placeholder
        style={{
          padding: "32px 24px",
          background: "var(--sand)",
          borderRadius: "var(--radius-card)",
          textAlign: "center",
          color: "var(--mute)",
          fontFamily: "var(--f-mono)",
          fontSize: 14,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Reviews coming soon
      </div>
    );
  }

  return (
    <>
      <div
        data-oke-widget
        data-oke-reviews-product-id={`shopify-${shopifyProductId}`}
      />
      <Script
        src="https://d3hw6dc1ow8pp2.cloudfront.net/reviews-widget-plus/js/okendo-reviews.js"
        strategy="lazyOnload"
      />
    </>
  );
}
