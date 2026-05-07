import { CartProvider } from "components/cart/cart-context";
import { SiteHeader } from "components/layout/site-header";
import { Footer } from "components/layout/footer";
import { AnalyticsScripts } from "components/integrations/analytics-scripts";
import { QuizProvider, QuizPill, QuizSheet } from "components/MujoQuiz";
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

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/*
          General Sans is self-hosted via @font-face in tokens.css with
          font-display: swap. No preload needed — same-origin fonts get
          prioritized automatically once CSS parses; explicit preload caused
          double-fetches that hurt perf.

          Instrument Serif (italic accent) + DM Mono (eyebrow / footer) come
          from Google Fonts via <link> — not LCP-critical.
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
        <CartProvider>
          <QuizProvider>
            <SiteHeader />
            <main>{children}</main>
            <Footer />
            <Toaster closeButton />
            <QuizPill />
            <QuizSheet />
          </QuizProvider>
        </CartProvider>
        <AnalyticsScripts />
      </body>
    </html>
  );
}
