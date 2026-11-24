"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "components/cart/cart-context";
import { PressBar } from "components/press-bar";
import { itemFromCartLine, itemsValue, track } from "lib/analytics";
import {
  resolveProteinSelection,
  resolveRitualSelection,
} from "lib/cart/price-id-map";
import type { CartLineItem } from "lib/cart/types";
import { duoOfferActive } from "lib/duo-offer";

const RITUAL_HANDLE = "mujo-ritual";
const PROTEIN_HANDLE = "protein-powder";
const HERO = "/images/responsive/lifestyle/ritual-protein-duo-hero-2026-10-1x1";

const TASTES = [
  {
    name: "The Ritual",
    like: "Tastes like a smooth mocha.",
    how: "Peruvian cacao, sweetened with monk fruit. One tablespoon, hot water, milk of choice.",
    img: "/images/responsive/products/ritual/ritual-hero-pour-hot-with-pouch-editorial-2026-09-4x5",
    alt: "Milk being poured into a steaming glass mug of The Ritual, with the pouch beside it",
  },
  {
    name: "Protein Powder",
    like: "Tastes like cookies and cream.",
    how: "Creamy vanilla, never gritty. Two scoops, something cold, a blender.",
    img: "/images/responsive/products/protein-powder/powder-pour-2026-09",
    alt: "A thick vanilla protein shake being poured from a blender into a glass",
  },
  {
    name: "Together",
    like: "An iced mocha under vanilla cold foam.",
    how: "Blend a scoop of Protein Powder with cold milk and pour it over an iced Ritual.",
    img: "/images/responsive/products/protein-powder/powder-iced-ritual-2026-09",
    alt: "Vanilla protein cold foam being poured over an iced Ritual, with both Mujo pouches behind the glass",
  },
];

type Plan = "onetime" | "subscription";

function pairFor(plan: Plan): CartLineItem[] | null {
  const ritual = resolveRitualSelection("25", plan, "4wk");
  const protein = resolveProteinSelection(plan, "4wk");
  if (!ritual || !protein) return null;
  return [
    { stripePriceId: ritual.stripePriceId, ...ritual.line, quantity: 1 },
    { stripePriceId: protein.stripePriceId, ...protein.line, quantity: 1 },
  ];
}

/**
 * /duo — the Daily Ritual Duo. The buttons only fill the normal cart; the
 * checkout applies the offer by itself (lib/duo-offer.ts), so the same price
 * is reached from the product pages too.
 */
