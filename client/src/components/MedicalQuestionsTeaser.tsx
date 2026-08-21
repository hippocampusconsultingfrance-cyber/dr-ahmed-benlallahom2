import { ArrowRight, HeartHandshake, MailCheck, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

const copy = {
  fr: { eyebrow: "Service gratuit d’information", title: "Une question sur l’anesthésie ou une opération ?", body: "Posez votre question en toute confidentialité. Une réponse relue par le Dr. Ben Lallahom peut vous être adressée par email et, avec votre accord, enrichir une bibliothèque publique anonymisée.", cta: "Poser ma question gratuitement", first: "Réponse humaine validée", second: "Coordonnées strictement privées", third: "Publication seulement avec accord" },
  en: { eyebrow: "Free information service", title: "A question about anaesthesia or an operation?", body: "Ask confidentially. A response reviewed by Dr. Ben Lallahom may be sent by email and, with your agreement, enrich an anonymised public library.", cta: "Ask my question for free", first: "Human-reviewed response", second: "Contact details stay private", third: "Published only with consent" },
  de: { eyebrow: "Kostenloser Informationsdienst", title: "Eine Frage zu Anästhesie oder einer Operation?", body: "Stellen Sie Ihre Frage vertraulich. Eine von Dr. Ben Lallahom geprüfte Antwort kann Ihnen per E-Mail zugesandt und mit Ihrer Zustimmung anonym veröffentlicht werden.", cta: "Meine Frage kostenlos stellen", first: "Menschlich geprüfte Antwort", second: "Kontaktdaten bleiben privat", third: "Veröffentlichung nur mit Einwilligung" },
  zh: { eyebrow: "免费健康信息服务", title: "对麻醉或手术有疑问？", body: "您可以保密提问。经 Ben Lallahom 医生审核的回复可通过电子邮件发送，并在您同意后以匿名形式公开。", cta: "免费提问", first: "经医生审核的回复", second: "联系方式严格保密", third: "仅经同意后发布" },
} as const;

export default function MedicalQuestionsTeaser() {
  const { language } = useLanguage();
  const t = copy[(language in copy ? language : "fr") as keyof typeof copy];
  const points = [
    { icon: HeartHandshake, text: t.first },
    { icon: ShieldCheck, text: t.second },
    { icon: MailCheck, text: t.third },
  ];
  return <section id="questions-medicales" className="relative overflow-hidden border-y border-primary/15 bg-card/30 py-20 md:py-28"><div className="container"><div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-center"><div><p className="section-kicker">{t.eyebrow}</p><h2 className="mt-5 max-w-3xl font-display text-4xl leading-tight text-foreground md:text-5xl">{t.title}</h2><p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{t.body}</p><Link href="/questions-anesthesie" className="cta-primary mt-8 inline-flex items-center gap-2">{t.cta}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div><div className="grid gap-3 rounded-3xl border border-primary/20 bg-background/55 p-6 shadow-2xl shadow-black/20">{points.map(({ icon: Icon, text }) => <div key={text} className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/70 p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="text-sm font-medium text-foreground">{text}</span></div>)}</div></div></div></section>;
}
