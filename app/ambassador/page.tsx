import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import type { Splice } from "lib/imported-html";
import { AmbassadorForm } from "components/forms/ambassador-form";

// Splice the dead Tally "Apply now" button out of the apply section, leaving a
// mount marker that <AmbassadorForm /> targets via createPortal.
const AMBASSADOR_SPLICES: Splice[] = [
  {
    startSentinel: "MUJO_AMBASSADOR_FORM_START",
    endSentinel: "MUJO_AMBASSADOR_FORM_END",
    mountId: "ambassador-form",
  },
];

export const metadata: Metadata = {
  title: "Ambassador · Partner with Mujo",
  description:
    "Apply to become a Mujo Ambassador. Real partnerships. No discount-code spam.",
  alternates: { canonical: "/ambassador" },
};

/**
 * /ambassador route ports `mujo_affiliate.html`.
 * Inline patches per W3 plan (Resolved decision #4):
 *   - "Affiliate" → "Ambassador" (public-facing only; FTC link kept verbatim)
 *   - Inter Tight → Hanken Grotesk (typography drift)
 *   - --mute #7A7570 → #5C5854 (WCAG-corrected)
 * Patches are applied via the override <style> below; ImportedPage renders
 * the source markup unchanged, this style block wins via specificity + load order.
 */
const AMBASSADOR_OVERRIDES = `
  /* Patch font drift — Inter Tight → Hanken Grotesk */
  body, .mujo-imported, .mujo-imported * {
    font-family: var(--f-body) !important;
  }
  .mujo-imported h1, .mujo-imported h2, .mujo-imported h3, .mujo-imported h4 {
    font-family: var(--f-display) !important;
  }
  /* Patch mute color drift — #7A7570 → #5C5854 (WCAG correction) */
  .mujo-imported [style*="7A7570"],
  .mujo-imported [style*="#7a7570"] {
    color: #5C5854 !important;
  }
`;

export default function AmbassadorPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: AMBASSADOR_OVERRIDES }} />
      <ImportedPage filename="mujo_affiliate.html" splices={AMBASSADOR_SPLICES} />
      <AmbassadorForm />
    </>
  );
}
