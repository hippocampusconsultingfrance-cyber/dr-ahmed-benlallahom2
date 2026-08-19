export type ServiceStatusKind = "error" | "maintenance";
export type ServiceStatusLocale = "fr" | "en" | "de" | "zh";

type ServiceStatusCopy = {
  eyebrow: string;
  title: string;
  description: string;
  home: string;
  retry: string;
};

const content: Record<ServiceStatusKind, Record<ServiceStatusLocale, ServiceStatusCopy>> = {
  error: {
    fr: { eyebrow: "Service sécurisé", title: "Une difficulté technique est survenue", description: "Nous avons été informés du problème. Vous pouvez réessayer dans quelques instants ou revenir à l’accueil.", home: "Retour à l’accueil", retry: "Réessayer" },
    en: { eyebrow: "Secure service", title: "A technical issue occurred", description: "We have been notified. Please try again in a moment or return to the home page.", home: "Return home", retry: "Try again" },
    de: { eyebrow: "Sicherer Dienst", title: "Es ist ein technisches Problem aufgetreten", description: "Wir wurden informiert. Bitte versuchen Sie es in wenigen Augenblicken erneut oder kehren Sie zur Startseite zurück.", home: "Zur Startseite", retry: "Erneut versuchen" },
    zh: { eyebrow: "安全服务", title: "发生了技术问题", description: "我们已收到问题提示。请稍后重试，或返回首页。", home: "返回首页", retry: "重新尝试" },
  },
  maintenance: {
    fr: { eyebrow: "Service sécurisé", title: "Une maintenance est en cours", description: "Nous améliorons actuellement le service afin de vous offrir une expérience fiable et sécurisée. Merci de réessayer dans quelques instants.", home: "Retour à l’accueil", retry: "Actualiser la page" },
    en: { eyebrow: "Secure service", title: "Maintenance is in progress", description: "We are improving the service to provide a reliable and secure experience. Please try again shortly.", home: "Return home", retry: "Refresh page" },
    de: { eyebrow: "Sicherer Dienst", title: "Wartungsarbeiten laufen", description: "Wir verbessern den Dienst für eine zuverlässige und sichere Erfahrung. Bitte versuchen Sie es in Kürze erneut.", home: "Zur Startseite", retry: "Seite aktualisieren" },
    zh: { eyebrow: "安全服务", title: "系统正在维护", description: "我们正在改进服务，以提供可靠、安全的体验。请稍后重试。", home: "返回首页", retry: "刷新页面" },
  },
};

export function getServiceStatusContent(kind: ServiceStatusKind, locale: ServiceStatusLocale) {
  return content[kind][locale] ?? content[kind].fr;
}
