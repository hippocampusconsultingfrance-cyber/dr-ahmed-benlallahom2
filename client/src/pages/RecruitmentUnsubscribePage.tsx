import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { CheckCircle2, Loader2, MailX, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";
import { useLanguage } from "@/contexts/LanguageContext";

const copy = {
  fr: {
    title: "Préférences de recrutement",
    intro: "Vous pouvez arrêter à tout moment les opportunités de recrutement Hippocampus Consulting envoyées à cette adresse.",
    confirm: "Ne plus recevoir d’opportunités",
    pending: "Mise à jour de vos préférences…",
    successTitle: "Préférences mises à jour",
    success: "Vous ne recevrez plus d’opportunités de recrutement. Cette décision n’affecte pas votre candidature ni vos autres droits.",
    invalidTitle: "Lien indisponible",
    invalid: "Ce lien est incomplet, invalide ou a expiré. Vous pouvez répondre à un email de recrutement pour obtenir de l’aide.",
    error: "La mise à jour n’a pas pu être effectuée. Réessayez ou contactez-nous en réponse à l’email reçu.",
  },
  en: {
    title: "Recruitment preferences",
    intro: "You may stop receiving Hippocampus Consulting recruitment opportunities sent to this address at any time.",
    confirm: "Stop receiving opportunities",
    pending: "Updating your preferences…",
    successTitle: "Preferences updated",
    success: "You will no longer receive recruitment opportunities. This decision does not affect your application or your other rights.",
    invalidTitle: "Link unavailable",
    invalid: "This link is incomplete, invalid or expired. You may reply to a recruitment email if you need help.",
    error: "Your preferences could not be updated. Please try again or reply to the email you received.",
  },
  de: {
    title: "Recruiting-Einstellungen",
    intro: "Sie können den Erhalt von Recruiting-Angeboten von Hippocampus Consulting jederzeit beenden.",
    confirm: "Keine Angebote mehr erhalten",
    pending: "Einstellungen werden aktualisiert…",
    successTitle: "Einstellungen aktualisiert",
    success: "Sie erhalten keine Recruiting-Angebote mehr. Diese Entscheidung hat keinen Einfluss auf Ihre Bewerbung oder weitere Rechte.",
    invalidTitle: "Link nicht verfügbar",
    invalid: "Dieser Link ist unvollständig, ungültig oder abgelaufen. Bei Bedarf können Sie auf eine Recruiting-E-Mail antworten.",
    error: "Ihre Einstellungen konnten nicht aktualisiert werden. Bitte versuchen Sie es erneut oder antworten Sie auf die erhaltene E-Mail.",
  },
  zh: {
    title: "招聘偏好设置",
    intro: "您可以随时停止接收发送至此邮箱的 Hippocampus Consulting 招聘机会。",
    confirm: "不再接收招聘机会",
    pending: "正在更新您的偏好设置…",
    successTitle: "偏好设置已更新",
    success: "您将不再收到招聘机会。这不会影响您的申请或其他权利。",
    invalidTitle: "链接不可用",
    invalid: "该链接不完整、无效或已过期。如需帮助，您可以回复招聘邮件。",
    error: "无法更新您的偏好设置。请重试或回复您收到的邮件。",
  },
} as const;

export default function RecruitmentUnsubscribePage() {
  const { language } = useLanguage();
  const text = copy[language] ?? copy.en;
  const search = useSearch();
  const token = useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);
  const [confirmed, setConfirmed] = useState(false);
  const unsubscribe = trpc.recruitmentPreferences.unsubscribe.useMutation({
    onSuccess: () => setConfirmed(true),
  });
  const invalidLink = token.length < 24 || token.length > 80;

  return (
    <>
      <SEOHead title="Préférences de recrutement | Hippocampus Consulting" description="Gérez vos préférences de communication recrutement." noIndex />
      <main className="grid min-h-screen place-items-center bg-[#030a12] p-6 text-center text-white">
        <section className="w-full max-w-lg rounded-3xl border border-cyan-950 bg-slate-950/80 p-8 shadow-2xl shadow-black/30 sm:p-10">
          {confirmed ? (
            <>
              <CheckCircle2 className="mx-auto text-emerald-400" size={48} aria-hidden="true" />
              <h1 className="mt-5 font-display text-3xl font-bold">{text.successTitle}</h1>
              <p className="mt-4 leading-7 text-slate-300">{text.success}</p>
            </>
          ) : invalidLink ? (
            <>
              <ShieldAlert className="mx-auto text-amber-400" size={48} aria-hidden="true" />
              <h1 className="mt-5 font-display text-3xl font-bold">{text.invalidTitle}</h1>
              <p className="mt-4 leading-7 text-slate-300">{text.invalid}</p>
            </>
          ) : (
            <>
              <MailX className="mx-auto text-cyan-300" size={48} aria-hidden="true" />
              <h1 className="mt-5 font-display text-3xl font-bold">{text.title}</h1>
              <p className="mt-4 leading-7 text-slate-300">{text.intro}</p>
              {unsubscribe.error && <p role="alert" className="mt-4 text-sm text-rose-300">{text.error}</p>}
              <button
                type="button"
                onClick={() => unsubscribe.mutate({ token })}
                disabled={unsubscribe.isPending}
                className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {unsubscribe.isPending && <Loader2 className="animate-spin" size={18} aria-hidden="true" />}
                {unsubscribe.isPending ? text.pending : text.confirm}
              </button>
            </>
          )}
        </section>
      </main>
    </>
  );
}
