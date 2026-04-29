"use client";

import Script from "next/script";

/**
 * <AnalyticsScripts /> — loads Klaviyo onsite + Meta Pixel base.
 * Mounted once at root layout. Both scripts use `lazyOnload` to keep
 * Lighthouse mobile performance ≥90 — they don't block first paint.
 */
export function AnalyticsScripts() {
  const klaviyoKey = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  return (
    <>
      {klaviyoKey && (
        <Script
          id="klaviyo-onsite"
          strategy="lazyOnload"
          src={`https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${klaviyoKey}`}
        />
      )}

      {pixelId && (
        <Script id="meta-pixel" strategy="lazyOnload">
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');`}
        </Script>
      )}

      {pixelId && (
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}
    </>
  );
}
