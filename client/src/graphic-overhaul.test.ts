import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bookingContent } from "./pages/BookingPage";

const projectRoot = resolve(import.meta.dirname, "../..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("premium graphic overhaul contracts", () => {
  it("keeps the multilingual booking reassurance copy complete", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const content = bookingContent[language];
      expect(content.form.checkingAvailability).toBeTruthy();
      expect(content.form.available).toBeTruthy();
      expect(content.form.blocked).toBeTruthy();
      expect(content.form.alreadyBooked).toBeTruthy();
      expect(content.cancellation).toBeTruthy();
      expect(content.paymentTrust).toBeTruthy();
      expect(content.availabilityLabel).toBeTruthy();
    }
  });

  it("covers public route SEO and preserves document-level structured data", () => {
    const seoHead = readProjectFile("client/src/components/SEOHead.tsx");
    const publicPages = [
      "client/src/pages/BookingPage.tsx",
      "client/src/pages/BookingConfirmationPage.tsx",
      "client/src/pages/GDPRPage.tsx",
      "client/src/pages/BlogPage.tsx",
      "client/src/pages/BlogPostPage.tsx",
      "client/src/pages/NotFound.tsx",
    ];

    expect(seoHead).toContain("seo-head-structured-data");
    expect(seoHead).toContain("script.remove()");
    for (const page of publicPages) {
      expect(readProjectFile(page)).toContain("SEOHead");
    }
  });

  it("hides news from public navigation and indexing while preserving admin blog management", () => {
    const navigation = readProjectFile("client/src/components/Navigation.tsx");
    const sitemap = readProjectFile("client/public/sitemap.xml");
    const robots = readProjectFile("client/public/robots.txt");
    const admin = readProjectFile("client/src/pages/AdminDashboard.tsx");
    const app = readProjectFile("client/src/App.tsx");

    expect(navigation).not.toContain('href="/blog"');
    expect(navigation).not.toContain("content.nav.blog");
    expect(sitemap).not.toContain("/blog");
    expect(robots).toContain("Disallow: /blog");
    expect(app).not.toContain('path="/blog"');
    expect(app).not.toContain('path="/blog/:slug"');
    expect(admin).toContain("BlogTab");
  });

  it("preserves the homepage premium component contracts", () => {
    const hero = readProjectFile("client/src/components/HeroSection.tsx");
    const navigation = readProjectFile("client/src/components/Navigation.tsx");
    const booking = readProjectFile("client/src/pages/BookingPage.tsx");
    const confirmation = readProjectFile("client/src/pages/BookingConfirmationPage.tsx");
    const legal = readProjectFile("client/src/pages/LegalPage.tsx");
    const app = readProjectFile("client/src/App.tsx");
    const adminDashboard = readProjectFile("client/src/pages/AdminDashboard.tsx");
    const routers = readProjectFile("server/routers.ts");
    const webhook = readProjectFile("server/_core/index.ts");
    const cookieConsent = readProjectFile("client/src/components/CookieConsent.tsx");
    const css = readProjectFile("client/src/index.css");

    expect(hero).toContain("hero-panel");
    expect(hero).toContain("cta-primary");
    expect(navigation).toContain("aria-label");
    expect(navigation).toContain("site-nav");
    expect(navigation).toContain("mobile-navigation");
    expect(booking).toContain("availability-status");
    expect(booking).toContain("booking-notes");
    expect(booking).toContain("payment-state-success");
    expect(booking).toContain("confirmationNextSteps");
    expect(confirmation).toContain("confirmation-panel");
    expect(confirmation).toContain("privacy-trust-card");
    expect(confirmation).toContain("cancelPending.mutate");
    expect(legal).toContain('role="tablist"');
    expect(legal).toContain('aria-selected={activeTab === "privacy"}');
    expect(app).toContain("/booking/confirmation");
    expect(routers).toContain("/booking/confirmation?status=success");
    expect(routers).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(routers).toContain("cancelPending: publicProcedure");
    expect(routers).toContain("refund: adminProcedure");
    // Remboursement idempotent, désormais dans le module des actions admin sur les rendez-vous.
    expect(readProjectFile("server/appointmentAdminActions.ts")).toContain("idempotencyKey: `refund_${appointment.trackingId}`");
    expect(adminDashboard).toContain("trpc.admin.appointments.refund.useMutation");
    expect(adminDashboard).toContain("Rembourser");
    const notifications = readProjectFile("server/_core/notifications.ts");
    expect(notifications).toContain("sendRefundConfirmationEmail");
    expect(notifications).toContain("timeZone: \"Europe/Paris\"");
    expect(webhook).toContain('event.type === "checkout.session.expired"');
    expect(css).toContain("form-field-premium");
    expect(css).toContain("payment-state");
    expect(css).toContain("confirmation-panel");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(cookieConsent).toContain('role="dialog"');
    expect(cookieConsent).toContain("cookie-consent-banner");
    expect(confirmation).toContain("refund:");
    expect(confirmation).toContain("refund-policy-title");
    expect(css).toContain("cookie-consent-banner");
  });

  it("keeps explicit responsive overflow and fixed-control safeguards", () => {
    const css = readProjectFile("client/src/index.css");
    const cookieConsent = readProjectFile("client/src/components/CookieConsent.tsx");
    const whatsApp = readProjectFile("client/src/components/WhatsAppButton.tsx");

    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain(".cookie-consent-banner");
    expect(css).toContain("max-height: min(46vh, 22rem)");
    expect(css).toContain('html[data-cookie-banner-open="true"] .whatsapp-contact-float');
    expect(cookieConsent).toContain("syncCookieBannerOpenAttribute");
    expect(cookieConsent).toContain("COOKIE_BANNER_OPEN_ATTRIBUTE");
    expect(whatsApp).toContain("whatsapp-contact-float");
  });
});
