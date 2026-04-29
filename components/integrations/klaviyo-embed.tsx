"use client";

type KlaviyoEmbedProps = {
  formId: string;
  className?: string;
};

/**
 * <KlaviyoEmbed /> — inline Klaviyo form embed wrapper.
 * Klaviyo's klaviyo.js (loaded in app/layout.tsx) auto-hydrates the matching
 * `.klaviyo-form-{ID}` div. Component is a thin wrapper to preserve consistent
 * spacing across pages.
 */
export function KlaviyoEmbed({ formId, className = "" }: KlaviyoEmbedProps) {
  return (
    <div
      className={`klaviyo-form-${formId} ${className}`}
      data-mujo-klaviyo-form-id={formId}
    />
  );
}
