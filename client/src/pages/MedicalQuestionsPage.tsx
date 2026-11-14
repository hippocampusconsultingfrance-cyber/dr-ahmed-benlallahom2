import { FormEvent, useReducer, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  HeartHandshake,
  LockKeyhole,
  MailCheck,
  Sparkles,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import {
  reportFieldsToCorrect,
  type FieldToCorrect,
} from "@/lib/formFieldsToCorrect";
import { publishedQuestionLanguage } from "@/lib/publishedQuestionLanguage";
import {
  getInvalidCharactersCopy,
  getTurnstileWidgetCopy,
} from "@/lib/publicFormCopy";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { INVALID_CHARACTERS_REASON } from "@shared/publicFormRefusalReasons";
import { cleanTextInput } from "@shared/textInputCleaning";

const copy = {
  fr: {
    title: "Questions gratuites sur l’anesthésie et l’opération",
    description:
      "Posez une question générale et recevez une réponse relue par le Dr. Ahmed Ben Lallahom.",
    eyebrow: "Information médicale générale · gratuite",
    lead: "Une explication claire peut aider à mieux préparer une opération. Ce service gratuit vous permet de poser une question générale ; vos coordonnées restent privées.",
    urgentTitle: "Ce service ne traite pas les urgences",
    urgentBody:
      "En cas de danger immédiat, de symptôme inquiétant ou de besoin d’aide rapide, contactez les secours ou un professionnel de santé sans attendre une réponse par email.",
    privateTitle: "Votre demande est traitée de manière confidentielle",
    privateBody:
      "Le nom, l’email et le téléphone servent uniquement à vous répondre. Ils ne sont jamais publiés.",
    formTitle: "Poser ma question gratuitement",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Email",
    phone: "Téléphone",
    question: "Votre question",
    questionHint:
      "Décrivez votre question de façon générale. N’indiquez pas de dossier médical, document, image ou donnée clinique identifiante.",
    privacy:
      "J’accepte que ma question, qui peut contenir des informations sur ma santé, et mes coordonnées soient traitées pour me répondre par email (consentement retirable à tout moment).",
    publication:
      "Facultatif : j’accepte qu’une version anonymisée de ma question et de la réponse soit publiée après validation médicale. Sans cet accord, je reçois quand même une réponse.",
    urgency:
      "Je comprends que ce formulaire ne répond pas aux urgences et ne remplace pas une consultation médicale.",
    submit: "Envoyer ma question",
    sending: "Envoi sécurisé…",
    successTitle: "Votre question a bien été reçue",
    successBody:
      "Elle sera examinée avant toute réponse. Un accusé de réception vous est envoyé par email. Votre référence confidentielle est :",
    successBodyNoAcknowledgement:
      "Elle sera examinée avant toute réponse. Notez votre référence confidentielle :",
    publicTitle: "Questions et réponses publiées",
    publicLead:
      "Ces réponses sont anonymisées, relues et publiées avec l’accord de la personne concernée.",
    empty: "Aucune réponse n’est encore publiée. Revenez prochainement.",
    error:
      "Vérifiez les champs requis et la vérification de sécurité, puis réessayez.",
    tooManyRequests:
      "Trop d’envois depuis cette connexion. Réessayez dans une heure.",
    required: "Champ requis",
    characterHint: "30 à 3 000 caractères",
    privacyField: "Consentement au traitement de votre question",
    urgencyField: "Avertissement sur les urgences",
    trustTitle: "Information, clarté, confiance",
    trustBody:
      "Chaque réponse est relue avant l’envoi. La reformulation assistée sert uniquement à améliorer la clarté : elle ne remplace pas l’expertise médicale.",
    replyBody:
      "Vous recevez une réponse par email après validation. La publication publique est séparée, facultative et anonymisée.",
    libraryKicker: "Bibliothèque d’information",
    loading: "Chargement…",
    publishedIn: {
      fr: "En français",
      en: "En anglais",
      de: "En allemand",
      zh: "En chinois",
    },
  },
  en: {
    title: "Free questions about anaesthesia and surgery",
    description:
      "Ask a general question and receive a response reviewed by Dr. Ahmed Ben Lallahom.",
    eyebrow: "Free general medical information",
    lead: "A clear explanation can help prepare for surgery. This free service lets you ask a general question; your contact details remain private.",
    urgentTitle: "This service does not handle emergencies",
    urgentBody:
      "In case of immediate danger, concerning symptoms, or a need for rapid help, contact emergency services or a healthcare professional without waiting for an email response.",
    privateTitle: "Your request is treated confidentially",
    privateBody:
      "Your name, email and phone number are used only to reply. They are never published.",
    formTitle: "Ask my question for free",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    phone: "Phone",
    question: "Your question",
    questionHint:
      "Ask in general terms. Do not include medical records, documents, images or identifying clinical information.",
    privacy:
      "I agree that my question, which may contain information about my health, and my contact details are processed to answer me by email (consent can be withdrawn at any time).",
    publication:
      "Optional: I agree that an anonymised version of my question and of the answer may be published after medical review. Without this agreement, I still receive an answer.",
    urgency:
      "I understand that this form does not respond to emergencies and does not replace a medical consultation.",
    submit: "Send my question",
    sending: "Sending securely…",
    successTitle: "Your question has been received",
    successBody:
      "It will be reviewed before any response. An acknowledgement is sent to you by email. Your confidential reference is:",
    successBodyNoAcknowledgement:
      "It will be reviewed before any response. Please note your confidential reference:",
    publicTitle: "Published questions and answers",
    publicLead:
      "These answers are anonymised, reviewed and published with the person’s consent.",
    empty: "No answer has been published yet. Please check back soon.",
    error:
      "Check the required fields and security verification, then try again.",
    tooManyRequests:
      "Too many submissions from this connection. Please try again in an hour.",
    required: "Required field",
    characterHint: "30 to 3,000 characters",
    privacyField: "Consent to processing your question",
    urgencyField: "Emergency notice",
    trustTitle: "Information, clarity, trust",
    trustBody:
      "Every answer is reviewed before it is sent. Assisted rewording only serves to make it clearer: it does not replace medical expertise.",
    replyBody:
      "You receive an answer by email once it has been reviewed. Public publication is separate, optional and anonymised.",
    libraryKicker: "Information library",
    loading: "Loading…",
    publishedIn: {
      fr: "In French",
      en: "In English",
      de: "In German",
      zh: "In Chinese",
    },
  },
  de: {
    title: "Kostenlose Fragen zu Anästhesie und Operation",
    description:
      "Stellen Sie eine allgemeine Frage und erhalten Sie eine von Dr. Ahmed Ben Lallahom geprüfte Antwort.",
    eyebrow: "Kostenlose allgemeine Gesundheitsinformation",
    lead: "Eine klare Erklärung kann bei der Vorbereitung auf eine Operation helfen. Ihre Kontaktdaten bleiben privat.",
    urgentTitle: "Dieser Dienst behandelt keine Notfälle",
    urgentBody:
      "Bei unmittelbarer Gefahr, besorgniserregenden Symptomen oder dringendem Hilfebedarf kontaktieren Sie unverzüglich den Rettungsdienst oder medizinisches Fachpersonal.",
    privateTitle: "Ihre Anfrage wird vertraulich behandelt",
    privateBody:
      "Name, E-Mail und Telefon dienen nur zur Antwort und werden nie veröffentlicht.",
    formTitle: "Meine Frage kostenlos stellen",
    firstName: "Vorname",
    lastName: "Nachname",
    email: "E-Mail",
    phone: "Telefon",
    question: "Ihre Frage",
    questionHint:
      "Formulieren Sie allgemein. Keine Krankenakten, Dokumente, Bilder oder identifizierende klinische Informationen.",
    privacy:
      "Ich willige ein, dass meine Frage, die Angaben zu meiner Gesundheit enthalten kann, und meine Kontaktdaten verarbeitet werden, um mir per E-Mail zu antworten (jederzeit widerrufbar).",
    publication:
      "Optional: Ich bin einverstanden, dass eine anonymisierte Fassung meiner Frage und der Antwort nach ärztlicher Prüfung veröffentlicht wird. Auch ohne diese Einwilligung erhalte ich eine Antwort.",
    urgency:
      "Ich verstehe, dass dieses Formular keine Notfälle beantwortet und keine ärztliche Konsultation ersetzt.",
    submit: "Frage senden",
    sending: "Sicherer Versand…",
    successTitle: "Ihre Frage wurde erhalten",
    successBody:
      "Sie wird vor jeder Antwort geprüft. Eine Eingangsbestätigung wird Ihnen per E-Mail gesendet. Ihre vertrauliche Referenz:",
    successBodyNoAcknowledgement:
      "Sie wird vor jeder Antwort geprüft. Bitte notieren Sie Ihre vertrauliche Referenz:",
    publicTitle: "Veröffentlichte Fragen und Antworten",
    publicLead:
      "Diese Antworten sind anonymisiert, geprüft und mit Einwilligung veröffentlicht.",
    empty: "Noch keine Antwort veröffentlicht. Bitte später wiederkommen.",
    error:
      "Prüfen Sie die Pflichtfelder und die Sicherheitsprüfung und versuchen Sie es erneut.",
    tooManyRequests:
      "Zu viele Anfragen über diese Verbindung. Bitte versuchen Sie es in einer Stunde erneut.",
    required: "Pflichtfeld",
    characterHint: "30 bis 3.000 Zeichen",
    privacyField: "Einwilligung in die Verarbeitung Ihrer Frage",
    urgencyField: "Hinweis zu Notfällen",
    trustTitle: "Information, Klarheit, Vertrauen",
    trustBody:
      "Jede Antwort wird vor dem Versand geprüft. Die unterstützte Umformulierung dient nur der Verständlichkeit: Sie ersetzt keine ärztliche Expertise.",
    replyBody:
      "Sie erhalten nach der Prüfung eine Antwort per E-Mail. Die öffentliche Veröffentlichung ist davon getrennt, freiwillig und anonymisiert.",
    libraryKicker: "Informationsbibliothek",
    loading: "Wird geladen…",
    publishedIn: {
      fr: "Auf Französisch",
      en: "Auf Englisch",
      de: "Auf Deutsch",
      zh: "Auf Chinesisch",
    },
  },
  zh: {
    title: "免费麻醉与手术问题服务",
    description: "提出一般性问题，并获得 Ahmed Ben Lallahom 医生审核的答复。",
    eyebrow: "免费一般健康信息",
    lead: "清晰的解释有助于更好地准备手术。您的联系方式将保持私密。",
    urgentTitle: "本服务不处理紧急情况",
    urgentBody:
      "如有紧急危险、令人担忧的症状或需要快速帮助，请立即联系急救服务或医疗专业人员，不要等待电子邮件回复。",
    privateTitle: "您的请求将被保密处理",
    privateBody: "姓名、电子邮件和电话仅用于回复，绝不会公开。",
    formTitle: "免费提问",
    firstName: "名字",
    lastName: "姓氏",
    email: "电子邮件",
    phone: "电话",
    question: "您的问题",
    questionHint:
      "请以一般方式提问。请勿填写病历、文件、图片或可识别的临床信息。",
    privacy:
      "我同意为通过电子邮件答复我而处理我的问题（可能包含健康信息）和联系方式（可随时撤回同意）。",
    publication:
      "可选：我同意在医学审核后发布我的问题及答复的匿名版本。即使不同意，我仍会收到答复。",
    urgency: "我了解此表单不处理紧急情况，也不能替代医疗咨询。",
    submit: "发送我的问题",
    sending: "正在安全发送…",
    successTitle: "已收到您的问题",
    successBody: "将在回复前进行审核。确认邮件已发送给您。您的保密编号是：",
    successBodyNoAcknowledgement: "将在回复前进行审核。请记下您的保密编号：",
    publicTitle: "已发布的问题与答案",
    publicLead: "这些答案已匿名、审核，并在当事人同意后发布。",
    empty: "尚未发布任何答案，请稍后再来。",
    error: "请检查必填字段和安全验证，然后重试。",
    tooManyRequests: "此网络连接的提交次数过多。请一小时后再试。",
    required: "必填字段",
    characterHint: "30 至 3,000 个字符",
    privacyField: "同意处理您的问题",
    urgencyField: "紧急情况须知",
    trustTitle: "信息、清晰、信任",
    trustBody:
      "每个答复在发送前都会经过审核。辅助改写仅用于使表达更清晰，不能替代医学专业判断。",
    replyBody:
      "审核通过后，您将通过电子邮件收到答复。公开发布与此分开进行，可自行选择，并经过匿名处理。",
    libraryKicker: "信息库",
    loading: "正在加载…",
    publishedIn: { fr: "法语", en: "英语", de: "德语", zh: "中文" },
  },
} as const;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  question: string;
  privacy: boolean;
  publication: boolean;
  urgency: boolean;
};
const initialForm: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  question: "",
  privacy: false,
  publication: false,
  urgency: false,
};

