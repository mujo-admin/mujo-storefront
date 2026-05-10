"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnnouncementBar } from "components/layout/announcement-bar";
import { Nav } from "components/layout/nav";
import { MobileMenu } from "components/layout/mobile-menu";
import { CartDrawer } from "components/cart/cart-drawer";
import { useCart } from "components/cart/cart-context";

/**
 * <SiteHeader /> — orchestrator for the AnnouncementBar + Nav + MobileMenu +
 * CartDrawer. Lives at the top of the root layout, manages shared open/close
 * state, locks body scroll when any drawer is open.
 */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { totalQuantity } = useCart();
  const cartCount = totalQuantity;
  const pathname = usePathname();

  // Close any open drawer on route change. Lets in-drawer <Link>s navigate
  // naturally without a synchronous setState in their onClick — that pattern
  // unmounts the <Link> mid-tap on iOS Safari and requires a second tap to
  // navigate. The drawer closes when the new route's pathname commits.
  useEffect(() => {
    setMenuOpen(false);
    setCartOpen(false);
  }, [pathname]);

  useEffect(() => {
    const locked = menuOpen || cartOpen;
    document.body.classList.toggle("mujo-scroll-locked", locked);
    return () => {
      document.body.classList.remove("mujo-scroll-locked");
    };
  }, [menuOpen, cartOpen]);

  useEffect(() => {
    function openCart() {
      setCartOpen(true);
    }
    function openMenu() {
      setMenuOpen(true);
    }
    function closeAll() {
      setMenuOpen(false);
      setCartOpen(false);
    }
    window.addEventListener("mujo:cart:open", openCart);
    window.addEventListener("mujo:menu:open", openMenu);
    window.addEventListener("mujo:overlay:close", closeAll);
    return () => {
      window.removeEventListener("mujo:cart:open", openCart);
      window.removeEventListener("mujo:menu:open", openMenu);
      window.removeEventListener("mujo:overlay:close", closeAll);
    };
  }, []);

  function closeAll() {
    setMenuOpen(false);
    setCartOpen(false);
  }

  return (
    <>
      <AnnouncementBar />
      <Nav
        cartCount={cartCount}
        onOpenMenu={() => setMenuOpen(true)}
        onOpenCart={() => setCartOpen(true)}
      />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <div
        className={`menu-overlay ${menuOpen || cartOpen ? "open" : ""}`}
        onClick={closeAll}
        aria-hidden
      />
      <style>{`
        .menu-overlay {
          position: fixed;
          inset: 0;
          background: rgba(26, 26, 26, 0.5);
          z-index: 998;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s;
        }
        .menu-overlay.open { opacity: 1; pointer-events: auto; }
        :global(body.mujo-scroll-locked) { overflow: hidden; }
      `}</style>
    </>
  );
}
