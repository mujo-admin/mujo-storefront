"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  type ProteinCadence,
  PROTEIN_PREORDER_SHIP_LABEL,
} from "lib/stripe-constants";
import { useCart } from "components/cart/cart-context";
import { resolveProteinSelection } from "lib/cart/price-id-map";

// Protein Powder buy box (pre-order). Mirrors ritual-pdp-client.tsx, but single
// size and cadence 2/4/6/8 weeks. The markup and class names match the static
// design buy box in content/imported-html/mujo_protein_powder_pdp.html, whose
// CSS styles it. Subscribers save their card now and are first charged on ship
// day (trial_end is set server-side in /api/checkout-session).
type Plan = "onetime" | "subscription";

const PRICES: Record<Plan, { now: string; was?: string; daily: string }> = {
  subscription: { now: "$38.25", was: "$45.00", daily: "$2.55/serving · 11.6¢/g protein" },
  onetime: { now: "$45.00", daily: "$3.00/serving · 13.6¢/g protein" },
};

const SUB_BENEFITS = [
  "Save 15% on every order",
  "Free shipping, no minimum",
  `Card saved today, first charged when it ships on ${PROTEIN_PREORDER_SHIP_LABEL}`,
  "Skip, change or cancel after 2 deliveries",
];

const CADENCES: { value: ProteinCadence; label: string }[] = [
  { value: "2wk", label: "2 weeks" },
  { value: "4wk", label: "4 weeks" },
  { value: "6wk", label: "6 weeks" },
  { value: "8wk", label: "8 weeks" },
];

function useMountTarget(mountId: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.querySelector<HTMLElement>(`[data-mujo-mount="${mountId}"]`));
  }, [mountId]);
  return el;
}

type Shared = {
  plan: Plan;
  cadence: ProteinCadence;
  setPlan: (p: Plan) => void;
  setCadence: (c: ProteinCadence) => void;
  onAddToCart: () => void;
  pending: boolean;
  shown: boolean;
};

function activate(e: React.KeyboardEvent, fn: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
}

function BuyBox({ plan, cadence, setPlan, setCadence, onAddToCart, pending }: Shared) {
  const isSub = plan === "subscription";
  return (
    <>
      <div className="size-line">
        <strong>450g pouch</strong> · 15 servings
      </div>

      <div className="purchase-block">
        <div className="purchase-label">Choose your plan</div>
        <div className="purchase-options">
          <div
            className={`pur-opt${isSub ? " active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setPlan("subscription")}
            onKeyDown={(e) => activate(e, () => setPlan("subscription"))}
          >
            <div className="pur-opt-radio" />
            <div className="pur-opt-info">
              <div className="pur-opt-name">
                Subscribe &amp; save <span className="pur-opt-save">Save 15%</span>
              </div>
              <div className="pur-opt-cadence">
                <label htmlFor="proteinCadence">Ships every</label>
                <select
                  id="proteinCadence"
                  aria-label="Delivery frequency"
                  value={cadence}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setCadence(e.target.value as ProteinCadence)}
                >
                  {CADENCES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pur-opt-price">
              <div className="pur-opt-price-now">{PRICES.subscription.now}</div>
              <div className="pur-opt-price-was">{PRICES.subscription.was}</div>
              <div className="pur-opt-daily">{PRICES.subscription.daily}</div>
            </div>
          </div>

          <div
            className={`pur-opt${!isSub ? " active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setPlan("onetime")}
            onKeyDown={(e) => activate(e, () => setPlan("onetime"))}
          >
            <div className="pur-opt-radio" />
            <div className="pur-opt-info">
              <div className="pur-opt-name">One-time purchase</div>
              <div className="pur-opt-desc">No commitment</div>
            </div>
            <div className="pur-opt-price">
              <div className="pur-opt-price-now">{PRICES.onetime.now}</div>
              <div className="pur-opt-daily">{PRICES.onetime.daily}</div>
            </div>
          </div>
        </div>
        <ul className={`sub-benefits${isSub ? "" : " hide"}`}>
          {SUB_BENEFITS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
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
          <span className="atc-btn-price">{PRICES[plan].now}</span>
        </button>
        <div className="atc-shipline">Ships by {PROTEIN_PREORDER_SHIP_LABEL}</div>
      </div>
    </>
  );
}

function StickyAtc({ plan, onAddToCart, pending, shown }: Shared) {
  const line =
    plan === "subscription"
      ? `Subscribe · ${PRICES.subscription.now} · ships free`
      : `One-time · ${PRICES.onetime.now}`;
  return (
    <div className={`sticky-atc${shown ? " show" : ""}`}>
      <div className="sticky-atc-info">
        <div className="sticky-atc-name">Protein Powder · Vanilla Bean</div>
        <div className="sticky-atc-price">{line}</div>
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

/**
 * Top-level client component for the Protein Powder PDP. Portals the buy box
 * and the mobile sticky bar into the markers left by the import splices, and
 * adds one pouch of the chosen Price to the cart (quantity is changed in the
 * cart drawer).
 */
export function ProteinPdpClient() {
  const [plan, setPlan] = useState<Plan>("subscription");
  const [cadence, setCadence] = useState<ProteinCadence>("4wk");
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState(false);
  const { addItem } = useCart();

  const buyBoxTarget = useMountTarget("protein-buybox");
  const stickyTarget = useMountTarget("protein-sticky-atc");

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 520);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function onAddToCart() {
    if (pending) return;
    const resolved = resolveProteinSelection(plan, cadence);
    if (!resolved) {
      console.error(
        `[protein-pdp] Missing Stripe Price ID for ${plan}/${cadence}. Check NEXT_PUBLIC_PROTEIN_PRICE_* env vars.`,
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

  const shared: Shared = { plan, cadence, setPlan, setCadence, onAddToCart, pending, shown };
  return (
    <>
      {buyBoxTarget && createPortal(<BuyBox {...shared} />, buyBoxTarget)}
      {stickyTarget && createPortal(<StickyAtc {...shared} />, stickyTarget)}
    </>
  );
}
