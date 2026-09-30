"use client";

import Script from "next/script";
import { GoogleTagManager } from "@next/third-parties/google";

/**
 * <AnalyticsScripts /> — every third-party measurement tag, in load order.
 *
 *   1. Consent Mode v2 defaults  (must run BEFORE GTM — hence beforeInteractive)
 *   2. Google Tag Manager        (hosts GA4; add future tags here, not in code)
 *   3. Klaviyo onsite
 *   4. Meta Pixel base
 *
 * Events are not fired here. Application code calls `track()` from
 * `lib/analytics.ts`; see `docs/measurement-plan.md`.
 *
 * Mounted once, at the end of <body> in app/layout.tsx.
 */

/**
 * EEA + UK + Switzerland. Consent defaults to denied in these regions and
 * granted elsewhere — Mujo ships US-only, so the overwhelming majority of
 * traffic is unaffected, but visitors here are covered correctly.
 */
const CONSENT_DENIED_REGIONS = [
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE",
  "IT","LV","LI","LT","LU","MT","NL","NO","PL","PT","RO","SK","SI","ES","SE",
  "GB","CH",
];

export function AnalyticsScripts() {
  const klaviyoKey = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

  return (
    <>
      {/*
        Consent Mode v2 defaults. Runs before any tag so GA4 never measures
        an EEA visitor before they've chosen. A stored choice in localStorage
        is replayed immediately so returning visitors keep their decision.
      */}
      <Script id="consent-default" strategy="beforeInteractive">
        {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('consent','default',{
          ad_storage:'granted', ad_user_data:'granted',
          ad_personalization:'granted', analytics_storage:'granted',
          functionality_storage:'granted', security_storage:'granted'
        });
        gtag('consent','default',{
          region:${JSON.stringify(CONSENT_DENIED_REGIONS)},
          ad_storage:'denied', ad_user_data:'denied',
          ad_personalization:'denied', analytics_storage:'denied',
          functionality_storage:'granted', security_storage:'granted',
          wait_for_update:500
        });
        try {
          var c = localStorage.getItem('mujo_consent');
          if (c === 'denied') {
            gtag('consent','update',{
              ad_storage:'denied', ad_user_data:'denied',
              ad_personalization:'denied', analytics_storage:'denied'
            });
          } else if (c === 'granted') {
            gtag('consent','update',{
              ad_storage:'granted', ad_user_data:'granted',
              ad_personalization:'granted', analytics_storage:'granted'
            });
          }
        } catch (e) { /* private mode — defaults stand */ }
        `}
      </Script>

      {gtmId && <GoogleTagManager gtmId={gtmId} />}

      {klaviyoKey && (
        <Script
          id="klaviyo-onsite"
          strategy="lazyOnload"
          src={`https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${klaviyoKey}`}
        />
      )}

      {/*
        Meta Pixel. `afterInteractive` rather than `lazyOnload`: on lazyOnload
        the base PageView lost fast bounces, and `track()` calls could fire
        before fbq existed. fbq queues calls made before the library lands, so
        loading a little earlier costs little and stops dropping events.
      */}
      {pixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');`}
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