type InvalidField = keyof FormState | "turnstile";
type SubmitFeedback = {
  invalid: Set<InvalidField>;
  rateLimited: boolean;
  invalidCharacters: boolean;
};
type SubmitFeedbackEvent =
  | { type: "edit"; field: keyof FormState }
  | { type: "submit"; invalid: Set<InvalidField> }
  | { type: "refused"; code: string | undefined; reason?: string };

/**
 * What a refused submission points at: the per-connection cap (MAIL-01) is neither a field nor the security check,
 * nor a field refused for its characters (INTL-05), which is to be typed again.
 */
export function medicalQuestionSubmitError(
  code: string | undefined,
  reason?: string
): "tooManyRequests" | "invalidCharacters" | "turnstile" {
  if (reason === INVALID_CHARACTERS_REASON) return "invalidCharacters";
  return code === "TOO_MANY_REQUESTS" ? "tooManyRequests" : "turnstile";
}

/** Fields still to complete, the security check included, before the question can be sent. */
export function medicalQuestionInvalidFields(
  form: FormState,
  turnstileToken: string | null
): Set<InvalidField> {
  const invalid = new Set<InvalidField>();
  if (!form.firstName.trim()) invalid.add("firstName");
  if (!form.lastName.trim()) invalid.add("lastName");
  if (!/^\S+@\S+\.\S+$/.test(form.email)) invalid.add("email");
  if (form.phone.trim().length < 5) invalid.add("phone");
  if (form.question.trim().length < 30) invalid.add("question");
  if (!form.privacy) invalid.add("privacy");
  if (!form.urgency) invalid.add("urgency");
  if (!turnstileToken) invalid.add("turnstile");
  return invalid;
}