export function DuoClient() {
  const { cart, hydrated, setCart } = useCart();
  // Decided after mount: the server render cannot know the visitor's clock.
  const [active, setActive] = useState(true);
  useEffect(() => setActive(duoOfferActive()), []);

  function choose(plan: Plan) {
    const pair = pairFor(plan);
    if (!pair || !hydrated) return;
    // The pair replaces any Ritual or Protein Powder line already in the cart
    // (a leftover subscription line would otherwise turn the one-time duo into
    // a mixed cart, which does not earn the offer). Everything else stays.
    const kept = cart.items.filter(
      (i) =>
        i.productHandle !== RITUAL_HANDLE && i.productHandle !== PROTEIN_HANDLE,
    );
    setCart({ items: [...pair, ...kept], updatedAt: new Date().toISOString() });
    const items = pair.map(itemFromCartLine);
    track("add_to_cart", { items, value: itemsValue(items), currency: "USD" });
    window.dispatchEvent(new CustomEvent("mujo:cart:open"));
  }

  if (!active) {
    return (
      <section className="duo duo-ended">
        <p className="duo-eyebrow">Black Friday 2026</p>
        <h1 className="duo-h1">
          The Daily Ritual Duo has <em>ended.</em>
        </h1>
        <p className="duo-lead">Both are still here, any day of the year.</p>
        <div className="duo-ended-links">
          <Link className="duo-btn" href="/products/mujo-ritual">
            The Ritual
          </Link>
          <Link className="duo-btn" href="/products/protein-powder">
            Protein Powder
          </Link>
        </div>
        <DuoStyles />
      </section>
    );
  }

  return (
    <section className="duo">
      <div className="duo-grid">
        <div className="duo-media">
          <picture>
            <source
              type="image/avif"
              srcSet={`${HERO}-800.avif 800w, ${HERO}-1200.avif 1200w`}
              sizes="(max-width: 860px) 100vw, 560px"
            />
            <img
              src={`${HERO}-800.webp`}
              srcSet={`${HERO}-800.webp 800w, ${HERO}-1200.webp 1200w`}
              sizes="(max-width: 860px) 100vw, 560px"
              alt="The Ritual pouch and the Protein Powder pouch on a wooden table, with an iced Ritual topped with vanilla cold foam in front"
              width={800}
              height={800}
              fetchPriority="high"
            />
          </picture>
        </div>

        <div className="duo-info">
          <p className="duo-eyebrow">Black Friday · until November 30</p>
          <h1 className="duo-h1">
            The Daily Ritual <em>Duo.</em>
          </h1>
          <p className="duo-lead">
            Our mushroom cacao and our new Protein Powder, together for the
            first time.
          </p>

          <p className="duo-price">
            <span className="duo-now">$89</span>
            <s className="duo-was">$105</s>
            <span className="duo-perks">Free frother · Free shipping</span>
          </p>

          <ul className="duo-list">
            <li>
              <span>
                <strong>The Ritual</strong>, 25 servings. Tastes like a smooth
                mocha, with under 5mg of caffeine.
              </span>
              <span className="duo-val">$60</span>
            </li>
            <li>
              <span>
                <strong>Protein Powder</strong>, 15 servings. Tastes like
                cookies and cream, with 22g of protein.
              </span>
              <span className="duo-val">$45</span>
            </li>
            <li>
              <span>
                <strong>Electric frother</strong>, rechargeable.
              </span>
              <span className="duo-val">Free</span>
            </li>
          </ul>

          <button
            type="button"
            className="duo-btn duo-btn-primary"
            onClick={() => choose("onetime")}
          >
            Get the duo for $89
          </button>

          <div className="duo-sub">
            <p>
              <strong>Or subscribe to both.</strong> $69 for your first
              delivery, then $90 every 4 weeks.
            </p>
            <button
              type="button"
              className="duo-btn"
              onClick={() => choose("subscription")}
            >
              Subscribe to both
            </button>
          </div>
        </div>
      </div>

      <div className="duo-taste">
        <h2 className="duo-h2">
          What they <em>taste like</em>
        </h2>
        <ul className="duo-taste-grid">
          {TASTES.map((t) => (
            <li key={t.name}>
              <picture>
                <source
                  type="image/avif"
                  srcSet={`${t.img}-800.avif 800w, ${t.img}-1200.avif 1200w`}
                  sizes="(max-width: 860px) 78vw, 360px"
                />
                <img
                  src={`${t.img}-800.webp`}
                  srcSet={`${t.img}-800.webp 800w, ${t.img}-1200.webp 1200w`}
                  sizes="(max-width: 860px) 78vw, 360px"
                  alt={t.alt}
                  width={800}
                  height={1000}
                  loading="lazy"
                />
              </picture>
              <p className="duo-taste-name">{t.name}</p>
              <p className="duo-taste-like">{t.like}</p>
              <p className="duo-taste-how">{t.how}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="duo-press">
        <PressBar />
      </div>

      <div className="duo-diff">
        <h2 className="duo-h2">
          What makes Mujo <em>different</em>
        </h2>
        <ul className="duo-diff-grid">
          <li>
            <strong>Under 5mg of caffeine</strong>
            <span>
              The Ritual has about a twentieth of the caffeine in a cup of
              coffee.
            </span>
          </li>
          <li>
            <strong>Real mushroom extracts</strong>
            <span>Four of them. Never mycelium on grain.</span>
          </li>
          <li>
            <strong>A complete protein from a leaf</strong>
            <span>
              Lemna leaf protein has all nine essential amino acids on its own.
              22g of protein a serving.
            </span>
          </li>
          <li>
            <strong>No artificial sweeteners</strong>
            <span>
              Both are sweetened with monk fruit. The Protein Powder has 0g of
              sugar.
            </span>
          </li>
        </ul>
      </div>

      <div className="duo-terms">
        <h2>How it works</h2>
        <p>
          <strong>One-time order.</strong> Put The Ritual and the Protein Powder
          in your cart and the pair becomes $89 at checkout, with a free frother
          and free shipping. No code needed.
        </p>
        <p>
          <strong>Subscription.</strong> Subscribe to both and your first
          delivery is $69. Every delivery after that is $90 ($50 for The Ritual
          and $40 for the Protein Powder). Subscribers always ship free, the
          frother comes with your first delivery, and subscriptions have a
          two-delivery minimum.
        </p>
        <p>
          The offer cannot be combined with other codes. It ends on Monday,
          November 30, 2026, at 11:59 pm Pacific time.
        </p>
      </div>
      <DuoStyles />
    </section>
  );
}

function DuoStyles() {
  return (
    <style>{`
      .duo {
        background: var(--cream);
        color: var(--ink);
        font-family: var(--f-body);
        padding: 48px 24px 72px;
      }
      .duo-grid {
        max-width: 1120px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 56px;
        align-items: center;
      }
      .duo-media img {
        display: block;
        width: 100%;
        height: auto;
        border-radius: var(--radius-image);
      }
      .duo-eyebrow {
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent-text);
        margin: 0 0 14px;
      }
      .duo-h1 {
        font-family: var(--f-serif);
        font-weight: 400;
        font-size: clamp(40px, 5.2vw, 60px);
        line-height: 1.02;
        letter-spacing: -0.01em;
        color: var(--brown);
        margin: 0 0 16px;
      }
      .duo-h1 em { font-style: italic; color: var(--accent-display); }
      .duo-lead {
        font-size: 18px;
        line-height: 1.5;
        color: var(--ink-soft);
        margin: 0 0 24px;
        max-width: 30em;
      }
      .duo-price {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 6px 14px;
        margin: 0 0 22px;
      }
      .duo-now {
        font-family: var(--f-display);
        font-size: 44px;
        font-weight: 500;
        letter-spacing: -0.02em;
        color: var(--brown);
      }
      .duo-was { font-size: 20px; color: var(--mute); }
      .duo-perks {
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--accent-text);
      }
      .duo-list {
        list-style: none;
        margin: 0 0 26px;
        padding: 0;
        border-top: 1px solid var(--line);
      }
      .duo-list li {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        padding: 14px 0;
        border-bottom: 1px solid var(--line);
        font-size: 15px;
        line-height: 1.5;
        color: var(--ink-soft);
      }
      .duo-list strong { color: var(--ink); font-weight: 600; }
      .duo-val { color: var(--ink); font-weight: 500; white-space: nowrap; }
      .duo-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 50px;
        padding: 0 28px;
        border-radius: var(--radius-cta);
        border: 1px solid var(--brown);
        background: transparent;
        color: var(--brown);
        font-family: var(--f-body);
        font-size: 15px;
        font-weight: 500;
        text-decoration: none;
        cursor: pointer;
      }
      .duo-btn-primary {
        width: 100%;
        background: var(--brown);
        color: var(--cream);
        font-size: 16px;
        min-height: 56px;
      }
      .duo-btn:hover { opacity: 0.88; }
      .duo-sub {
        margin-top: 22px;
        padding: 20px 22px;
        background: var(--sand);
        border-radius: var(--radius-card);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        flex-wrap: wrap;
      }
      .duo-sub p { margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink-soft); flex: 1 1 220px; }
      .duo-sub strong { color: var(--ink); font-weight: 600; }
      .duo-taste { max-width: 1120px; margin: 72px auto 0; }
      .duo-taste-grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 20px;
      }
      .duo-taste-grid img {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: 4 / 5;
        object-fit: cover;
        border-radius: var(--radius-image);
        margin-bottom: 16px;
      }
      .duo-taste-name {
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent-text);
        margin: 0 0 8px;
      }
      .duo-taste-like {
        font-family: var(--f-serif);
        font-size: 26px;
        line-height: 1.12;
        color: var(--brown);
        margin: 0 0 8px;
      }
      .duo-taste-how { font-size: 14px; line-height: 1.55; color: var(--ink-soft); margin: 0; }
      .duo-press { max-width: 1120px; margin: 56px auto 0; }
      .duo-diff { max-width: 1120px; margin: 56px auto 0; }
      .duo-h2 {
        font-family: var(--f-serif);
        font-weight: 400;
        font-size: clamp(30px, 3.6vw, 42px);
        line-height: 1.05;
        color: var(--brown);
        text-align: center;
        margin: 0 0 30px;
      }
      .duo-h2 em { font-style: italic; color: var(--accent-display); }
      .duo-diff-grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
      }
      .duo-diff-grid li {
        background: var(--sand);
        border-radius: var(--radius-card);
        padding: 22px 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .duo-diff-grid strong { font-size: 17px; font-weight: 600; line-height: 1.25; color: var(--brown); }
      .duo-diff-grid span { font-size: 14px; line-height: 1.55; color: var(--ink-soft); }
      .duo-terms {
        max-width: 760px;
        margin: 56px auto 0;
        padding-top: 28px;
        border-top: 1px solid var(--line);
      }
      .duo-terms h2 {
        font-family: var(--f-mono);
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--mute);
        margin: 0 0 14px;
      }
      .duo-terms p { font-size: 14px; line-height: 1.65; color: var(--ink-soft); margin: 0 0 12px; }
      .duo-terms strong { color: var(--ink); font-weight: 600; }
      .duo-ended { text-align: center; padding: 96px 24px 120px; }
      .duo-ended .duo-lead { margin-left: auto; margin-right: auto; }
      .duo-ended-links { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
      @media (max-width: 860px) {
        .duo { padding: 20px 16px 56px; }
        .duo-grid { grid-template-columns: 1fr; gap: 28px; }
        .duo-sub .duo-btn { width: 100%; }
        .duo-press, .duo-diff { margin-top: 40px; }
        .duo-taste { margin-top: 48px; }
        .duo-taste-grid {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          margin: 0 -16px;
          padding: 0 16px 4px;
          scrollbar-width: none;
        }
        .duo-taste-grid::-webkit-scrollbar { display: none; }
        .duo-taste-grid li { flex: 0 0 78%; scroll-snap-align: center; }
        .duo-taste-like { font-size: 23px; }
        .duo-diff-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
        .duo-diff-grid li { padding: 16px 14px 18px; }
        .duo-diff-grid strong { font-size: 15px; }
      }
    `}</style>
  );
}
