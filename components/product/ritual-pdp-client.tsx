"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  RITUAL_PRICE_IDS,
  type RitualSize,
  type RitualPlan,
  type RitualCadence,
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
    subscription: { now: "$55.25", was: "$65.00", daily: "$2.21/serving" },
  },
};

function effectivePlan(size: RitualSize, plan: RitualPlan): RitualPlan {
  // 10-serving has no subscription Price — coerce to one-time.
  return size === "10" ? "onetime" : plan;
}

// Scale a displayed "$NN.NN" total by quantity. Per-serving (daily) prices are
// NOT scaled — they stay per serving. Returns "$NN.NN".
function scalePrice(price: string, qty: number): string {
  const n = parseFloat(price.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return price;
  return `$${(n * qty).toFixed(2)}`;
}

function formatStickyLine(
  size: RitualSize,
  plan: RitualPlan,
  qty: number,
): string {
  const resolvedPlan = effectivePlan(size, plan);
  const cell = PRICES[size][resolvedPlan];
  // Quantity only applies to the 25-serving bag.
  const displayQty = size === "25" ? qty : 1;
  const price = cell?.now ? scalePrice(cell.now, displayQty) : "";
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
  qty: 1 | 2;
  cadence: RitualCadence;
  setSize: (s: RitualSize) => void;
  setPlan: (p: RitualPlan) => void;
  setQty: (q: 1 | 2) => void;
  setCadence: (c: RitualCadence) => void;
  onAddToCart: () => void;
  pending: boolean;
  /** Sticky ATC reveal state (mobile, shown after scrolling past the buy box). */
  shown: boolean;
};

function BuyBox({
  size,
  plan,
  qty,
  cadence,
  setSize,
  setPlan,
  setQty,
  setCadence,
  onAddToCart,
  pending,
}: Shared) {
  const sub = PRICES[size].subscription;
  const once = PRICES[size].onetime!; // every size has a one-time Price
  const resolvedPlan = effectivePlan(size, plan);
  const showSubscribe = size === "25" && sub !== undefined;
  // Quantity (1 bag / 2 bags = "The Ritual Duo") applies to the 25-serving bag
  // on both one-time and subscribe. The 10-serving bag stays single.
  const showQuantity = size === "25";
  const isSubscribe = resolvedPlan === "subscription";
  // Only offer the 8-week cadence once its Stripe Price ID is configured
  // (NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_8W). Pre-cutover / pre-env this is
  // empty, so the cadence toggle hides and every subscription stays 4-week —
  // no dead "Add to cart" on an unresolvable 8-week selection. Appears
  // automatically once the env var lands at cutover.
  const has8wk = Boolean(RITUAL_PRICE_IDS["25-subscription-8wk"]);
  // Quantity scales the displayed totals (per-serving stays per serving).
  // Only the 25-serving bag has a quantity selector.
  const displayQty = size === "25" ? qty : 1;

  // The subscribe box's combined quantity × cadence options. The 8-week pair
  // only appears once its Stripe Price ID is configured (pre-env it's empty).
  const subCombos: { qty: 1 | 2; cadence: RitualCadence }[] = [
    { qty: 1, cadence: "4wk" },
    { qty: 2, cadence: "4wk" },
    ...(has8wk
      ? ([
          { qty: 1, cadence: "8wk" },
          { qty: 2, cadence: "8wk" },
        ] as { qty: 1 | 2; cadence: RitualCadence }[])
      : []),
  ];
  const pouchLabel = (q: number) => (q === 1 ? "1 pouch" : "2 pouches");
  const cadenceLabel = (c: RitualCadence) =>
    c === "8wk" ? "every 8 weeks" : "every 4 weeks";
  const selectSub = (q: 1 | 2, c: RitualCadence) => {
    setPlan("subscription");
    setQty(q);
    setCadence(c);
  };
  const selectOnce = (q: 1 | 2) => {
    setPlan("onetime");
    setQty(q);
  };

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
              className={`pur-opt${isSubscribe ? " active" : ""}`}
              style={{ display: "block" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  cursor: "pointer",
                }}
                onClick={() => setPlan("subscription")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  setPlan("subscription")
                }
              >
                <div className="pur-opt-radio" />
                <div className="pur-opt-info" style={{ flex: 1 }}>
                  <div className="pur-opt-name">
                    Subscribe &amp; save{" "}
                    <span className="pur-opt-save">Save 15%</span>
                  </div>
                  <div
                    className="pur-opt-desc"
                    style={{ color: "var(--orange-deep)", marginTop: 2 }}
                  >
                    Free shipping · free frother on your first order
                  </div>
                </div>
                {!isSubscribe && (
                  <div className="pur-opt-price">
                    <div className="pur-opt-price-now">
                      {scalePrice(sub.now, qty)}
                    </div>
                    <div className="pur-opt-price-was">
                      {sub.was ? scalePrice(sub.was, qty) : ""}
                    </div>
                  </div>
                )}
              </div>
              {isSubscribe && (
                <div style={{ marginTop: 12 }}>
                  <div className="size-options">
                    {subCombos.map((c) => {
                      const active = qty === c.qty && cadence === c.cadence;
                      return (
                        <div
                          key={`${c.qty}-${c.cadence}`}
                          className={`size-opt${active ? " active" : ""}`}
                          onClick={() => selectSub(c.qty, c.cadence)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) =>
                            (e.key === "Enter" || e.key === " ") &&
                            selectSub(c.qty, c.cadence)
                          }
                        >
                          <div className="size-opt-top">
                            <div className="size-opt-count">
                              {pouchLabel(c.qty)}
                            </div>
                          </div>
                          <div className="size-opt-sub">
                            {cadenceLabel(c.cadence)}
                          </div>
                          <div className="size-opt-price">
                            {scalePrice(sub.now, c.qty)} · {sub.daily}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="pur-opt-desc"
                    style={{ marginTop: 8, color: "var(--mute)" }}
                  >
                    2-cycle minimum
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            className={`pur-opt${resolvedPlan === "onetime" ? " active" : ""}`}
            style={{ display: "block" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                cursor: "pointer",
              }}
              onClick={() => setPlan("onetime")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && setPlan("onetime")
              }
            >
              <div className="pur-opt-radio" />
              <div className="pur-opt-info" style={{ flex: 1 }}>
                <div className="pur-opt-name">One-time purchase</div>
              </div>
              {!(resolvedPlan === "onetime" && showQuantity) && (
                <div className="pur-opt-price">
                  <div className="pur-opt-price-now">
                    {scalePrice(
                      once.now,
                      resolvedPlan === "onetime" ? displayQty : 1,
                    )}
                  </div>
                  <div className="pur-opt-daily">{once.daily}</div>
                </div>
              )}
            </div>
            {resolvedPlan === "onetime" && showQuantity && (
              <div style={{ marginTop: 12 }}>
                <div className="size-options">
                  {([1, 2] as const).map((q) => (
                    <div
                      key={q}
                      className={`size-opt${qty === q ? " active" : ""}`}
                      onClick={() => selectOnce(q)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") && selectOnce(q)
                      }
                    >
                      <div className="size-opt-top">
                        <div className="size-opt-count">{pouchLabel(q)}</div>
                      </div>
                      <div className="size-opt-price">
                        {scalePrice(once.now, q)} · {once.daily}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            {isSubscribe
              ? "Free shipping + free frother (first order)"
              : "Free shipping over $100"}
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

function StickyAtc({ size, plan, qty, onAddToCart, pending, shown }: Shared) {
  return (
    <div className={`sticky-atc${shown ? " show" : ""}`} id="stickyATC">
      <div className="sticky-atc-info">
        <div className="sticky-atc-name">Mujo Ritual · {size} servings</div>
        <div className="sticky-atc-price" id="stickyATCPrice">
          {formatStickyLine(size, plan, qty)}
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
  const [qty, setQty] = useState<1 | 2>(1);
  const [cadence, setCadence] = useState<RitualCadence>("4wk");
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

  // Drive the imported-HTML gallery off the selected size: 10 servings shows the
  // 10-serving bag, 25 servings the default hero. The gallery lives in the
  // dangerouslySetInnerHTML'd markup (plain DOM), so reach it directly. Clearing
  // srcset/sizes is essential — the main <img> ships a srcset that otherwise
  // overrides .src (same gotcha the runtime thumb handler fixes).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base =
      size === "10"
        ? "ritual-pouch-10-serving-hero-monumental-editorial-1x1"
        : "ritual-pouch-hero-monumental-editorial-1x1";
    const full = `/images/responsive/products/ritual/${base}-1200.webp`;
    const mainImg =
      document.querySelector<HTMLImageElement>(".gallery-main-img");
    if (mainImg) {
      mainImg.src = full;
      mainImg.removeAttribute("srcset");
      mainImg.removeAttribute("sizes");
    }
    // Sync the active thumbnail to the size's hero, if present.
    const thumbs =
      document.querySelectorAll<HTMLElement>(".gallery-thumb[data-full]");
    let matched = false;
    thumbs.forEach((t) => {
      const isMatch = (t.dataset.full ?? "").includes(`${base}-`);
      if (isMatch && !matched) {
        thumbs.forEach((o) => o.classList.remove("active"));
        t.classList.add("active");
        matched = true;
      }
    });
  }, [size]);

  function onAddToCart() {
    if (pending) return;
    // Coerce plan: 10-serving has no subscription Price.
    const planForCart = effectivePlan(size, plan);
    const resolved = resolveRitualSelection(size, planForCart, cadence);
    if (!resolved) {
      console.error(
        `[ritual-pdp] Missing Stripe Price ID for ${size}-${planForCart} (${cadence}). Check NEXT_PUBLIC_RITUAL_PRICE_* env vars.`,
      );
      return;
    }
    // Quantity applies to the 25-serving bag (1 / 2 = "The Ritual Duo") on both
    // one-time and subscribe. The 10-serving bag is always single.
    const quantity = size === "25" ? qty : 1;
    setPending(true);
    try {
      addItem({
        stripePriceId: resolved.stripePriceId,
        ...resolved.line,
        quantity,
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
    qty,
    cadence,
    setSize,
    setPlan,
    setQty,
    setCadence,
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
