import { CartProvider } from "components/cart/cart-context";
import { SiteHeader } from "components/layout/site-header";
import { Footer } from "components/layout/footer";
import { AnalyticsScripts } from "components/integrations/analytics-scripts";
import { generalSans, instrumentSerif, dmMono } from "app/fonts";
import { getCart } from "lib/shopify";
import { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import { baseUrl } from "lib/utils";

const { SITE_NAME } = process.env;

export const metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: SITE_NAME!,
    template: `%s | ${SITE_NAME}`,
  },
  robots: {
    follow: true,
    index: true,
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Don't await the fetch, pass the Promise to the context provider
  const cart = getCart();

  const fontVariables = `${generalSans.variable} ${instrumentSerif.variable} ${dmMono.variable}`;

  return (
    <html lang="en" className={fontVariables}>
      <body>
        <CartProvider cartPromise={cart}>
          <SiteHeader />
          <main>{children}</main>
          <Footer />
          <Toaster closeButton />
        </CartProvider>
        <AnalyticsScripts />
      </body>
    </html>
  );
}
