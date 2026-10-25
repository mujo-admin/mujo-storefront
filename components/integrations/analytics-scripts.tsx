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
 *   - at an idle moment 5 s or more after load: Klaviyo onsite
 *   - on /checkout, anything not yet loaded waits for Stripe's form (8 s max)
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
          function idle(fn, timeout){
            if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: timeout });
            else setTimeout(fn, 200);
          }
          // On /checkout, hold any tag not yet loaded until Stripe's form has
          // arrived (or 8 s): on a phone connection the tags otherwise take the
          // bandwidth the payment form needs (it was 6 s instead of 3.3 s).
          function gate(fn){
            if (location.pathname.indexOf('/checkout') !== 0 || window.__mujoCheckoutReady) return fn();
            var done = false;
            function go(){ if (done) return; done = true; fn(); }
            window.addEventListener('mujo:checkout-ready', go, { once: true });
            setTimeout(go, 8000);
          }
          function afterLoad(){
            gate(function(){ add(libs.ga4); add(libs.meta); });
            // Klaviyo (forms, identify, onsite events) is not needed early:
            // a quiet moment 5 s or more after load. Not on the first tap: that
            // is usually Add to cart, right before checkout.
            setTimeout(function(){ idle(function(){ gate(function(){ add(libs.klaviyo); }); }, 3000); }, 5000);
          }
          // After load, at the browser's next idle moment (at most 1.5 s later).
          function whenLoaded(){ idle(afterLoad, 1500); }
          if (document.readyState === 'complete') whenLoaded();
          else window.addEventListener('load', whenLoaded, { once: true });
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
