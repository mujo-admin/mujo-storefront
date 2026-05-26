"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  RITUAL_PRICE_IDS,
  type RitualSize,
  type RitualPlan,
} from "lib/stripe-constants";
import { useCart } from "components/cart/cart-context";
import { resolveRitualSelection } from "lib/cart/price-id-map";

// Pricing table — drives all in-page prices off (size, plan).
// Subscribe & save = 15% off the one-time price. The 10-serving bag is
// one-time only (smaller bag, higher unit cost — no sub option, no discount).
type PriceCell = {
  now: string;
  was?: string;
  daily: string;
};
const PRICES: Record<RitualSize, Partial<Record<RitualPlan, PriceCell>>> = {
  "10": {
    onetime: { now: "$27.00", daily: "$2.70/serving" },
  },
  "25": {
    onetime: { now: "$65.00", daily: "$2.60/serving" },
    subscription: { now: "$55.25", was: "$65.00", daily: "$1.73/serving" },
  },
};

function effectivePlan(size: RitualSize, plan: RitualPlan): RitualPlan {
  // 10-serving has no subscription Price — coerce to one-time.
  return size === "10" ? "onetime" : plan;
}

function formatStickyLine(size: RitualSize, plan: RitualPlan): string {
  const resolvedPlan = effectivePlan(size, plan);
  const cell = PRICES[size][resolvedPlan];
  const price = cell?.now ?? "";
  const tail = resolvedPlan === "subscription" ? "Subscribe" : "One-time";
  return `${price} · ${tail}`;
}

// Re-mount when the marker div appears in the DOM (after SSR hydration).
function useMountTarget(mountId: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const found = document.querySelector<HTMLElement>(
      `[data-mujo-mount="${mountId}"]`,
    );
    setEl(found);
  }, [mountId]);
  return el;
}

type Shared = {
  size: RitualSize;
  plan: RitualPlan;
  setSize: (s: RitualSize) => void;
  setPlan: (p: RitualPlan) => void;
  onAddToCart: () => void;
  pending: boolean;
  /** Sticky ATC reveal state (mobile, shown after scrolling past the buy box). */
  shown: boolean;
};

function BuyBox({ size, plan, setSize, setPlan, onAddToCart, pending }: Shared) {
  const sub = PRICES[size].subscription;
  const once = PRICES[size].onetime!; // every size has a one-time Price
  const resolvedPlan = effectivePlan(size, plan);
  const showSubscribe = size === "25" && sub !== undefined;

  return (
    <>
      <div className="size-block">
        <div className="size-label">Size</div>
        <div className="size-options">
          <div
            className={`size-opt${size === "10" ? " active" : ""}`}
            onClick={() => setSize("10")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSize("10")}
          >
            <div className="size-opt-top">
              <div className="size-opt-count">10 servings</div>
            </div>
            <div className="size-opt-price">$27.00</div>
          </div>
          <div
            className={`size-opt${size === "25" ? " active" : ""}`}
            onClick={() => setSize("25")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSize("25")}
          >
            <div className="size-opt-top">
              <div className="size-opt-count">25 servings</div>
              <div className="size-opt-badge">Best value</div>
            </div>
            <div className="size-opt-price">$65.00 · $2.60/serving</div>
          </div>
        </div>
      </div>

      <div className="purchase-block">
        <div className="purchase-label">Choose your plan</div>
        <div className="purchase-options">
          {showSubscribe && sub && (
            <div
              className={`pur-opt${resolvedPlan === "subscription" ? " active" : ""}`}
              onClick={() => setPlan("subscription")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && setPlan("subscription")
              }
            >
              <div className="pur-opt-radio" />
              <div className="pur-opt-info">
                <div className="pur-opt-name">
                  Subscribe{" "}
                  <span className="pur-opt-save">Save 15%</span>
                </div>
                <div className="pur-opt-desc">
                  Ships every 4 weeks · min. commitment of 2 delivery cycles
                </div>
              </div>
              <div className="pur-opt-price">
                <div className="pur-opt-price-now">{sub.now}</div>
                <div className="pur-opt-price-was">{sub.was}</div>
                <div className="pur-opt-daily">{sub.daily}</div>
              </div>
            </div>
          )}
          <div
            className={`pur-opt${resolvedPlan === "onetime" ? " active" : ""}`}
            onClick={() => setPlan("onetime")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) =>
              (e.key === "Enter" || e.key === " ") && setPlan("onetime")
            }
          >
            <div className="pur-opt-radio" />
            <div className="pur-opt-info">
              <div className="pur-opt-name">One-time purchase</div>
            </div>
            <div className="pur-opt-price">
              <div className="pur-opt-price-now">{once.now}</div>
              <div className="pur-opt-daily">{once.daily}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="atc-block" id="atc">
        <button
          className="atc-btn"
          onClick={onAddToCart}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Loading…" : "Add to cart"}
        </button>
        <div className="atc-trust">
          <div className="atc-trust-item" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 5h13v11H1z" />
              <path d="M14 9h4l3 3v4h-7z" />
              <circle cx="5.5" cy="18.5" r="1.6" />
              <circle cx="17.5" cy="18.5" r="1.6" />
            </svg>
            Free shipping over $100
          </div>
          <div className="atc-trust-item" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="9" r="6" />
              <path d="M9.5 9l1.8 1.8L15 7.2" />
              <path d="M8.6 14.2L7 22l5-2.8L17 22l-1.6-7.8" />
            </svg>
            30-day money back
          </div>
        </div>
      </div>
    </>
  );
}

