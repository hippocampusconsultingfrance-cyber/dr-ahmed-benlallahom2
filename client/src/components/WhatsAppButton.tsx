import { MessageCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export const whatsappCopy = {
  fr: { message: "Bonjour Dr. Ahmed Ben Lallahom, je souhaiterais vous contacter.", label: "Contact via WhatsApp", title: "Contactez-moi sur WhatsApp" },
  en: { message: "Hello Dr. Ahmed Ben Lallahom, I would like to contact you.", label: "Contact via WhatsApp", title: "Contact me on WhatsApp" },
  de: { message: "Guten Tag Dr. Ahmed Ben Lallahom, ich möchte Sie kontaktieren.", label: "Kontakt über WhatsApp", title: "Kontaktieren Sie mich über WhatsApp" },
  zh: { message: "您好，Ahmed Ben Lallahom 医生，我想与您联系。", label: "通过 WhatsApp 联系", title: "通过 WhatsApp 联系我" },
} as const;

export default function WhatsAppButton() {
  const { language } = useLanguage();
  const copy = whatsappCopy[(language in whatsappCopy ? language : "fr") as keyof typeof whatsappCopy];
  const phoneNumber = "33972152413";
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(copy.message)}`;

  return <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="whatsapp-contact-float fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-all duration-300 hover:scale-110 hover:bg-green-600 active:scale-95" aria-label={copy.label} title={copy.title}><MessageCircle className="h-6 w-6" /></a>;
}
