import { useMemo } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, MailX, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageMenu from "@/components/LanguageMenu";

type SupportedLanguage = "fr" | "en" | "de" | "zh";

export function getRecruitmentUnsubscribeCopy(language: SupportedLanguage) {
  const copy = {
    fr: {
      title: "Préférences de recrutement",
      intro: "Vous pouvez arrêter à tout moment les communications concernant les opportunités de recrutement.",
      confirm: "Ne plus recevoir ces opportunités",
      successTitle: "Préférence enregistrée",
      success: "Vous ne recevrez plus d’opportunités de recrutement de la part d’Hippocampus Consulting.",
      invalidTitle: "Lien indisponible",
      invalid: "Ce lien est invalide, incomplet ou n’est plus disponible.",
      processing: "Enregistrement de votre préférence…",
      home: "Retour à l’accueil",
    },
    en: {
      title: "Recruitment preferences",
      intro: "You can stop receiving recruitment opportunity communications at any time.",
      confirm: "Unsubscribe from these opportunities",
      successTitle: "Preference saved",
      success: "You will no longer receive recruitment opportunities from Hippocampus Consulting.",
      invalidTitle: "Link unavailable",
      invalid: "This link is invalid, incomplete, or no longer available.",
      processing: "Saving your preference…",
      home: "Back to home",
    },
    de: {
      title: "Recruiting-Einstellungen",
      intro: "Sie können Mitteilungen über Recruiting-Möglichkeiten jederzeit abbestellen.",
      confirm: "Diese Möglichkeiten nicht mehr erhalten",
      successTitle: "Einstellung gespeichert",
      success: "Sie erhalten keine Recruiting-Möglichkeiten mehr von Hippocampus Consulting.",
      invalidTitle: "Link nicht verfügbar",
      invalid: "Dieser Link ist ungültig, unvollständig oder nicht mehr verfügbar.",
      processing: "Ihre Einstellung wird gespeichert…",
      home: "Zur Startseite",
    },
    zh: {
      title: "招聘订阅偏好",
      intro: "您可以随时停止接收与招聘机会相关的通信。",
      confirm: "不再接收此类机会",
      successTitle: "偏好已保存",
      success: "您将不再收到 Hippocampus Consulting 的招聘机会信息。",
      invalidTitle: "链接不可用",
      invalid: "此链接无效、不完整或已不可用。",
      processing: "正在保存您的偏好…",
      home: "返回首页",
    },
  } as const;
  return copy[language];
}

export default function RecruitmentUnsubscribePage() {
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const copy = getRecruitmentUnsubscribeCopy(language as SupportedLanguage);
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token")?.trim() ?? "", []);
  const unsubscribe = trpc.recruitmentPreferences.unsubscribe.useMutation();
  const invalidToken = token.length < 24 || token.length > 80;
  const failed = invalidToken || Boolean(unsubscribe.error);

  const confirmUnsubscribe = () => {
    if (!invalidToken && !unsubscribe.isPending && !unsubscribe.isSuccess) unsubscribe.mutate({ token });
  };

  return (
    <>
      <SEOHead title="Désinscription recrutement | Hippocampus Consulting" description="Gérez vos préférences de communications de recrutement." noIndex />
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#030a12] p-6 text-center text-white">
        <div className="mb-4 flex w-full max-w-lg justify-end"><LanguageMenu tone="candidate" /></div>
        <section className="w-full max-w-lg rounded-3xl border border-cyan-950 bg-slate-950/80 p-8 shadow-2xl sm:p-10" aria-live="polite">
          {unsubscribe.isSuccess ? (
            <>
              <CheckCircle2 className="mx-auto text-emerald-400" size={48} aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-semibold">{copy.successTitle}</h1>
              <p className="mt-3 text-slate-300">{copy.success}</p>
            </>
          ) : failed ? (
            <>
              <ShieldAlert className="mx-auto text-amber-400" size={48} aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-semibold">{copy.invalidTitle}</h1>
              <p className="mt-3 text-slate-300">{copy.invalid}</p>
            </>
          ) : (
            <>
              <MailX className="mx-auto text-cyan-300" size={48} aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-semibold">{copy.title}</h1>
              <p className="mt-3 text-slate-300">{copy.intro}</p>
              <button
                type="button"
                onClick={confirmUnsubscribe}
                disabled={unsubscribe.isPending}
                className="mt-7 rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-70"
              >
                {unsubscribe.isPending ? copy.processing : copy.confirm}
              </button>
            </>
          )}
          <button type="button" onClick={() => navigate("/")} className="mt-7 block w-full text-sm font-medium text-cyan-300 hover:text-cyan-100">
            {copy.home}
          </button>
        </section>
      </main>
    </>
  );
}
