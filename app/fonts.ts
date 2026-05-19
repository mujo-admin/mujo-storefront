import localFont from "next/font/local";

/*
  General Sans — self-hosted via next/font/local.
  Auto-emits @font-face + preload tags + a stable CSS variable (--font-general-sans)
  that tokens.css consumes from --f-display and --f-body.

  Source files live at public/fonts/general-sans/GeneralSans-{300..700}.woff2.
  Five weights covers display headlines (700), section headers (600/500),
  body (400), and the rare light-display moments (300).
*/
export const generalSans = localFont({
  src: [
    {
      path: "../public/fonts/general-sans/GeneralSans-300.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/general-sans/GeneralSans-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/general-sans/GeneralSans-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/general-sans/GeneralSans-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/general-sans/GeneralSans-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-general-sans",
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