/** Control focused for each field the alert names; the security check takes no focus. */
const medicalQuestionFieldIds: Record<
  Exclude<InvalidField, "publication" | "turnstile">,
  string
> = {
  firstName: "medical-question-firstName",
  lastName: "medical-question-lastName",
  email: "medical-question-email",
  phone: "medical-question-phone",
  question: "medical-question-text",
  privacy: "medical-question-privacy",
  urgency: "medical-question-urgency",
};

/** What the alert names for each field refused before sending, in the order of the form, and where focus goes (A11Y-03). */
export function medicalQuestionFieldsToCorrect(
  invalid: Iterable<InvalidField>,
  language: keyof typeof copy
): FieldToCorrect[] {
  const t = copy[language];
  const names: Record<keyof typeof medicalQuestionFieldIds, string> = {
    firstName: t.firstName,
    lastName: t.lastName,
    email: t.email,
    phone: t.phone,
    question: t.question,
    privacy: t.privacyField,
    urgency: t.urgencyField,
  };
  return Array.from(invalid).flatMap((field): FieldToCorrect[] =>
    field === "turnstile"
      ? [{ label: getTurnstileWidgetCopy(language).label }]
      : field === "publication"
        ? []
        : [{ label: names[field], focusId: medicalQuestionFieldIds[field] }]
  );
}

