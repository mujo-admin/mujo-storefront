"use client";

import { useEffect, type ReactNode } from "react";
import { useReveal } from "lib/hooks/use-reveal";
import { useQuizSheet } from "components/MujoQuiz";

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

  useEffect(() => {
    function onClick(ev: MouseEvent) {
      const target = ev.target as HTMLElement | null;
      const trigger = target?.closest<HTMLElement>("[data-mujo-action]");
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
            window.dispatchEvent(new CustomEvent("mujo:cart:open"));
            return;
          }
          const origin = window.location.origin;
          fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              line_items: [
                {
                  stripe_price_id: priceId,
                  quantity: 1,
                  is_subscription: isSubscription,
                },
              ],
              success_url: `${origin}/?checkout=success`,
              cancel_url: window.location.href,
            }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data?.url) window.location.assign(data.url);
            })
            .catch(() => {
              // Swallow; user can retry. /api/checkout failures show in logs.
            });
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
  }, [openQuiz]);

  return <>{children}</>;
}
