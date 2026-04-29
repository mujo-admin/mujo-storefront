"use client";

import { useEffect, type ReactNode } from "react";
import { useReveal } from "lib/hooks/use-reveal";

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

    function blockNoopForms(ev: SubmitEvent) {
      const form = ev.target as HTMLFormElement | null;
      if (form?.dataset.mujoForm === "generic") {
        ev.preventDefault();
      }
    }
    document.addEventListener("submit", blockNoopForms);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", blockNoopForms);
    };
  }, []);

  return <>{children}</>;
}
