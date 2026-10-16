import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { BOOKING_TERMS_OF_SALE_HREF } from "@shared/bookingPolicy";

/**
 * Legal information at the point of collection and payment (/booking and
 * /booking/confirmation): what the data is used for, with links to the privacy
 * policy and the legal notice. The terms-of-sale link only appears once
 * BOOKING_TERMS_OF_SALE_HREF points to an existing page. Its landmark name
 * differs from the site footer's "Informations légales" navigation, which is
 * shown on the same pages (two landmarks must not share a name).
 */
export const bookingLegalNoticeCopy = {
  fr: {
    purpose: "Vos informations servent à gérer votre réservation, votre paiement (traité par Stripe) et votre facture.",
    privacy: "Politique de confidentialité",
    legal: "Mentions légales",
    termsOfSale: "Conditions générales de vente",
    label: "Informations légales de la réservation",
  },
  en: {
    purpose: "Your information is used to manage your booking, your payment (processed by Stripe) and your invoice.",
    privacy: "Privacy policy",
    legal: "Legal notice",
    termsOfSale: "Terms of sale",
    label: "Booking legal information",
  },
  de: {
    purpose: "Ihre Angaben dienen der Verwaltung Ihrer Buchung, Ihrer Zahlung (über Stripe abgewickelt) und Ihrer Rechnung.",
    privacy: "Datenschutzerklärung",
    legal: "Impressum",
    termsOfSale: "Allgemeine Verkaufsbedingungen",
    label: "Rechtliche Informationen zur Buchung",
  },
  zh: {
    purpose: "您的信息仅用于管理您的预约、付款（由 Stripe 处理）和发票。",
    privacy: "隐私政策",
    legal: "法律声明",
    termsOfSale: "销售条款",
    label: "预约法律信息",
  },
} as const;

export default function BookingLegalNotice({ className = "", showPurpose = true }: { className?: string; showPurpose?: boolean }) {
  const { language } = useLanguage();
  const copy = bookingLegalNoticeCopy[language as keyof typeof bookingLegalNoticeCopy] ?? bookingLegalNoticeCopy.fr;
  const linkClass = "text-primary underline underline-offset-2 hover:text-primary/80";
  return (
    <nav aria-label={copy.label} className={`text-xs leading-5 text-muted-foreground ${className}`}>
      {showPurpose && <p>{copy.purpose}</p>}
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/legal?tab=privacy" className={linkClass}>{copy.privacy}</Link>
        <Link href="/legal" className={linkClass}>{copy.legal}</Link>
        {BOOKING_TERMS_OF_SALE_HREF && <Link href={BOOKING_TERMS_OF_SALE_HREF} className={linkClass}>{copy.termsOfSale}</Link>}
      </p>
    </nav>
  );
}
