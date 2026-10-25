"use client";

import Script from "next/script";

/**
 * <AnalyticsScripts /> — every third-party measurement tag.
 *
 * Since 2026-10-25 (mobile speed pass, docs/performance.md) the tag *libraries*
 * load after the page has loaded, so ~650 KB of tag code no longer competes
 * with the hero picture and buy box on a phone. What runs up front is tiny:
 *
 *   1. Consent Mode v2 defaults + gtag()/dataLayer, and the GA4 config call
 *   2. The Meta pixel queue (fbq) and its init call
 *
 * Every `track()` call made before the libraries arrive waits in those queues
 * (and in Klaviyo's `_klOnsite` array, see lib/klaviyo-onsite.ts) and is sent
 * when they land, so no event is lost. Then:
 *
 *   - after window `load` (next idle moment): gtag.js for GA4 (directly — the GTM container held
 *     only this Google tag, so GTM's 125 KB wrapper is gone) and fbevents.js
 *   - on the first tap/scroll/key, or 4 s after load: Klaviyo onsite
 *
 * Trade-off: a visitor who leaves before the page has finished loading is not
 * counted as a GA4/Meta page view. Purchases are unaffected (the Stripe webhook
 * sends them server-side to Meta and Klaviyo).
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
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;

  const libs = {
    ga4: ga4Id
      ? `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`
      : null,
    meta: pixelId ? "https://connect.facebook.net/en_US/fbevents.js" : null,
    klaviyo: klaviyoKey
      ? `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${encodeURIComponent(klaviyoKey)}`
      : null,
  };

  return (
    <>
      {/*
        Consent Mode v2 defaults, gtag() and the GA4 config, before any tag.
        GA4 never measures an EEA visitor before they've chosen. A stored
        choice in localStorage is replayed immediately so returning visitors
        keep their decision. The config call sends GA4's page_view once
        gtag.js arrives (GA4's history-change setting covers in-site moves).
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
        ${ga4Id ? `gtag('js', new Date()); gtag('config', ${JSON.stringify(ga4Id)});` : ""}
        ${
          pixelId
            ? `!function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];}(window);
        fbq('init', ${JSON.stringify(pixelId)});`
            : ""
        }
        `}
      </Script>

      {/*
        The tag libraries themselves, after the page has loaded. Meta's base
        PageView is sent by <RouteAnalytics /> through track(), queued in fbq
        until fbevents.js lands.
      */}
      <Script id="tag-loader" strategy="afterInteractive">
        {`
        (function(){
          var libs = ${JSON.stringify(libs)};
          function add(src){
            if (!src) return;
            var s = document.createElement('script');
            s.async = true; s.src = src;
            document.head.appendChild(s);
          }
          var klDone = false;
          function klaviyo(){
            if (klDone) return; klDone = true;
            ['pointerdown','keydown','scroll','touchstart'].forEach(function(e){
              window.removeEventListener(e, klaviyo, { passive: true });
            });
            add(libs.klaviyo);
          }
          function afterLoad(){
            add(libs.ga4);
            add(libs.meta);
            ['pointerdown','keydown','scroll','touchstart'].forEach(function(e){
              window.addEventListener(e, klaviyo, { passive: true, once: true });
            });
            setTimeout(klaviyo, 4000);
          }
          // After load, at the browser's next idle moment (at most 1.5 s later).
          function whenIdle(){
            if ('requestIdleCallback' in window) requestIdleCallback(afterLoad, { timeout: 1500 });
            else setTimeout(afterLoad, 200);
          }
          if (document.readyState === 'complete') whenIdle();
          else window.addEventListener('load', whenIdle, { once: true });
        })();
        `}
      </Script>

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
