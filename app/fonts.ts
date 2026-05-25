import { Hanken_Grotesk } from "next/font/google";

/*
  Hanken Grotesk — loaded via next/font/google (Brand Guide v1.3; replaced the
  prior self-hosted display font). Exposes a stable CSS variable (--font-hanken) that
  tokens.css consumes from --f-display and --f-body.

  Weights: 300 / 400 / 500 / 600, plus 300 + 400 italic. Nothing at 700+ —
  heavier weights are unused and only cost load time (matters for the Lemna
  landing pages). Headings unify on 500; 600 survives only for small UI emphasis.
*/
export const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-hanken",
  display: "swap",
  preload: true,
  fallback: [
    "-apple-system",
    "Segoe UI",
    "Helvetica Neue",
    "Helvetica",
    "Arial",
    "sans-serif",
  ],
});
