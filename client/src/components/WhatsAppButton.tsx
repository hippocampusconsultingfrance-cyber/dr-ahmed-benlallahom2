import { MessageCircle } from "lucide-react";

export default function WhatsAppButton() {
  const phoneNumber = "33612345678"; // Remplacez par votre numéro WhatsApp (format international sans +)
  const message = encodeURIComponent(
    "Bonjour Dr. Ahmed Ben Lallahom, je souhaiterais vous contacter."
  );
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg transition-all duration-300 hover:scale-110 active:scale-95"
      aria-label="Contact via WhatsApp"
      title="Contactez-moi sur WhatsApp"
    >
      <MessageCircle className="w-6 h-6" />
    </a>
  );
}