function StickyAtc({ size, plan, onAddToCart, pending, shown }: Shared) {
  return (
    <div className={`sticky-atc${shown ? " show" : ""}`} id="stickyATC">
      <div className="sticky-atc-info">
        <div className="sticky-atc-name">Mujo Ritual · {size} servings</div>
        <div className="sticky-atc-price" id="stickyATCPrice">
          {formatStickyLine(size, plan)}
        </div>
      </div>
      <button
        className="sticky-atc-btn"
        onClick={onAddToCart}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Loading…" : "Add to cart"}
      </button>
    </div>
  );
}

/**
 * Top-level client component for the Ritual PDP.
 * - Holds shared (size, plan) state.
 * - Mounts <BuyBox /> + <StickyAtc /> via Portals into the marker divs left
 *   by lib/imported-html.ts splices.
 * - Wires Add to Cart → POST /api/checkout with the right Stripe Price ID.
 */
export function RitualPdpClient() {
  const [size, setSize] = useState<RitualSize>("25");
  const [plan, setPlan] = useState<RitualPlan>("subscription");
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState(false);
  const { addItem } = useCart();

  const buyBoxTarget = useMountTarget("ritual-buybox");
  const stickyAtcTarget = useMountTarget("ritual-sticky-atc");

  // Reveal the sticky ATC once the buy box has scrolled past (mobile only —
  // the bar is display:none ≥901px in CSS). The original show-on-scroll JS
  // lived in an inline <script>, which is stripped on import, so wire it here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setShown(window.scrollY > 520);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function onAddToCart() {
    if (pending) return;
    // Coerce plan: 10-serving has no subscription Price.
    const planForCart = effectivePlan(size, plan);
    const resolved = resolveRitualSelection(size, planForCart);
    if (!resolved) {
      console.error(
        `[ritual-pdp] Missing Stripe Price ID for ${size}-${planForCart}. Check NEXT_PUBLIC_RITUAL_PRICE_* env vars.`,
      );
      return;
    }
    setPending(true);
    try {
      addItem({
        stripePriceId: resolved.stripePriceId,
        ...resolved.line,
        quantity: 1,
      });
    } finally {
      // addItem is sync; release the pending flag on next tick so the button
      // briefly registers the click but the drawer slide masks any flicker.
      setTimeout(() => setPending(false), 80);
    }
  }

  // Suppress unused-var lint for RITUAL_PRICE_IDS — kept available for any
  // future direct lookups outside resolveRitualSelection.
  void RITUAL_PRICE_IDS;

  const shared: Shared = {
    size,
    plan,
    setSize,
    setPlan,
    onAddToCart,
    pending,
    shown,
  };

  return (
    <>
      {buyBoxTarget && createPortal(<BuyBox {...shared} />, buyBoxTarget)}
      {stickyAtcTarget &&
        createPortal(<StickyAtc {...shared} />, stickyAtcTarget)}
    </>
  );
}
