export type FaqLocale = "fr" | "en" | "de" | "zh";

export type FaqEntry = { question: string; answer: string };
export type FaqContent = { eyebrow: string; title: string; description: string; note: string; booking: string; entries: FaqEntry[] };

const faq: Record<FaqLocale, FaqContent> = {
  fr: {
    eyebrow: "Informations pratiques",
    title: "Questions fréquentes",
    description: "Retrouvez les informations essentielles sur la consultation, la réservation, la confidentialité et les parcours Hippocampus Consulting.",
    note: "Cette page donne des informations pratiques et ne remplace pas un avis médical personnalisé ni les services d’urgence.",
    booking: "Réserver une consultation",
    entries: [
      { question: "À quoi sert la consultation en santé ?", answer: "La consultation permet d’échanger sur votre demande dans un cadre professionnel. Elle ne constitue pas un service d’urgence et ne remplace pas une prise en charge immédiate." },
      { question: "Quelle est la durée et le tarif d’une consultation ?", answer: "La durée habituelle est de 30 minutes. Le tarif de base est de 100 € ; entre 18 h et 8 h, le tarif majoré est de 150 €." },
      { question: "Comment réserver et payer ?", answer: "Choisissez un créneau, renseignez vos coordonnées et le motif de votre demande, puis effectuez le paiement sécurisé en ligne. Une confirmation est envoyée après validation du paiement." },
      { question: "Puis-je annuler mon rendez-vous ?", answer: "L’annulation est remboursée intégralement lorsqu’elle intervient plus de 24 heures avant le créneau réservé. Passé ce délai, la consultation n’est pas remboursable." },
      { question: "Que faire en cas d’urgence ?", answer: "En cas de danger immédiat ou d’urgence médicale, contactez le 112 ou les services d’urgence locaux. N’attendez pas une consultation programmée." },
      { question: "À quoi sert le parcours Hippocampus Consulting ?", answer: "Le parcours recrutement permet aux professionnels de santé et paramédicaux de déposer une candidature pour des opportunités internationales. L’analyse assistée aide à organiser les dossiers ; toute décision nécessite une revue humaine." },
    ],
  },
  en: {
    eyebrow: "Practical information",
    title: "Frequently asked questions",
    description: "Find essential information about consultations, booking, confidentiality and Hippocampus Consulting pathways.",
    note: "This page provides practical information. It does not replace personalised medical advice or emergency services.",
    booking: "Book a consultation",
    entries: [
      { question: "What is the purpose of a health consultation?", answer: "A consultation provides a professional setting to discuss your request. It is not an emergency service and does not replace immediate care." },
      { question: "How long is a consultation and what does it cost?", answer: "A standard consultation lasts 30 minutes. The base fee is €100; between 6 pm and 8 am, the enhanced fee is €150." },
      { question: "How do I book and pay?", answer: "Select a time slot, provide your contact details and request, then complete secure online payment. A confirmation is sent once payment is validated." },
      { question: "Can I cancel my appointment?", answer: "Cancellations made more than 24 hours before the booked time are fully refunded. After that deadline, the consultation is non-refundable." },
      { question: "What should I do in an emergency?", answer: "In an immediate danger or medical emergency, call 112 or your local emergency services. Do not wait for a scheduled consultation." },
      { question: "What is the Hippocampus Consulting pathway for?", answer: "The recruitment pathway lets healthcare and allied-health professionals apply for international opportunities. Assisted analysis helps organise files; every decision requires human review." },
    ],
  },
  de: {
    eyebrow: "Praktische Informationen",
    title: "Häufig gestellte Fragen",
    description: "Hier finden Sie wichtige Informationen zu Beratung, Buchung, Vertraulichkeit und den Angeboten von Hippocampus Consulting.",
    note: "Diese Seite bietet praktische Informationen. Sie ersetzt weder eine persönliche medizinische Beratung noch den Notdienst.",
    booking: "Beratung buchen",
    entries: [
      { question: "Wozu dient die Gesundheitsberatung?", answer: "Die Beratung bietet einen professionellen Rahmen, um Ihr Anliegen zu besprechen. Sie ist kein Notdienst und ersetzt keine sofortige Versorgung." },
      { question: "Wie lange dauert eine Beratung und was kostet sie?", answer: "Eine Standardberatung dauert 30 Minuten. Der Grundpreis beträgt 100 €; zwischen 18 und 8 Uhr beträgt der erhöhte Preis 150 €." },
      { question: "Wie buche und bezahle ich?", answer: "Wählen Sie einen Termin, geben Sie Ihre Kontaktdaten und Ihr Anliegen an und schließen Sie die sichere Online-Zahlung ab. Nach Zahlungsbestätigung erhalten Sie eine Bestätigung." },
      { question: "Kann ich meinen Termin stornieren?", answer: "Bei einer Stornierung mehr als 24 Stunden vor dem Termin wird der Betrag vollständig erstattet. Danach ist die Beratung nicht erstattungsfähig." },
      { question: "Was soll ich im Notfall tun?", answer: "Bei unmittelbarer Gefahr oder einem medizinischen Notfall rufen Sie 112 oder den örtlichen Notdienst. Warten Sie nicht auf einen geplanten Termin." },
      { question: "Wofür ist der Weg von Hippocampus Consulting gedacht?", answer: "Der Recruiting-Bereich ermöglicht Gesundheits- und paramedizinischen Fachkräften die Bewerbung für internationale Möglichkeiten. Die unterstützte Analyse organisiert Unterlagen; jede Entscheidung wird von Menschen geprüft." },
    ],
  },
  zh: {
    eyebrow: "实用信息",
    title: "常见问题",
    description: "了解咨询、预约、保密和 Hippocampus Consulting 服务流程的必要信息。",
    note: "本页仅提供实用信息，不能替代个性化医疗意见或紧急服务。",
    booking: "预约咨询",
    entries: [
      { question: "健康咨询的用途是什么？", answer: "咨询为讨论您的需求提供专业环境。它不是紧急服务，也不能替代即时医疗照护。" },
      { question: "咨询时长和费用是多少？", answer: "标准咨询时长为 30 分钟。基础费用为 100 欧元；18 时至 8 时的加价费用为 150 欧元。" },
      { question: "如何预约和付款？", answer: "选择时段、填写联系方式与需求，然后完成安全在线付款。付款确认后将发送确认信息。" },
      { question: "我可以取消预约吗？", answer: "在预约时间 24 小时之前取消可获得全额退款。超过该期限，咨询费用不予退还。" },
      { question: "遇到紧急情况该怎么办？", answer: "如遇即时危险或医疗紧急情况，请联系 112 或当地急救服务。请勿等待已预约的咨询。" },
      { question: "Hippocampus Consulting 流程有什么用途？", answer: "招聘流程帮助医疗及辅助医疗专业人士申请国际机会。辅助分析只用于整理文件；所有决定均须经过人工审核。" },
    ],
  },
};

export function getFaqContent(locale: FaqLocale) {
  return faq[locale] ?? faq.fr;
}