/** Each submit starts afresh, so the frame an earlier refusal left around the security check cannot hide the per-connection cap (MAIL-01). */
export function medicalQuestionFeedback(
  state: SubmitFeedback,
  event: SubmitFeedbackEvent
): SubmitFeedback {
  if (event.type === "submit")
    return {
      invalid: event.invalid,
      rateLimited: false,
      invalidCharacters: false,
    };
  if (event.type === "edit") {
    const invalid = new Set(state.invalid);
    invalid.delete(event.field);
    return { ...state, invalid };
  }
  const refusal = medicalQuestionSubmitError(event.code, event.reason);
  if (refusal === "tooManyRequests") return { ...state, rateLimited: true };
  if (refusal === "invalidCharacters")
    return { ...state, invalidCharacters: true };
  return { ...state, invalid: new Set(state.invalid).add("turnstile") };
}

/** Text above the reference: the acknowledgement email is promised only when it really left (skipped beyond the day's volume, ABUS-01, or failed). */
export function medicalQuestionSuccessBody(
  language: keyof typeof copy,
  acknowledgementSent: boolean
): string {
  return acknowledgementSent
    ? copy[language].successBody
    : copy[language].successBodyNoAcknowledgement;
}

/** The alert under the form: fields to fix first, then the per-connection cap, then a field refused for its characters. */
export function medicalQuestionAlert(
  feedback: SubmitFeedback
): "error" | "tooManyRequests" | "invalidCharacters" | null {
  return feedback.invalid.size > 0
    ? "error"
    : feedback.rateLimited
      ? "tooManyRequests"
      : feedback.invalidCharacters
        ? "invalidCharacters"
        : null;
}

