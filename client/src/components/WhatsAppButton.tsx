import { MessageCircle } from "lucide-react";

export default function WhatsAppButton() {
  const phoneNumber = "33972152413"; // Numéro WhatsApp du Dr. Ahmed Ben Lallahom
  const message = encodeURIComponent(
    "Bonjour Dr. Ahmed Ben Lallahom, je souhaiterais vous contacter."
  );
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-contact-float fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-all duration-300 hover:scale-110 hover:bg-green-600 active:scale-95"
      aria-label="Contact via WhatsApp"
      title="Contactez-moi sur WhatsApp"
    >
      <MessageCircle className="w-6 h-6" />
    </a>
  );
}
