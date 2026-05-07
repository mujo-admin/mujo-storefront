import type { Metadata } from "next";
import { CheckoutForm } from "components/checkout/checkout-form";

export const metadata: Metadata = {
  title: "Checkout",
  // Cart-state pages should never be indexed (varying per-user content + no SEO value).
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <div className="checkout-page-shell">
      <CheckoutForm />
      <style>{`
        .checkout-page-shell {
          background: var(--cream);
          min-height: calc(100vh - 100px);
        }
      `}</style>
    </div>
  );
}
