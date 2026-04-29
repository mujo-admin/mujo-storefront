import { CartProvider } from "components/cart/cart-context";
import { SiteHeader } from "components/layout/site-header";
import { Footer } from "components/layout/footer";
import { AnalyticsScripts } from "components/integrations/analytics-scripts";
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

  return (
    <html lang="en">
      <head>
        {/*
          Preload the LCP-critical General Sans weights (400 + 500 cover the
          vast majority of body + UI text). The other weights load lazily as
          the browser encounters them.
        */}
        <link
          rel="preload"
          href="/fonts/general-sans/GeneralSans-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/general-sans/GeneralSans-500.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/*
          Instrument Serif (italic accent) + DM Mono (eyebrow / footer) — Google
          CDN with display=swap. Not LCP-critical so we don't preload them.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
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
