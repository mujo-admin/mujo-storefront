import localFont from "next/font/local";
import { Instrument_Serif, DM_Mono } from "next/font/google";

/**
 * General Sans — self-hosted via next/font/local.
 * Source: Fontshare https://www.fontshare.com/fonts/general-sans
 * Weights 300/400/500/600/700 cover all uses in the canonical tokens + brand guide.
 *
 * Self-host eliminates the cross-origin font waterfall that pinned LCP at 4.6-5.7s
 * on first deploy (see outputs/website-migration/lighthouse-pre-cutover.md).
 */
export const generalSans = localFont({
  variable: "--font-general-sans",
  display: "swap",
  preload: true,
  src: [
    { path: "../public/fonts/general-sans/GeneralSans-300.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/general-sans/GeneralSans-400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/general-sans/GeneralSans-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/general-sans/GeneralSans-600.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/general-sans/GeneralSans-700.woff2", weight: "700", style: "normal" },
  ],
});

/**
 * Instrument Serif — italic accent text only (orange `<em class="accent">`).
 * Not LCP-critical; Google Fonts CDN with display=swap is fine.
 */
export const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

/**
 * DM Mono — eyebrow labels + captions + footer copy.
 * Not LCP-critical; Google Fonts CDN with display=swap is fine.
 */
export const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});