export default function MedicalQuestionsPage() {
  const { language, content } = useLanguage();
  const lang = (language in copy ? language : "fr") as keyof typeof copy;
  const t = copy[lang];
  const [form, setForm] = useState<FormState>(initialForm);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const [feedback, dispatchFeedback] = useReducer(medicalQuestionFeedback, {
    invalid: new Set<InvalidField>(),
    rateLimited: false,
    invalidCharacters: false,
  });
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [acknowledgementSent, setAcknowledgementSent] = useState(true);
  // Fields named by the last refused submit; a refusal of the server keeps the generic message.
  const [fieldsMessage, setFieldsMessage] = useState("");
  const questions = trpc.medicalQuestions.published.useQuery({ limit: 12 });
  const submit = trpc.medicalQuestions.submit.useMutation({
    onSuccess: data => {
      setTrackingId(data.trackingId);
      setAcknowledgementSent(data.acknowledgementSent);
      setTurnstileToken(null);
      setForm(initialForm);
    },
    onError: error => {
      setTurnstileToken(null);
      setTurnstileAttempt(value => value + 1);
      dispatchFeedback({
        type: "refused",
        code: error.data?.code,
        reason: error.data?.reason,
      });
    },
  });
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(previous => ({ ...previous, [key]: value }));
    dispatchFeedback({ type: "edit", field: key });
  };
  const bad = (field: InvalidField) => feedback.invalid.has(field);
  const feedbackAlert = medicalQuestionAlert(feedback);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const invalid = medicalQuestionInvalidFields(form, turnstileToken);
    dispatchFeedback({ type: "submit", invalid });
    setFieldsMessage(
      invalid.size
        ? reportFieldsToCorrect(
            medicalQuestionFieldsToCorrect(invalid, lang),
            lang
          )
        : ""
    );
    if (invalid.size || !turnstileToken) return;
    submit.mutate({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      question: form.question,
      language: lang,
      privacyConsent: true,
      publicationConsent: form.publication,
      urgencyAcknowledged: true,
      turnstileToken,
      website: "",
    });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title={t.title}
        description={t.description}
        ogUrl="https://drahmedbenlallahom.com/questions-anesthesie"
      />
      <Navigation />
      <main className="pt-32 md:pt-40">
        <section className="container pb-16">
          <div className="max-w-4xl">
            <p className="section-kicker">{t.eyebrow}</p>
            <h1 className="mt-5 font-display text-4xl leading-tight md:text-6xl">
              {t.title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
              {t.lead}
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <section
              role="note"
              className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5"
            >
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div>
                  <h2 className="font-semibold">{t.urgentTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t.urgentBody}
                  </p>
                </div>
              </div>
            </section>
            <section
              role="note"
              className="rounded-2xl border border-primary/30 bg-primary/5 p-5"
            >
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="font-semibold">{t.privateTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t.privateBody}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </section>
        <section className="border-y border-border/60 bg-card/30 py-14">
          <div className="container grid gap-10 lg:grid-cols-[1.1fr_.9fr]">
            <div className="editorial-card p-6 md:p-8">
              {trackingId ? (
                <div className="py-10 text-center">
                  <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
                  <h2 className="mt-5 font-display text-3xl">
                    {t.successTitle}
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                    {medicalQuestionSuccessBody(lang, acknowledgementSent)}
                  </p>
                  <p className="mt-5 rounded-xl bg-primary/10 px-5 py-4 font-mono text-lg font-bold text-primary">
                    {trackingId}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  <div>
                    <p className="section-kicker">{t.eyebrow}</p>
                    <h2 className="mt-2 font-display text-3xl">
                      {t.formTitle}
                    </h2>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id={medicalQuestionFieldIds.firstName}
                      label={t.firstName}
                      autoComplete="given-name"
                      value={form.firstName}
                      invalid={bad("firstName")}
                      onChange={value => update("firstName", value)}
                    />
                    <Field
                      id={medicalQuestionFieldIds.lastName}
                      label={t.lastName}
                      autoComplete="family-name"
                      value={form.lastName}
                      invalid={bad("lastName")}
                      onChange={value => update("lastName", value)}
                    />
                    <Field
                      id={medicalQuestionFieldIds.email}
                      label={t.email}
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      invalid={bad("email")}
                      onChange={value => update("email", cleanTextInput(value))}
                    />
                    <Field
                      id={medicalQuestionFieldIds.phone}
                      label={t.phone}
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      invalid={bad("phone")}
                      onChange={value => update("phone", value)}
                    />
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t.question} *</span>
                    <textarea
                      id={medicalQuestionFieldIds.question}
                      value={form.question}
                      onChange={event => update("question", event.target.value)}
                      aria-invalid={bad("question")}
                      maxLength={3000}
                      rows={7}
                      className={`form-control block w-full resize-y rounded-none border border-border bg-background/80 px-3 py-2 shadow-inner ${bad("question") ? "form-field-invalid" : ""}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t.questionHint} · {t.characterHint}
                    </span>
                  </label>
                  <div className="space-y-3 text-sm">
                    <Consent
                      id={medicalQuestionFieldIds.privacy}
                      checked={form.privacy}
                      invalid={bad("privacy")}
                      onChange={value => update("privacy", value)}
                    >
                      {t.privacy}
                    </Consent>
                    <Consent
                      checked={form.publication}
                      invalid={false}
                      required={false}
                      onChange={value => update("publication", value)}
                    >
                      {t.publication}
                    </Consent>
                    <Consent
                      id={medicalQuestionFieldIds.urgency}
                      checked={form.urgency}
                      invalid={bad("urgency")}
                      onChange={value => update("urgency", value)}
                    >
                      {t.urgency}
                    </Consent>
                  </div>
                  <div
                    className={
                      bad("turnstile")
                        ? "rounded-xl border border-destructive/50 p-2"
                        : ""
                    }
                  >
                    <TurnstileWidget
                      key={turnstileAttempt}
                      onToken={setTurnstileToken}
                    />
                  </div>
                  {feedbackAlert && (
                    <p className="text-sm text-destructive" role="alert">
                      {feedbackAlert === "error" && fieldsMessage
                        ? fieldsMessage
                        : feedbackAlert === "invalidCharacters"
                          ? getInvalidCharactersCopy(lang)
                          : t[feedbackAlert]}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={submit.isPending}
                    className="cta-primary w-full justify-center"
                  >
                    {submit.isPending ? t.sending : t.submit}
                  </button>
                </form>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-primary/20 bg-background/60 p-6">
                <HeartHandshake className="h-7 w-7 text-primary" />
                <h2 className="mt-4 font-display text-2xl">{t.trustTitle}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {t.trustBody}
                </p>
              </div>
              <div className="rounded-3xl border border-border bg-background/60 p-6">
                <MailCheck className="h-7 w-7 text-primary" />
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {t.replyBody}
                </p>
              </div>
              <a href="/booking" className="cta-secondary w-full">
                {content.hero.bookConsultation}
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>
        <section className="container py-20">
          <div className="max-w-3xl">
            <p className="section-kicker">{t.libraryKicker}</p>
            <h2 className="mt-4 font-display text-4xl">{t.publicTitle}</h2>
            <p className="mt-4 text-muted-foreground">{t.publicLead}</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {questions.isLoading ? (
              <p className="text-muted-foreground">{t.loading}</p>
            ) : questions.data?.length ? (
              questions.data.map(item => {
                const itemLang = publishedQuestionLanguage(item.language);
                return (
                  <article
                    key={item.id}
                    lang={itemLang}
                    className="editorial-card p-6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Sparkles
                        aria-hidden="true"
                        className="h-5 w-5 text-primary"
                      />
                      {itemLang !== lang && (
                        <span
                          lang={lang}
                          className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          {t.publishedIn[itemLang]}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-4 text-lg font-semibold leading-7">
                      {item.question}
                    </h3>
                    <p className="mt-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      {item.response}
                    </p>
                  </article>
                );
              })
            ) : (
              <p className="rounded-2xl border border-border bg-card/40 p-6 text-muted-foreground">
                {t.empty}
              </p>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

// autoComplete: what the browser may fill the field with (WCAG 1.3.5, A11Y-16).
function Field({
  id,
  label,
  value,
  onChange,
  invalid,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label} *</span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-invalid={invalid}
        className={`form-control block h-11 min-h-11 w-full rounded-none border border-border bg-background/80 px-3 py-0 shadow-inner ${invalid ? "form-field-invalid" : ""}`}
      />
    </label>
  );
}
function Consent({
  id,
  checked,
  onChange,
  invalid,
  required = true,
  children,
}: {
  id?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  invalid: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`form-consent-item flex items-start gap-3 ${invalid ? "form-consent-item-invalid rounded-lg p-3" : ""}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        aria-required={required ? "true" : undefined}
        aria-invalid={invalid}
        className="form-consent-checkbox mt-1"
      />
      <span>
        {children}
        {required && (
          <>
            {" "}
            <span aria-hidden="true">*</span>
          </>
        )}
      </span>
    </label>
  );
}
