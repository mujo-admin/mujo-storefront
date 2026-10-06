import type { Metadata } from "next";
import { RestoreClient } from "./restore-client";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

/**
 * /cart/restore?i=… — rebuilds a cart from a link in an abandonment email,
 * then sends the shopper to the product page with the cart drawer open.
 * See lib/cart/restore.ts for the link format.
 */
export default function CartRestorePage() {
  return <RestoreClient />;
}
