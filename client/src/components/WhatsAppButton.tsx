import { MessageCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { routePath } from "@/lib/privateAreaRoutes";

export const whatsappCopy = {
  fr: { message: "Bonjour Dr. Ahmed Ben Lallahom, je souhaiterais vous contacter.", label: "Contact via WhatsApp", title: "Contactez-moi sur WhatsApp" },
  en: { message: "Hello Dr. Ahmed Ben Lallahom, I would like to contact you.", label: "Contact via WhatsApp", title: "Contact me on WhatsApp" },
  de: { message: "Guten Tag Dr. Ahmed Ben Lallahom, ich möchte Sie kontaktieren.", label: "Kontakt über WhatsApp", title: "Kontaktieren Sie mich über WhatsApp" },
  zh: { message: "您好，Ahmed Ben Lallahom 医生，我想与您联系。", label: "通过 WhatsApp 联系", title: "通过 WhatsApp 联系我" },
} as const;

/** Pages built around a form: the booking, the employer brief, the health questions, the GDPR request and the VVIP application's short address. */
const FORM_PAGE_PATHS = ["/booking", "/employers", "/questions-anesthesie", "/gdpr", "/vvip-offshore"];

/**
 * The floating button stays off the form pages and every recruitment page (applications, VVIP missions,
 * unsubscribe), where it covered the fields on a phone and the text of /employers on a computer (PUB-12).
 */
export function showsWhatsAppButton(pathname: string): boolean {
  const path = routePath(pathname);
  return !FORM_PAGE_PATHS.includes(path) && path !== "/recruitment" && !path.startsWith("/recruitment/");
}

export default function WhatsAppButton() {
  const { language } = useLanguage();
  const copy = whatsappCopy[(language in whatsappCopy ? language : "fr") as keyof typeof whatsappCopy];
  const phoneNumber = "33972152413";
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(copy.message)}`;

  return <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="whatsapp-contact-float fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-green-600 active:scale-95 sm:bottom-6 sm:right-6" aria-label={copy.label} title={copy.title}><MessageCircle className="h-6 w-6" /></a>;
}
