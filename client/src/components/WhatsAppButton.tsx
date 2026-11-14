import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { routePath } from "@/lib/privateAreaRoutes";
import { cn } from "@/lib/utils";

export const whatsappCopy = {
  fr: {
    message: "Bonjour Dr. Ahmed Ben Lallahom, je souhaiterais vous contacter.",
    label: "Contact via WhatsApp",
    title: "Contactez-moi sur WhatsApp",
  },
  en: {
    message: "Hello Dr. Ahmed Ben Lallahom, I would like to contact you.",
    label: "Contact via WhatsApp",
    title: "Contact me on WhatsApp",
  },
  de: {
    message: "Guten Tag Dr. Ahmed Ben Lallahom, ich möchte Sie kontaktieren.",
    label: "Kontakt über WhatsApp",
    title: "Kontaktieren Sie mich über WhatsApp",
  },
  zh: {
    message: "您好，Ahmed Ben Lallahom 医生，我想与您联系。",
    label: "通过 WhatsApp 联系",
    title: "通过 WhatsApp 联系我",
  },
} as const;

/** Pages built around a form: the booking, the employer brief, the health questions, the GDPR request and the VVIP application's short address. */
const FORM_PAGE_PATHS = [
  "/booking",
  "/employers",
  "/questions-anesthesie",
  "/gdpr",
  "/vvip-offshore",
];

/**
 * The floating button stays off the form pages and every recruitment page (applications, VVIP missions,
 * unsubscribe), where it covered the fields on a phone and the text of /employers on a computer (PUB-12).
 */
export function showsWhatsAppButton(pathname: string): boolean {
  const path = routePath(pathname);
  return (
    !FORM_PAGE_PATHS.includes(path) &&
    path !== "/recruitment" &&
    !path.startsWith("/recruitment/")
  );
}

/** A field of a form, such as the home page's contact form, that the visitor types or chooses in. */
function isFormField(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.matches("input, textarea, select") &&
    target.closest("form") !== null
  );
}

export default function WhatsAppButton() {
  const { language } = useLanguage();
  const copy =
    whatsappCopy[
      (language in whatsappCopy ? language : "fr") as keyof typeof whatsappCopy
    ];
  const phoneNumber = "33972152413";
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(copy.message)}`;
  // Sur les autres pages, le bouton s'efface pendant la saisie dans un formulaire (PUB-12) ; il reste dans
  // la page, qui garde donc en bas la même place libre (index.css) au lieu de remonter à chaque champ.
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) =>
      setTyping(isFormField(event.target));
    const handleFocusOut = (event: FocusEvent) =>
      setTyping(isFormField(event.relatedTarget));
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "whatsapp-contact-float fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-green-600 active:scale-95 sm:bottom-6 sm:right-6",
        typing && "invisible"
      )}
      aria-label={copy.label}
      title={copy.title}
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
