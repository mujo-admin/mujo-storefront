# Tracking v2 test script

Run on a preview link first, then once on mujoworld.com at a quiet hour.
Contract: `docs/measurement-plan.md`.

**Before you start**

- Use a normal browser window in private mode. Klaviyo ignores automated
  browsers, so headless tests show GA4 and Meta but never Klaviyo.
- Klaviyo needs a secure (https) address to identify a visitor. It does not work
  on `http://localhost`.
- Previews use the Stripe sandbox and cannot receive Stripe webhooks, so steps 7
  to 9 are checked with `scripts/replay-stripe-event.ts --print-analytics` on a
  preview and for real only on production.
- Have open: GA4 DebugView, Meta Events Manager → Test Events, and the Klaviyo
  profile for your test address.

| #   | Do                                                                                                        | Expect                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open the site with `?utm_source=test&utm_medium=cpc&utm_campaign=trackingv2&fbclid=TEST123`               | Cookie `mujo_attr` holds those values                                                                                                                                                                             |
| 2   | Sign up in the footer with a test address                                                                 | Klaviyo: profile exists and shows "Active on Site"                                                                                                                                                                |
| 3   | Open `/shop`, click The Ritual                                                                            | GA4: `view_item_list`, `select_item`, then `view_item` with `item_id: the-ritual`. Meta: one ViewContent with `content_ids: ["the-ritual"]`. Klaviyo: "Viewed Product"                                            |
| 4   | Add a subscription to the cart                                                                            | GA4 `add_to_cart` with `purchase_type: subscription`. Klaviyo "Added to Cart" with `CheckoutURL`. Open that link in another private window: the cart is rebuilt                                                   |
| 5   | Remove it, add it again                                                                                   | GA4 `remove_from_cart`, then `add_to_cart`                                                                                                                                                                        |
| 6   | Go to checkout                                                                                            | GA4 `begin_checkout` once. Klaviyo "Started Checkout" once. Stripe Dashboard → the session → metadata shows `fbp`, `fbc`, `ga_client_id`, `attr_utm_*`, `restore`                                                 |
| 7   | Sign in as a customer, start a checkout, close the tab. Wait an hour (sandbox: expire the session by API) | Klaviyo "Checkout Abandoned" on that profile, once, with a working `CheckoutURL`                                                                                                                                  |
| 8   | New session, pay                                                                                          | GA4 `purchase` with items, tax and shipping. Meta: one Purchase, with fbp / fbc in its matched parameters. Klaviyo "Order Placed" with real product names and `UTMSource: test`. Shopify order mirrored as before |
| 9   | Repeat 8 with a one-time merch order and a mixed cart                                                     | Same, with the right products. The free frother is never listed                                                                                                                                                   |
| 10  | Fresh private window, choose "No thanks" on the cookie bar, repeat 1 to 6                                 | No `mujo_attr` cookie, no Klaviyo requests, no attribution in the session metadata                                                                                                                                |

**Automated checks**

```
pnpm build
pnpm test:identity
pnpm tsx scripts/validate-feed.ts            # production
pnpm tsx scripts/validate-feed.ts <preview>  # a preview
```
