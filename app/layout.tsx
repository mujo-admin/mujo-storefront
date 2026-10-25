import { CartProvider } from "components/cart/cart-context";
import { SiteHeader } from "components/layout/site-header";
import { Footer } from "components/layout/footer";
import { AnalyticsScripts } from "components/integrations/analytics-scripts";
import { RouteAnalytics } from "components/integrations/route-analytics";
import { CookieConsent } from "components/integrations/cookie-consent";
import { KlaviyoIdentify } from "components/integrations/klaviyo-identify";
import { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import { hanken } from "./fonts";
import { getSession } from "lib/session";
import { baseUrl } from "lib/utils";

const SITE_NAME = "Mujo";

export const metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: SITE_NAME,
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
  const session = await getSession();
  const sessionSnapshot = session
    ? { customerId: session.customerId, email: session.email }
    : null;

  return (
    <html lang="en" className={hanken.variable}>
      <head>
        {/*
          Fonts: Hanken Grotesk via next/font/google (app/fonts.ts). Instrument
          Serif + DM Mono are self-hosted (@font-face in app/globals.css);
          Instrument Serif regular is preloaded because every h1/h2 uses it.
        */}
        <link
          rel="preload"
          href="/fonts/instrument-serif/instrument-serif-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <CartProvider session={sessionSnapshot}>
          <SiteHeader />
          <main>{children}</main>
          <Footer />
          <Toaster closeButton />
        </CartProvider>
        <AnalyticsScripts />
        <RouteAnalytics />
        <KlaviyoIdentify email={sessionSnapshot?.email ?? null} />
        <CookieConsent />
      </body>
    </html>
  );
}
