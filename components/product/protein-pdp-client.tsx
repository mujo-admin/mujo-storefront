"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PROTEIN_PREORDER_SHIP_LABEL } from "lib/stripe-constants";
import { useCart } from "components/cart/cart-context";
import { resolveProteinSelection } from "lib/cart/price-id-map";

// Protein Powder buy box (pre-order). One-time purchase only until the powder
// is shipping (Kinga 2026-10-05); subscriptions get added then, copying the
// Ritual buy box. The server-side subscription Prices and pre-order trial logic
// stay in place but nothing here can select them. The markup and class names
// match the static design buy box in
// content/imported-html/mujo_protein_powder_pdp.html, whose CSS styles it.
const PRICE = { now: "$45", daily: "$3.00 a serving · 13.6¢/g protein" };

type Shared = {
  onAddToCart: () => void;
  pending: boolean;
  shown: boolean;
};

function BuyBox({ onAddToCart, pending }: Shared) {
  return (
    <>
      <div className="size-line">
        <strong>450g pouch</strong> · 15 servings
      </div>

      <div className="purchase-block">
        <div className="purchase-label">Pre-order</div>
        <div className="purchase-options">
          <div className="pur-opt active">
            <div className="pur-opt-radio" />
            <div className="pur-opt-info">
              <div className="pur-opt-name">One-time purchase</div>
              <div className="pur-opt-desc">{PRICE.daily}</div>
            </div>
            <div className="pur-opt-price">
              <div className="pur-opt-price-now">{PRICE.now}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="atc-block" id="atc">
        <button
          type="button"
          className="atc-btn"
          onClick={onAddToCart}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Adding…" : "Pre-order now"}
        </button>
        <div className="atc-shipline">Ships by {PROTEIN_PREORDER_SHIP_LABEL}</div>
      </div>
    </>
  );
}

function StickyAtc({ onAddToCart, pending, shown }: Shared) {
  return (
    <div className={`sticky-atc${shown ? " show" : ""}`}>
      <div className="sticky-atc-info">
        <div className="sticky-atc-name">Protein Powder · Vanilla Bean</div>
        <div className="sticky-atc-price">
          Pre-order · {PRICE.now} · ships by {PROTEIN_PREORDER_SHIP_LABEL}
        </div>
      </div>
      <button
        type="button"
        className="sticky-atc-btn"
        onClick={onAddToCart}
        disabled={pending}
        aria-busy={pending}
      >
        Pre-order
      </button>
    </div>
  );
}

const ProteinContext = createContext<Shared | null>(null);

function useProtein(): Shared {
  const ctx = useContext(ProteinContext);
  if (!ctx) throw new Error("Protein buy box used outside <ProteinSelectionProvider>");
  return ctx;
}

/**
 * Shared state for the Protein Powder buy box and the mobile sticky bar. Wraps
 * the imported page; both render in place inside the server HTML via `slots`
 * (2026-10-25 speed pass, they used to be portalled in after the page's code
 * ran). Adds one pouch to the cart (quantity is changed in the cart drawer).
 */
export function ProteinSelectionProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState(false);
  const { addItem } = useCart();

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 520);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function onAddToCart() {
    if (pending) return;
    const resolved = resolveProteinSelection("onetime");
    if (!resolved) {
      console.error(
        "[protein-pdp] Missing Stripe Price ID. Check NEXT_PUBLIC_PROTEIN_PRICE_ONETIME.",
      );
      return;
    }
    setPending(true);
    try {
      addItem({ stripePriceId: resolved.stripePriceId, ...resolved.line, quantity: 1 });
    } finally {
      setTimeout(() => setPending(false), 80);
    }
  }

  const shared: Shared = { onAddToCart, pending, shown };
  return <ProteinContext.Provider value={shared}>{children}</ProteinContext.Provider>;
}

/** The buy box, rendered in place of the `protein-buybox` marker. */
export function ProteinBuyBoxSlot() {
  return <BuyBox {...useProtein()} />;
}

/** The mobile sticky bar, rendered in place of `protein-sticky-atc`. */
export function ProteinStickyAtcSlot() {
  return <StickyAtc {...useProtein()} />;
}
