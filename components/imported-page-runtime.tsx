"use client";

import { useEffect, type ReactNode } from "react";
import { useReveal } from "lib/hooks/use-reveal";
import { useQuizSheet } from "components/MujoQuiz";
import { useCart } from "components/cart/cart-context";
import { resolvePriceId } from "lib/cart/price-id-map";

type ImportedPageRuntimeProps = {
  children: ReactNode;
};

/**
 * Client wrapper that activates the shared behaviors needed by imported
 * pages: scroll-reveal animations, and event delegation for `data-mujo-*`
 * action hooks (e.g. data-mujo-action="open-cart" / "checkout"). Also
 * strips inline `onclick` no-ops that the import helper already replaced.
 */
export function ImportedPageRuntime({ children }: ImportedPageRuntimeProps) {
  useReveal();
  const { open: openQuiz } = useQuizSheet();
  const { addItem } = useCart();

  useEffect(() => {
    function onClick(ev: MouseEvent) {
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      // Merch PDP interactivity. The source HTMLs ship inline <script> blocks
      // that the loader strips for safety; these handlers restore the four
      // behaviors via event delegation. Each branch is gated on `closest()`
      // so non-merch pages no-op.

      const accordionToggle = target.closest<HTMLElement>(".accordion-toggle");
      if (accordionToggle) {
        accordionToggle.closest(".accordion")?.classList.toggle("open");
        return;
      }

      const swatch = target.closest<HTMLElement>(".color-swatch");
      if (swatch) {
        const optionGroup = swatch.closest(".option-group");
        optionGroup
          ?.querySelectorAll(".color-swatch")
          .forEach((el) => el.classList.remove("active"));
        swatch.classList.add("active");
        const label = optionGroup?.querySelector(".option-label .selected");
        if (label) {
          label.textContent = swatch.getAttribute("title") ?? label.textContent;
        }
        return;
      }

      const pill = target.closest<HTMLElement>(".size-pill");
      if (pill) {
        if (pill.classList.contains("soldout")) return;
        const optionGroup = pill.closest(".option-group");
        optionGroup
          ?.querySelectorAll(".size-pill")
          .forEach((el) => el.classList.remove("active"));
        pill.classList.add("active");
        const label = optionGroup?.querySelector(".option-label .selected");
        if (label && pill.textContent) {
          label.textContent = pill.textContent.trim();
        }
        return;
      }

      const thumb = target.closest<HTMLElement>(".gallery-thumb");
      if (thumb) {
        thumb
          .closest(".gallery-thumbs")
          ?.querySelectorAll(".gallery-thumb")
          .forEach((el) => el.classList.remove("active"));
        thumb.classList.add("active");
        return;
      }

      const trigger = target.closest<HTMLElement>("[data-mujo-action]");
      if (!trigger) return;
      const action = trigger.dataset.mujoAction;
      switch (action) {
        case "open-cart":
          ev.preventDefault();
          window.dispatchEvent(new CustomEvent("mujo:cart:open"));
          break;
        case "open-menu":
          ev.preventDefault();
          window.dispatchEvent(new CustomEvent("mujo:menu:open"));
          break;
        case "close-cart":
        case "close-menu":
        case "close-all":
          ev.preventDefault();
          window.dispatchEvent(new CustomEvent("mujo:overlay:close"));
          break;
        case "open-quiz":
          ev.preventDefault();
          // Compound triggers (mobile menu's "Take the audit") also need the
          // menu drawer to close first. Cheap to dispatch unconditionally.
          window.dispatchEvent(new CustomEvent("mujo:overlay:close"));
          openQuiz();
          break;
        case "checkout": {
          ev.preventDefault();
          const priceId = trigger.dataset.stripePriceId;
          const isSubscription = trigger.dataset.mode === "subscription";
          if (!priceId) {
            // No price attached — just open the drawer (e.g. nav cart icon).
            window.dispatchEvent(new CustomEvent("mujo:cart:open"));
            return;
          }
          const resolved = resolvePriceId(priceId, { isSubscription });
          if (!resolved) {
            // Unknown Price ID. Surface to the console (so we can wire it
            // into price-id-map.ts) and still open the drawer so the click
            // doesn't feel dead.
            console.warn(
              `[imported-page-runtime] Unknown Stripe Price ID ${priceId} — wire it into lib/cart/price-id-map.ts.`,
            );
            window.dispatchEvent(new CustomEvent("mujo:cart:open"));
            return;
          }
          addItem({
            stripePriceId: priceId,
            ...resolved,
            quantity: 1,
          });
          // CartProvider's addItem dispatches mujo:cart:open already; no
          // explicit dispatch needed here.
          break;
        }
        default:
          break;
      }
    }

    document.addEventListener("click", onClick);

    function handleForms(ev: SubmitEvent) {
      const form = ev.target as HTMLFormElement | null;
      if (!form) return;
      const formType = form.dataset.mujoForm;

      if (formType === "generic") {
        ev.preventDefault();
        return;
      }

      if (formType === "rebel-club") {
        ev.preventDefault();
        const data = new FormData(form);
        const email = (data.get("email") || "").toString().trim();
        const tribe = (data.get("tribe") || "").toString().trim();
        if (!email) return;

        const properties: Record<string, string> = {};
        if (tribe) properties.mujo_tribe = tribe;

        // Optimistic UI: replace form with success message immediately.
        const successHtml =
          '<p style="font-family: var(--f-body); font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.92); margin: 0;">' +
          "You're in. First letter lands within 48 hours." +
          "</p>";
        form.outerHTML = successHtml;

        fetch("/api/klaviyo/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            list: "rebel_club",
            source: "Rebel Club signup",
            properties,
          }),
        }).catch((err) => {
          // Failure logs server-side too. We've already shown success client-side
          // (Klaviyo dedup handles repeats; user can resubmit if it never arrives).
          console.warn("[rebel-club] subscribe error", err);
        });
        return;
      }
    }
    document.addEventListener("submit", handleForms);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", handleForms);
    };
  }, [openQuiz, addItem]);

  return <>{children}</>;
}
