"use client";

import { useEffect, useState } from "react";

type Props = {
  sessionId: string;
  invoiceId: string | null;
};

const POLL_MS = 2000;
const MAX_TRIES = 15;

/**
 * Shows "Order #140501" once the Stripe webhook has created the Shopify order.
 * That happens a few seconds after the customer lands here, so we poll our own
 * database for it. Renders nothing until the number exists, and nothing if it
 * has not appeared after ~30 seconds — the confirmation email carries it.
 */
export function OrderNumber({ sessionId, invoiceId }: Props) {
  const [orderName, setOrderName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const query = new URLSearchParams({ session_id: sessionId });
    if (invoiceId) query.set("invoice_id", invoiceId);

    const poll = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/order-status?${query.toString()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { orderName: string | null };
          if (data.orderName) {
            if (!cancelled) setOrderName(data.orderName);
            return;
          }
        }
      } catch {
        // transient — try again
      }
      if (!cancelled && tries < MAX_TRIES) timer = setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, invoiceId]);

  if (!orderName) return null;
  return <p className="success-order">Order {orderName}</p>;
}
