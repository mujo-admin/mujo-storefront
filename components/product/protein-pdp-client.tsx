"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PROTEIN_PRICE_IDS, type ProteinCadence } from "lib/stripe-constants";
import { useCart } from "components/cart/cart-context";
import { resolveProteinSelection } from "lib/cart/price-id-map";

type ProteinPlan = "onetime" | "subscription";

const PRICES: Record<ProteinPlan, { now: string; was?: string; daily: string }> = {
  onetime: { now: "$45", daily: "$3.00/serving · 13.6¢/g protein" },
  subscription: { now: "$40", was: "$45", daily: "$2.67/serving · 12.1¢/g protein" },
};

const SUB_BENEFITS = [
  "Free shipping",
  "Save $5 on every order",
  "Minimum 2-order commitment",
  "Cancel or pause anytime after 2 orders",
];

const CADENCE_LABELS: Record<ProteinCadence, string> = {
  "2wk": "2 weeks",
  "4wk": "4 weeks",
  "6wk": "6 weeks",
  "8wk": "8 weeks",
};
const AVAILABLE_CADENCES: ProteinCadence[] = (["4wk", "8wk"] as const).filter(
  (c) => c === "4wk" || Boolean(PROTEIN_PRICE_IDS[`sub-${c}`]),
);
const HAS_SUBSCRIPTION = AVAILABLE_CADENCES.length > 0 && Boolean(PROTEIN_PRICE_IDS["sub-4wk"]);

type Shared = {
  plan: ProteinPlan;
  cadence: ProteinCadence;
  setPlan: (p: ProteinPlan) => void;
  setCadence: (c: ProteinCadence) => void;
  onAddToCart: () => void;
  pending: boolean;
  shown: boolean;
};

function BenefitItem({ children }: { children: ReactNode }) {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, lineHeight: 1.4, color: "var(--ink-soft)" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function BuyBox({ plan, cadence, setPlan, setCadence, onAddToCart, pending }: Shared) {
  const sub = PRICES.subscription;
  const once = PRICES.onetime;
  const isSubscribe = HAS_SUBSCRIPTION && plan === "subscription";

  return (
    <>
      <div className="size-line">
        <strong>450g pouch</strong> · 15 servings
      </div>

      <div className="purchase-block">
        <div className="purchase-label">{HAS_SUBSCRIPTION ? "Choose your plan" : "Purchase"}</div>
        <div className="purchase-options">
          {HAS_SUBSCRIPTION && (
            <div className={`pur-opt${isSubscribe ? " active" : ""}`} style={{ display: "block" }}>
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}
                onClick={() => setPlan("subscription")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPlan("subscription")}
              >
                <div className="pur-opt-radio" />
                <div className="pur-opt-info" style={{ flex: 1 }}>
                  <div className="pur-opt-name">
                    Subscribe &amp; save <span className="pur-opt-save">Save $5</span>
                  </div>
                </div>
                <div className="pur-opt-price">
                  <div className="pur-opt-price-now">{sub.now}</div>
                  <div className="pur-opt-price-was">{sub.was}</div>
                  <div className="pur-opt-daily">{sub.daily}</div>
                </div>
              </div>
              {isSubscribe && (
                <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 6 }}>
                  {AVAILABLE_CADENCES.length > 1 && (
                    <BenefitItem>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        Ships every
                        <select
                          value={cadence}
                          onChange={(e) => setCadence(e.target.value as ProteinCadence)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Delivery frequency"
                          style={{
                            font: "inherit",
                            fontWeight: 600,
                            color: "var(--ink)",
                            background: "transparent",
                            border: "1px solid var(--line, rgba(26,26,26,0.18))",
                            borderRadius: 6,
                            padding: "2px 24px 2px 8px",
                            cursor: "pointer",
                          }}
                        >
                          {AVAILABLE_CADENCES.map((c) => (
                            <option key={c} value={c}>{CADENCE_LABELS[c]}</option>
                          ))}
                        </select>
                      </span>
                    </BenefitItem>
                  )}
                  {SUB_BENEFITS.map((b) => (
                    <BenefitItem key={b}>{b}</BenefitItem>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div
            className={`pur-opt${!isSubscribe ? " active" : ""}`}
            onClick={() => setPlan("onetime")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPlan("onetime")}
          >
            <div className="pur-opt-radio" />
            <div className="pur-opt-info">
              <div className="pur-opt-name">One-time purchase</div>
              <div className="pur-opt-desc">{once.daily}</div>
            </div>
            <div className="pur-opt-price">
              <div className="pur-opt-price-now">{once.now}</div>
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
          {pending ? "Adding…" : "Add to cart"}
        </button>
        <div className="atc-trust">
          <div className="atc-trust-item" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 5h13v11H1z" /><path d="M14 9h4l3 3v4h-7z" /><circle cx="5.5" cy="18.5" r="1.6" /><circle cx="17.5" cy="18.5" r="1.6" />
            </svg>
            {isSubscribe ? "Free shipping" : "Free shipping over $100"}
          </div>
          <div className="atc-trust-item" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="9" r="6" /><path d="M9.5 9l1.8 1.8L15 7.2" /><path d="M8.6 14.2L7 22l5-2.8L17 22l-1.6-7.8" />
            </svg>
            30-day money back
          </div>
        </div>
      </div>
    </>
  );
}

function StickyAtc({ plan, onAddToCart, pending, shown }: Shared) {
  const isSubscribe = HAS_SUBSCRIPTION && plan === "subscription";
  const price = isSubscribe ? PRICES.subscription.now : PRICES.onetime.now;
  const tail = isSubscribe ? "Subscribe" : "One-time";
  return (
    <div className={`sticky-atc${shown ? " show" : ""}`}>
      <div className="sticky-atc-info">
        <div className="sticky-atc-name">Protein Powder · Vanilla Bean</div>
        <div className="sticky-atc-price">{price} · {tail}</div>
      </div>
      <button
        type="button"
        className="sticky-atc-btn"
        onClick={onAddToCart}
        disabled={pending}
        aria-busy={pending}
      >
        Add to cart
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

export function ProteinSelectionProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<ProteinPlan>(HAS_SUBSCRIPTION ? "subscription" : "onetime");
  const [cadence, setCadence] = useState<ProteinCadence>("4wk");
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
    const resolvedPlan = HAS_SUBSCRIPTION ? plan : "onetime";
    const resolved = resolveProteinSelection(resolvedPlan, resolvedPlan === "subscription" ? cadence : "4wk");
    if (!resolved) {
      console.error("[protein-pdp] Missing Stripe Price ID. Check NEXT_PUBLIC_PROTEIN_PRICE_* env vars.");
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
  return <ProteinContext.Provider value={shared}>{children}</ProteinContext.Provider>;
}

export function ProteinBuyBoxSlot() {
  return <BuyBox {...useProtein()} />;
}

export function ProteinStickyAtcSlot() {
  return <StickyAtc {...useProtein()} />;
}
