import { FormEvent, useMemo, useRef, useState } from "react";
import { isAcceptedRecruitmentCvFile, RECRUITMENT_CV_ACCEPT_ATTRIBUTE, recruitmentCvRefusalReason } from "@shared/recruitmentCvLimits";
import { CheckCircle2, Clock3, FileUp, Globe2, Loader2, ShieldCheck, UserCheck, Zap, Award, Compass, Lock } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { getWorldwideCountries } from "./RecruitmentPage";
import { resolveCountryForSubmission } from "@/lib/countrySubmission";
import { TurnstileWidget } from "@/components/TurnstileWidget";

export const vvipOffshoreCopy = {
  fr: {
    eyebrow: "Hippocampus Consulting · Missions d’Élite VVIP & Offshore",
    title: "Médecine d’urgence et soins hautement spécialisés en environnements critiques.",
    intro: "Nous recrutons des médecins, urgentistes et personnels paramédicaux d’élite pour des missions exclusives au Moyen-Orient (délégations VVIP et environnements institutionnels), sur les plateformes pétrolières et auprès des grandes sociétés industrielles offshore.",
    nav: "VVIP & Offshore",
    secureChannel: "Canal Sécurisé VVIP",
    formTitle: "Candidature Missions VVIP & Offshore",
    formIntro: "Ces missions requièrent une excellence clinique irréprochable, une résistance au stress éprouvée et des certifications internationales à jour (ATLS, ACLS, HUET/BOSIET selon les sites).",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Email",
    phone: "Téléphone",
    specialty: "Profil recherché / Spécialité",
    environment: "Environnement de prédilection",
    env1: "Moyen-Orient (Gouvernement / VVIP)",
    env2: "Plateformes pétrolières & gazières (Onshore / Offshore)",
    env3: "Sociétés minières & industrielles isolées",
    env4: "Événements internationaux de prestige",
    experience: "Années d’expérience en zone critique",
    experiencePlaceholder: "Ex. 8 ans",
    certifications: "Certifications détenues (ex. ATLS, ACLS, PHTLS, HUET)",
    certificationsPlaceholder: "ATLS, ACLS, HUET, etc.",
    diplomaCountry: "Pays d’obtention du diplôme",
    selectCountry: "Sélectionner le pays",
    cv: "CV détaillé (PDF ou DOCX — 4 Mo max)",
    fileHint: "PDF ou DOCX — 4 Mo max",
    chooseFile: "Choisir un fichier",
    specialties: [
      "Médecin urgentiste (ATLS / ACLS)",
      "Médecin de plateforme / Offshore",
      "Médecin de soins intensifs / Réanimateur",
      "Infirmier(ère) paramédical(e) Offshore / Rig Medic",
      "Infirmier(ère) anesthésiste (IADE) VVIP",
      "Médecin personnel / Concierge VIP",
      "Autre spécialité VVIP / Offshore",
    ],
    gdpr: "J’accepte le traitement de mes données pour l’évaluation de mon profil dans le cadre des missions VVIP et offshore, avec analyse automatisée d’aide à la présélection et revue humaine obligatoire.",
    submit: "Soumettre ma candidature VVIP",
    sending: "Transmission sécurisée…",
    successTitle: "Candidature VVIP enregistrée",
    successText: "Votre dossier a été transmis à notre cellule de recrutement spécialisé. Votre code de suivi confidentiel :",
    backHome: "Retour à l’accueil",
    required: "Veuillez remplir les champs obligatoires et joindre votre CV.",
    fileError: "Veuillez joindre un CV valide au format PDF ou DOCX (max 4 Mo ; le format Word ancien .doc n’est pas accepté).",
    genericError: "Erreur lors de la transmission. Veuillez vérifier vos informations et réessayer.",
    p1Title: "Excellence & Discrétion",
    p1Desc: "Protocoles de confidentialité stricts, habilitations et discrétion absolue exigés pour chaque intervention.",
    p2Title: "Zones d’Intervention",
    p2Desc: "Golfe Persique, Moyen-Orient, plateformes en mer du Nord, Afrique de l’Ouest et chantiers isolés.",
    p3Title: "Standards Internationaux",
    p3Desc: "Accompagnement sur les normes médicales rigoureuses (OGP, Oil & Gas UK, AHA).",
    section2Kicker: "Expertise & Domaines",
    section2Title: "Domaines d’intervention et expertises critiques",
    section2Sub: "Une couverture médicale sur mesure pour les situations où l’infrastructure hospitalière classique n’est pas immédiatement accessible.",
    card1Title: "Délégations VVIP & missions institutionnelles",
    card1Desc: "Présence médicale permanente ou de liaison auprès de délégations officielles et dans des environnements institutionnels exigeants. Maîtrise des protocoles d'évacuation sanitaire d'urgence (EVASAN).",
    card2Title: "Plateformes Pétrolières & Offshore",
    card2Desc: "Prise en charge des traumatismes majeurs, stabilisation en milieu confiné, gestion des intoxications et des urgences chirurgicales sur plates-formes offshores et sites isolés.",
    card3Title: "Chantiers & Sites Miniers Isolat",
    card3Desc: "Mise en place de cliniques de site autonome, gestion de la médecine du travail d'urgence, traçabilité des stocks pharmaceutiques et télé-médecine avancée.",
    clearanceRequired: "Habilitation requise",
    reqKicker: "Standards de Sélection",
    reqTitle: "Exigences et qualifications requises",
    reqSub: "Le recrutement VVIP et Offshore repose sur un filtrage drastique garantissant une sécurité opérationnelle absolue.",
    req1: "Minimum 5 années d’exercice en médecine d’urgence, réanimation ou trauma-center.",
    req2: "Certifications obligatoires à jour : ATLS, ACLS, PHTLS, et HUET / BOSIET pour l'offshore.",
    req3: "Maîtrise bilingue ou multilingue (Français, Anglais, Arabe ou Allemand).",
    req4: "Aptitude psychologique validée pour l'isolement et la gestion de crise sous haute pression.",
    metaTitle: "Recrutement Médical VVIP & Offshore | Hippocampus Consulting",
    metaDescription: "Candidature pour missions médicales d’élite : Moyen-Orient VVIP, plateformes pétrolières, sites offshore et environnements industriels isolés.",
  },
  en: {
    eyebrow: "Hippocampus Consulting · Elite VVIP & Offshore Missions",
    title: "High-acuity emergency medicine in demanding environments.",
    intro: "We recruit elite physicians, emergency doctors, and healthcare professionals for exclusive assignments in the Middle East (VVIP delegations and institutional environments), oil rigs, and major offshore industrial corporations.",
    nav: "VVIP & Offshore",
    secureChannel: "VVIP Secure Channel",
    formTitle: "VVIP & Offshore Application",
    formIntro: "These missions require flawless clinical excellence, proven stress resilience, and up-to-date international certifications (ATLS, ACLS, HUET/BOSIET).",
    firstName: "First name",
    lastName: "Last name",
    email: "Professional email",
    phone: "Phone",
    specialty: "Target Profile / Specialty",
    environment: "Preferred Environment",
    env1: "Middle East (Government / VVIP)",
    env2: "Oil & Gas Rigs (Onshore / Offshore)",
    env3: "Remote Mining & Industrial Sites",
    env4: "Prestigious International Events",
    experience: "Years of experience in critical zones",
    experiencePlaceholder: "e.g. 8 years",
    certifications: "Held certifications (e.g. ATLS, ACLS, PHTLS, HUET)",
    certificationsPlaceholder: "ATLS, ACLS, HUET, etc.",
    diplomaCountry: "Country where diploma was obtained",
    selectCountry: "Select country",
    cv: "Detailed CV (PDF or DOCX — 4 MB max)",
    fileHint: "PDF or DOCX — 4 MB max",
    chooseFile: "Choose a file",
    specialties: [
      "Emergency physician (ATLS / ACLS)",
      "Platform / offshore physician",
      "Intensive care physician",
      "Offshore paramedic / rig medic",
      "VVIP nurse anaesthetist",
      "Private physician / VIP concierge doctor",
      "Other VVIP / offshore specialty",
    ],
    gdpr: "I consent to the processing of my data for VVIP and offshore mission evaluation, including automated pre-screening assistance and mandatory human review.",
    submit: "Submit VVIP Application",
    sending: "Secure transmission…",
    successTitle: "VVIP Application Registered",
    successText: "Your file has been sent to our specialized recruitment unit. Your confidential tracking code:",
    backHome: "Back to Home",
    required: "Please fill in mandatory fields and attach your CV.",
    fileError: "Please attach a valid PDF or DOCX CV (max 4 MB; the legacy Word .doc format is not accepted).",
    genericError: "Transmission error. Please check your information and try again.",
    p1Title: "Excellence & Discretion",
    p1Desc: "Strict confidentiality protocols, clearances, and absolute discretion required for every deployment.",
    p2Title: "Deployment Zones",
    p2Desc: "Persian Gulf, Middle East, North Sea platforms, West Africa, and remote industrial sites.",
    p3Title: "International Standards",
    p3Desc: "Compliance with rigorous medical standards (OGP, Oil & Gas UK, AHA).",
    section2Kicker: "Expertise & Fields",
    section2Title: "Mission Scopes & Critical Expertise",
    section2Sub: "Tailored medical coverage for situations where standard hospital infrastructure is not immediately accessible.",
    card1Title: "VVIP Delegations & Institutional Missions",
    card1Desc: "Permanent or liaison medical presence for official delegations and demanding institutional environments. Mastery of emergency medical evacuation protocols (MEDEVAC).",
    card2Title: "Oil Rigs & Offshore Platforms",
    card2Desc: "Management of major trauma, confinement stabilization, toxicological incidents, and surgical emergencies on offshore rigs and remote installations.",
    card3Title: "Remote Industrial & Mining Sites",
    card3Desc: "Deployment of autonomous site clinics, emergency occupational health management, pharmaceutical stock tracking, and advanced telemedicine.",
    clearanceRequired: "Clearance required",
    reqKicker: "Selection Standards",
    reqTitle: "Mandatory Requirements & Qualifications",
    reqSub: "VVIP and Offshore recruitment relies on rigorous screening ensuring absolute operational safety.",
    req1: "Minimum 5 years of practice in emergency medicine, intensive care, or trauma centers.",
    req2: "Up-to-date mandatory certifications: ATLS, ACLS, PHTLS, and HUET / BOSIET for offshore.",
    req3: "Bilingual or multilingual fluency (French, English, Arabic, or German).",
    req4: "Validated psychological aptitude for isolation and high-pressure crisis management.",
    metaTitle: "VVIP & Offshore Medical Recruitment | Hippocampus Consulting",
    metaDescription: "Apply for elite medical missions: Middle East VVIP, oil rigs, offshore sites, and remote industrial environments.",
  },
  de: {
    eyebrow: "Hippocampus Consulting · Elite VVIP & Offshore Missionen",
    title: "Notfallmedizin und spezialisierte Versorgung in kritischen Umgebungen.",
    intro: "Wir rekrutieren Elite-Ärzte, Notärzte und medizinisches Fachpersonal für exklusive Einsätze im Nahen Osten (höchste Schutzstufen, VVIP), auf Bohrinseln und Offshore-Industriestandorten.",
    nav: "VVIP & Offshore",
    secureChannel: "Sicherer VVIP-Kanal",
    formTitle: "VVIP & Offshore Bewerbung",
    formIntro: "Diese Einsätze erfordern absolute klinische Exzellenz, Stressresistenz und aktuelle internationale Zertifizierungen (ATLS, ACLS, HUET/BOSIET).",
    firstName: "Vorname",
    lastName: "Nachname",
    email: "Berufliche E-Mail",
    phone: "Telefon",
    specialty: "Gesuchtes Profil / Fachgebiet",
    environment: "Bevorzugte Einsatzumgebung",
    env1: "Naher Osten (Regierung / VVIP)",
    env2: "Öl- & Gasplattformen (Onshore / Offshore)",
    env3: "Entlegene Bergbau- & Industriestandorte",
    env4: "Prestigeträchtige internationale Events",
    experience: "Jahre Berufserfahrung in Krisen- / Sonderzonen",
    experiencePlaceholder: "z. B. 8 Jahre",
    certifications: "Zertifikate (z.B. ATLS, ACLS, PHTLS, HUET)",
    certificationsPlaceholder: "ATLS, ACLS, HUET usw.",
    diplomaCountry: "Land des Diplomabschlusses",
    selectCountry: "Land auswählen",
    cv: "Detaillierter Lebenslauf (PDF oder DOCX — max. 4 MB)",
    fileHint: "PDF oder DOCX — max. 4 MB",
    chooseFile: "Datei auswählen",
    specialties: [
      "Notarzt / Notärztin (ATLS / ACLS)",
      "Plattformarzt / Offshore-Arzt",
      "Intensivmediziner / Reanimation",
      "Offshore-Rettungssanitäter / Rig Medic",
      "VVIP-Fachpflege Anästhesie",
      "Privatarzt / VIP-Concierge-Arzt",
      "Andere VVIP- / Offshore-Fachrichtung",
    ],
    gdpr: "Ich stimme der Verarbeitung meiner Daten zur Eignungsprüfung für VVIP- und Offshore-Missionen zu, einschließlich automatisierter Vorauswahl und verpflichtender menschlicher Prüfung.",
    submit: "VVIP-Bewerbung absenden",
    sending: "Sichere Übertragung…",
    successTitle: "VVIP-Bewerbung registriert",
    successText: "Ihre Unterlagen wurden an unser spezialisiertes Recruiting-Team übermittelt. Ihr vertraulicher Tracking-Code:",
    backHome: "Zur Startseite",
    required: "Bitte füllen Sie alle Pflichtfelder aus und fügen Sie Ihren Lebenslauf bei.",
    fileError: "Bitte fügen Sie einen gültigen PDF- oder DOCX-Lebenslauf bei (max. 4 MB; das alte Word-Format .doc wird nicht akzeptiert).",
    genericError: "Übertragungsfehler. Bitte überprüfen Sie Ihre Angaben.",
    p1Title: "Exzellenz & Diskretion",
    p1Desc: "Strikte Vertraulichkeitsprotokolle und absolute Verschwiegenheit.",
    p2Title: "Einsatzregionen",
    p2Desc: "Persischer Golf, Naher Osten, Nordsee-Plattformen und Westafrika.",
    p3Title: "Internationale Standards",
    p3Desc: "Einhaltung strenger Medizinstandards (OGP, Oil & Gas UK, AHA).",
    section2Kicker: "Expertise & Fachgebiete",
    section2Title: "Einsatzbereiche & Kritische Expertise",
    section2Sub: "Maßgeschneiderte medizinische Versorgung für Situationen, in denen keine reguläre Krankenhausinfrastruktur verfügbar ist.",
    card1Title: "VVIP-Delegationen & institutionelle Einsätze",
    card1Desc: "Permanente medizinische Betreuung oder Begleitung für offizielle Delegationen und anspruchsvolle institutionelle Einsatzumgebungen. Beherrschung von Evakuierungsprotokollen (MEDEVAC).",
    card2Title: "Bohrinseln & Offshore-Plattformen",
    card2Desc: "Versorgung schwerer Traumata, Stabilisierung in engen Räumen, Giftunfälle und chirurgische Notfälle auf Bohrinseln.",
    card3Title: "Entlegene Industrie- & Bergbaustandorte",
    card3Desc: "Einrichtung autonomer Standortkliniken, arbeitsmedizinische Notfallversorgung und fortschrittliche Telemedizin.",
    clearanceRequired: "Sicherheitsfreigabe erforderlich",
    reqKicker: "Auswahlstandards",
    reqTitle: "Anforderungen & Qualifikationen",
    reqSub: "Das VVIP- und Offshore-Recruiting basiert auf strengsten Prüfungen zur Gewährleistung absoluter operativer Sicherheit.",
    req1: "Mindestens 5 Jahre Praxis in Notfallmedizin, Intensivmedizin oder Trauma-Zentren.",
    req2: "Gültige Pflichtzertifikate: ATLS, ACLS, PHTLS sowie HUET / BOSIET für den Offshore-Bereich.",
    req3: "Verhandlungssichere Sprachkenntnisse (Französisch, Englisch, Arabisch oder Deutsch).",
    req4: "Nachgewiesene psychologische Eignung für Isolation und Krisenmanagement.",
    metaTitle: "VVIP & Offshore Medizinisches Recruiting | Hippocampus Consulting",
    metaDescription: "Bewerbung für Elite-Medizineinsätze: Naher Osten VVIP, Bohrinseln, Offshore-Standorte.",
  },
  zh: {
    eyebrow: "Hippocampus Consulting · 精英 VVIP 与 离岸海洋工程医疗",
    title: "苛刻环境下的急救医学与高端医疗保障。",
    intro: "我们为中东地区（政府及 VVIP 代表团）、石油钻井平台及大型离岸海洋工程企业招募顶尖医师、急诊-重症 specialist 及专业医护人员。",
    nav: "VVIP & 离岸",
    secureChannel: "VVIP 安全通道",
    formTitle: "VVIP 与离岸任务专属申请",
    formIntro: "此类任务要求卓越的临床能力、出色的抗压素质以及最新的国际权威认证（ATLS、ACLS、HUET/BOSIET）。",
    firstName: "名",
    lastName: "姓",
    email: "职业邮箱",
    phone: "电话",
    specialty: "目标岗位 / 专业方向",
    environment: "倾向工作环境",
    env1: "中东地区（政府 / VVIP）",
    env2: "油气钻井平台（陆上 / 海上 Offshore）",
    env3: "偏远矿业与工业驻地",
    env4: "高端国际峰会与活动",
    experience: "关键环境工作年限",
    experiencePlaceholder: "例如 8 年",
    certifications: "相关专业认证（如 ATLS, ACLS, PHTLS, HUET）",
    certificationsPlaceholder: "ATLS、ACLS、HUET 等",
    diplomaCountry: "文凭获得国家",
    selectCountry: "选择国家",
    cv: "详细简历（PDF 或 DOCX，最大 4 MB）",
    fileHint: "PDF 或 DOCX，最大 4 MB",
    chooseFile: "选择文件",
    specialties: [
      "急诊医师（ATLS / ACLS）",
      "平台 / 离岸医师",
      "重症医学医师",
      "离岸急救医护 / Rig Medic",
      "VVIP 麻醉专科护士",
      "私人医师 / VIP 医疗管家",
      "其他 VVIP / 离岸专业方向",
    ],
    gdpr: "我同意为评估 VVIP 及离岸任务处理我的个人数据，包括自动化筛选辅助与强制性人工审核。",
    submit: "提交 VVIP 申请",
    sending: "安全传输中…",
    successTitle: "VVIP 申请已登记",
    successText: "您的资料已提交至专项招聘组。保密追踪编号：",
    backHome: "返回首页",
    required: "请填写必填项并附加您的简历。",
    fileError: "请附加有效的 PDF 或 DOCX 格式简历（最大 4 MB；不接受旧版 Word .doc 格式）。",
    genericError: "传输错误，请检查信息后重试。",
    p1Title: "卓越与绝对保密",
    p1Desc: "严格的保密协议、安全许可与绝对隐秘。",
    p2Title: "核心派驻区域",
    p2Desc: "波斯湾、中东、北海钻井平台及西非远洋项目。",
    p3Title: "严苛国际标准",
    p3Desc: "全面契合 OGP、Oil & Gas UK 及 AHA 医疗准则。",
    section2Kicker: "专长与领域",
    section2Title: "任务领域与关键专长",
    section2Sub: "在常规医院基础设施无法立即触及的环境中，提供量身定制的医疗保障。",
    card1Title: "VVIP 官方代表团与机构任务",
    card1Desc: "为官方代表团及高要求机构环境提供常驻或随行医疗保障，精通紧急医疗后送（MEDEVAC）程序。",
    card2Title: "海上钻井平台与离岸工程",
    card2Desc: "应对海上平台及偏远设施的严重创伤、密闭空间稳定、中毒事件及外科急症。",
    card3Title: "偏远矿山与工业驻地",
    card3Desc: "建立自主营地诊所、应急职业健康管理、药品库存追溯及高级远程医疗。",
    clearanceRequired: "需具备安全许可",
    reqKicker: "遴选标准",
    reqTitle: "岗位要求与专业资质",
    reqSub: "VVIP 及离岸招聘采用极为严格的筛选标准，以确保绝对的作业安全。",
    req1: "至少 5 年急诊医学、重症医学或创伤中心临床经验。",
    req2: "必须持有有效期内的国际认证：ATLS、ACLS、PHTLS 及离岸 HUET/BOSIET。",
    req3: "精通双语或多语（法语、英语、阿拉伯语或德语）。",
    req4: "具备在隔离环境及高压危机管理下的心理适应能力。",
    metaTitle: "VVIP 与离岸医疗人才招聘 | Hippocampus Consulting",
    metaDescription: "申请精英医疗任务：中东 VVIP、海上钻井平台、离岸工程与偏远工业驻地。",
  },
} as const;

const customSpecialtyCopy = {
  fr: "Précisez votre spécialité médicale ou paramédicale",
  en: "Specify your medical or allied-health specialty",
  de: "Geben Sie Ihr medizinisches oder paramedizinisches Fachgebiet an",
  zh: "请注明您的医疗或医护专业方向",
} as const;

const publicTrustCopy = {
  fr: {
    title: "Traitement confidentiel de votre dossier",
    confidentiality: "Votre dossier est conservé dans un espace privé et n’est consulté que par les personnes habilitées à traiter les missions concernées.",
    consent: "Votre consentement est recueilli avant tout traitement de votre candidature et de vos documents.",
    humanReview: "Les outils d’analyse assistent la lecture du dossier ; aucune décision de recrutement n’est prise automatiquement.",
    timeline: "Délai indicatif : une première revue est généralement engagée sous 5 jours ouvrés, selon les exigences de la mission.",
  },
  en: {
    title: "Confidential handling of your file",
    confidentiality: "Your file is kept in a private area and reviewed only by personnel authorised for the relevant assignments.",
    consent: "Your consent is collected before any processing of your application and documents.",
    humanReview: "Analysis tools assist file review; no recruitment decision is made automatically.",
    timeline: "Indicative timing: an initial review is generally started within 5 business days, depending on assignment requirements.",
  },
  de: {
    title: "Vertrauliche Bearbeitung Ihrer Unterlagen",
    confidentiality: "Ihre Unterlagen werden in einem privaten Bereich aufbewahrt und nur von für die jeweiligen Einsätze berechtigten Personen eingesehen.",
    consent: "Ihre Einwilligung wird vor jeder Verarbeitung Ihrer Bewerbung und Unterlagen eingeholt.",
    humanReview: "Analysetools unterstützen die Prüfung der Unterlagen; keine Einstellungsentscheidung wird automatisiert getroffen.",
    timeline: "Unverbindlicher Zeitraum: Eine erste Prüfung beginnt in der Regel innerhalb von 5 Werktagen, abhängig von den Anforderungen des Einsatzes.",
  },
  zh: {
    title: "您的资料将被保密处理",
    confidentiality: "您的资料存放于私密区域，仅由获授权处理相关任务的人员查阅。",
    consent: "处理您的申请和文件前会征得您的同意。",
    humanReview: "分析工具仅辅助资料审阅；不会自动作出任何招聘决定。",
    timeline: "参考时限：我们通常会在 5 个工作日内启动初步审核，具体取决于任务要求。",
  },
} as const;

/** Translations of the French messages returned by /api/recruitment/apply, by cause. */
const serverErrorCopy = {
  en: {
    securityCheck: "The security check must be renewed before sending.",
    rateLimited: "Too many attempts have been made. Wait one hour before trying again.",
    invalidInformation: "The application details are invalid.",
    unavailable: "The application service is temporarily unavailable.",
    legacyFormat: "CV format not accepted. Use a PDF or a DOCX (the legacy Word .doc format is no longer accepted).",
    tooLargeWhenOpened: "The CV is too large once opened. Save it again as a PDF (for example “File > Export to PDF”) and try again.",
    pageLimit: "The CV must not exceed 25 pages.",
    passwordProtected: "The CV is password-protected. Send a version without a password.",
    activeContent: "The CV contains macros, active content or embedded objects. Save it as a PDF and try again.",
    invalidContent: "The CV content does not match a valid PDF or DOCX document.",
  },
  de: {
    securityCheck: "Die Sicherheitsprüfung muss vor dem Absenden erneuert werden.",
    rateLimited: "Es wurden zu viele Versuche unternommen. Warten Sie eine Stunde, bevor Sie es erneut versuchen.",
    invalidInformation: "Die Bewerbungsangaben sind ungültig.",
    unavailable: "Der Bewerbungsdienst ist vorübergehend nicht verfügbar.",
    legacyFormat: "CV-Format nicht akzeptiert. Verwenden Sie ein PDF oder DOCX (das alte Word-Format .doc wird nicht mehr akzeptiert).",
    tooLargeWhenOpened: "Der Lebenslauf ist nach dem Öffnen zu groß. Speichern Sie ihn erneut als PDF (zum Beispiel „Datei > Als PDF exportieren“) und versuchen Sie es erneut.",
    pageLimit: "Der Lebenslauf darf höchstens 25 Seiten umfassen.",
    passwordProtected: "Der Lebenslauf ist passwortgeschützt. Senden Sie eine Version ohne Passwort.",
    activeContent: "Der Lebenslauf enthält Makros, aktive Inhalte oder eingebettete Objekte. Speichern Sie ihn als PDF und versuchen Sie es erneut.",
    invalidContent: "Der Inhalt des Lebenslaufs entspricht keinem gültigen PDF- oder DOCX-Dokument.",
  },
  zh: {
    securityCheck: "发送前必须重新完成安全验证。",
    rateLimited: "尝试次数过多。请等待一小时后再试。",
    invalidInformation: "申请信息无效。",
    unavailable: "申请服务暂时不可用。",
    legacyFormat: "不接受该简历格式。请使用 PDF 或 DOCX（不再接受旧版 Word .doc 格式）。",
    tooLargeWhenOpened: "简历打开后体积过大。请重新另存为 PDF（例如“文件 > 导出为 PDF”）后重试。",
    pageLimit: "简历不得超过 25 页。",
    passwordProtected: "简历受密码保护。请发送未设密码的版本。",
    activeContent: "简历包含宏、活动内容或嵌入对象。请另存为 PDF 后重试。",
    invalidContent: "简历内容与有效的 PDF 或 DOCX 文档不符。",
  },
} as const;
type ServerErrorCause = keyof typeof serverErrorCopy.en;

/** Codes returned by /api/recruitment/apply next to its message (the CV checks use cv_validation_*). */
const serverErrorCauses = new Map<string, ServerErrorCause>([
  ["recruitment_security_check_required", "securityCheck"],
  ["recruitment_rate_limited", "rateLimited"],
  ["recruitment_application_invalid", "invalidInformation"],
  ["recruitment_service_unavailable", "unavailable"],
]);

/** Values sent to the API whatever the display language (targetCountries and message). */
export const VVIP_ENVIRONMENTS = [
  { value: "Moyen-Orient (Gouvernement / VVIP)", labelKey: "env1" },
  { value: "Plateformes pétrolières & gazières (Onshore / Offshore)", labelKey: "env2" },
  { value: "Sociétés minières & industrielles isolées", labelKey: "env3" },
  { value: "Événements internationaux de prestige", labelKey: "env4" },
] as const;

/** With the "[VVIP / Offshore] " prefix, a free-text specialty stays within the 160 characters accepted by the API (INTL-03). */
export const VVIP_CUSTOM_SPECIALTY_MAX_LENGTH = 140;

type Language = keyof typeof vvipOffshoreCopy;
type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialty: string;
  specialtyCustom: string;
  environments: string[];
  diplomaCountry: string;
  yearsExperience: string;
  certifications: string;
  gdprConsent: boolean;
  website: string;
};

export const createInitialForm = (language: Language): FormState => ({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  specialty: vvipOffshoreCopy[language].specialties[0],
  specialtyCustom: "",
  environments: [],
  diplomaCountry: "",
  yearsExperience: "",
  certifications: "",
  gdprConsent: false,
  website: "",
});

/** Android and iOS file pickers may provide a generic MIME type for a valid CV (PDF or DOCX, 4 MB at most). */
export function isAcceptedVvipCvFile(file: Pick<File, "name" | "size" | "type"> | null): boolean {
  return isAcceptedRecruitmentCvFile(file);
}

/**
 * Multipart body of a VVIP application. The specialty keeps only the VVIP prefix,
 * which marks the pathway and keeps the application apart from a standard one;
 * the environments are sent in targetCountries and in the message (INTL-03).
 */
export function buildVvipApplicationFormData({ form, cv, specialty, diplomaCountry, turnstileToken }: { form: FormState; cv: File; specialty: string; diplomaCountry: string; turnstileToken: string }): FormData {
  const body = new FormData();
  body.append("cv", cv);
  body.append("firstName", form.firstName);
  body.append("lastName", form.lastName);
  body.append("email", form.email);
  body.append("phone", form.phone);
  const environmentSummary = form.environments.join(", ");
  body.append("specialty", `[VVIP / Offshore] ${specialty}`);
  body.append("diplomaCountry", diplomaCountry);
  body.append("targetCountries", JSON.stringify(form.environments));
  body.append("languages", JSON.stringify(["Français", "Anglais"]));
  body.append("yearsExperience", form.yearsExperience ? String(Number(form.yearsExperience)) : "5");
  body.append("certifications", form.certifications);
  body.append("message", `Mission VVIP / Offshore. Environnements: ${environmentSummary}. Certifications: ${form.certifications}`);
  body.append("gdprConsent", "1");
  body.append("marketingConsent", "0");
  body.append("website", form.website);
  body.append("turnstileToken", turnstileToken);
  return body;
}

/**
 * Message shown when the API refuses an application. A refusal the page knows
 * (by its code, or a CV refusal without one) shows the server's own message in
 * French and its translation in the other languages; anything else, such as a
 * technical upload error, stays generic.
 */
export function vvipSubmissionErrorMessage(payload: { error?: unknown; code?: unknown } | null | undefined, language: Language): string {
  const t = vvipOffshoreCopy[language];
  const serverMessage = typeof payload?.error === "string" ? payload.error.trim() : "";
  if (!serverMessage) return t.genericError;
  const code = typeof payload?.code === "string" ? payload.code : "";
  const cause = code.startsWith("cv_validation_") ? recruitmentCvRefusalReason(code) : serverErrorCauses.get(code);
  if (cause) return language === "fr" ? serverMessage : serverErrorCopy[language][cause];
  // CV size, format or missing file: refused before the content checks, without a code.
  if (serverMessage.includes("CV")) return language === "fr" ? serverMessage : t.fileError;
  return t.genericError;
}

export default function VvipOffshorePage() {
  const { language } = useLanguage();
  const lang = (language in vvipOffshoreCopy ? language : "fr") as Language;
  const t = vvipOffshoreCopy[lang];
  const customSpecialtyLabel = customSpecialtyCopy[lang];
  const trust = publicTrustCopy[lang];
  const [form, setForm] = useState<FormState>(() => createInitialForm(lang));
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(() => new Set());
  const [trackingId, setTrackingId] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const diplomaCountries = useMemo(() => getWorldwideCountries(lang), [lang]);
  const environmentOptions = VVIP_ENVIRONMENTS.map(environment => ({ value: environment.value, label: t[environment.labelKey] }));

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setInvalidFields(previous => { const next = new Set(previous); next.delete(key); return next; });
  };
  const isInvalid = (field: string) => validationAttempted && invalidFields.has(field);
  const toggleEnvironment = (environment: string) => update("environments", form.environments.includes(environment) ? form.environments.filter(item => item !== environment) : [...form.environments, environment]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setValidationAttempted(true);
    const submittedDiplomaCountry = resolveCountryForSubmission(form.diplomaCountry, new FormData(event.currentTarget).get("diplomaCountry"), diplomaCountries.map(country => country.label));

    const nextInvalidFields = new Set<string>();
    if (!form.firstName.trim()) nextInvalidFields.add("firstName");
    if (!form.lastName.trim()) nextInvalidFields.add("lastName");
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) nextInvalidFields.add("email");
    const isCustomSpecialty = form.specialty === t.specialties[t.specialties.length - 1];
    const finalSpecialty = isCustomSpecialty ? form.specialtyCustom.trim() : form.specialty;
    if (!finalSpecialty) nextInvalidFields.add(isCustomSpecialty ? "specialtyCustom" : "specialty");
    if (!form.environments.length) nextInvalidFields.add("environments");
    if (!submittedDiplomaCountry) nextInvalidFields.add("diplomaCountry");
    if (!file || !isAcceptedVvipCvFile(file)) nextInvalidFields.add("cv");
    if (!form.gdprConsent) nextInvalidFields.add("gdprConsent");
    if (!turnstileToken) nextInvalidFields.add("turnstile");
    if (nextInvalidFields.size) {
      setInvalidFields(nextInvalidFields);
      setStatus("error");
      setErrorMessage(nextInvalidFields.has("cv") ? t.fileError : t.required);
      return;
    }
    setInvalidFields(new Set());
    if (!file) return;
    if (!turnstileToken) return;

    setStatus("sending");
    try {
      const body = buildVvipApplicationFormData({ form, cv: file, specialty: finalSpecialty, diplomaCountry: submittedDiplomaCountry, turnstileToken });
      const res = await fetch("/api/recruitment/apply", {
        method: "POST",
        body,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(vvipSubmissionErrorMessage(payload, lang));
        return;
      }

      if (typeof payload.trackingId !== "string" || !payload.trackingId) throw new Error(t.genericError);
      setTrackingId(payload.trackingId);
      setValidationAttempted(false);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      console.error("VVIP application submission error:", err);
      setErrorMessage(t.genericError);
    } finally {
      // A Turnstile token is single use: always render a fresh challenge after an attempt.
      setTurnstileToken(null);
      setTurnstileAttempt(value => value + 1);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={t.metaTitle} description={t.metaDescription} ogUrl="https://drahmedbenlallahom.com/recruitment/vvip-offshore" />
      <Navigation />
      <main className="pt-32 md:pt-40 pb-24">
        {/* Hero Section */}
        <section className="container max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <p className="section-kicker">{t.eyebrow}</p>
              <h1 className="mt-4 font-display text-4xl leading-tight text-foreground md:text-5xl lg:text-6xl">{t.title}</h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">{t.intro}</p>

              <div className="mt-10 grid gap-6 sm:grid-cols-3">
                {[
                  { icon: ShieldCheck, title: t.p1Title, desc: t.p1Desc },
                  { icon: Compass, title: t.p2Title, desc: t.p2Desc },
                  { icon: Award, title: t.p3Title, desc: t.p3Desc },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="editorial-card p-5">
                      <div className="rounded-xl bg-primary/10 p-3 text-primary w-fit">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 font-display text-lg text-foreground">{item.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Application Form */}
            <div className="editorial-card p-6 md:p-8">
              {status === "success" ? (
                <div className="py-12 text-center" role="status">
                  <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
                  <h2 className="mt-6 font-display text-3xl text-foreground">{t.successTitle}</h2>
                  <p className="mx-auto mt-4 max-w-md text-muted-foreground">{t.successText}</p>
                  <p className="mt-4 rounded-xl bg-primary/10 px-6 py-4 font-mono text-xl font-bold text-primary">{trackingId}</p>
                  <Link href="/" className="cta-primary mt-8 inline-flex">{t.backHome}</Link>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 text-primary">
                    <Lock className="h-5 w-5" />
                    <span className="text-xs font-semibold uppercase tracking-wider">{t.secureChannel}</span>
                  </div>
                  <h2 className="mt-2 font-display text-2xl md:text-3xl text-foreground">{t.formTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.formIntro}</p>
                  <section className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4" aria-labelledby="vvip-public-trust-title">
                    <h3 id="vvip-public-trust-title" className="font-semibold text-foreground">{trust.title}</h3>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                      <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{trust.confidentiality}</span></li>
                      <li className="flex gap-2"><UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{trust.consent}</span></li>
                      <li className="flex gap-2"><UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{trust.humanReview}</span></li>
                      <li className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>{trust.timeline}</span></li>
                    </ul>
                  </section>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block w-full space-y-1.5 text-sm text-foreground">
                        <span className="block font-medium">{t.firstName} *</span>
                        <input required value={form.firstName} aria-invalid={isInvalid("firstName")} onChange={(e) => update("firstName", e.target.value)} className={`form-control block w-full ${isInvalid("firstName") ? "form-field-invalid" : ""}`} autoComplete="given-name" />
                      </label>
                      <label className="block w-full space-y-1.5 text-sm text-foreground">
                        <span className="block font-medium">{t.lastName} *</span>
                        <input required value={form.lastName} aria-invalid={isInvalid("lastName")} onChange={(e) => update("lastName", e.target.value)} className={`form-control block w-full ${isInvalid("lastName") ? "form-field-invalid" : ""}`} autoComplete="family-name" />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block w-full space-y-1.5 text-sm text-foreground">
                        <span className="block font-medium">{t.email} *</span>
                        <input type="email" required value={form.email} aria-invalid={isInvalid("email")} onChange={(e) => update("email", e.target.value)} className={`form-control block w-full ${isInvalid("email") ? "form-field-invalid" : ""}`} autoComplete="email" />
                      </label>
                      <label className="block w-full space-y-1.5 text-sm text-foreground">
                        <span className="block font-medium">{t.phone}</span>
                        <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="form-control block w-full" autoComplete="tel" />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block w-full space-y-1.5 text-sm text-foreground">
                        <span className="block font-medium">{t.specialty} *</span>
                        <select value={form.specialty} aria-invalid={isInvalid("specialty")} onChange={(e) => update("specialty", e.target.value)} className={`form-control block w-full ${isInvalid("specialty") ? "form-field-invalid" : ""}`}>
                          {t.specialties.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        {form.specialty === t.specialties[t.specialties.length - 1] && (
                          <input
                            id="vvip-specialty-custom"
                            required
                            maxLength={VVIP_CUSTOM_SPECIALTY_MAX_LENGTH}
                            value={form.specialtyCustom}
                            aria-invalid={isInvalid("specialtyCustom")}
                            onChange={(e) => update("specialtyCustom", e.target.value)}
                            className={`form-control block w-full ${isInvalid("specialtyCustom") ? "form-field-invalid" : ""}`}
                            placeholder={`${customSpecialtyLabel} *`}
                          />
                        )}
                      </label>
                      <fieldset className={`block w-full space-y-2 text-sm text-foreground ${isInvalid("environments") ? "form-consent-group-invalid" : ""}`}>
                        <legend className="block font-medium">{t.environment} *</legend>
                        <div className="grid gap-2">
                          {environmentOptions.map(option => <label key={option.value} className="form-consent-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground"><input type="checkbox" checked={form.environments.includes(option.value)} aria-invalid={isInvalid("environments")} onChange={() => toggleEnvironment(option.value)} className="form-consent-checkbox" />{option.label}</label>)}
                        </div>
                      </fieldset>
                    </div>

                    <label className="block w-full space-y-1.5 text-sm text-foreground">
                      <span className="block font-medium">{t.diplomaCountry} *</span>
                      <select name="diplomaCountry" required value={form.diplomaCountry} aria-invalid={isInvalid("diplomaCountry")} onInput={(e) => update("diplomaCountry", e.currentTarget.value)} onChange={(e) => update("diplomaCountry", e.target.value)} className={`form-control block w-full ${isInvalid("diplomaCountry") ? "form-field-invalid" : ""}`} autoComplete="country-name">
                        <option value="">{t.selectCountry}</option>
                        {diplomaCountries.map(country => <option key={country.code} value={country.label}>{country.label}</option>)}
                      </select>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block w-full space-y-1.5 text-sm text-foreground">
                        <span className="block font-medium">{t.experience}</span>
                        <input type="number" min="0" max="50" value={form.yearsExperience} onChange={(e) => update("yearsExperience", e.target.value)} className="form-control block w-full" placeholder={t.experiencePlaceholder} />
                      </label>
                      <label className="block w-full space-y-1.5 text-sm text-foreground">
                        <span className="block font-medium">{t.certifications}</span>
                        <input value={form.certifications} onChange={(e) => update("certifications", e.target.value)} className="form-control block w-full" placeholder={t.certificationsPlaceholder} />
                      </label>
                    </div>

                    <div className="space-y-2">
                      <input
                        ref={fileInputRef}
                        id="vvip-cv"
                        type="file"
                        required
                        accept={RECRUITMENT_CV_ACCEPT_ATTRIBUTE}
                        className="peer sr-only"
                        aria-invalid={isInvalid("cv")}
                        aria-describedby="vvip-cv-hint"
                        onChange={(e) => { setFile(e.target.files?.[0] || null); setInvalidFields(previous => { const next = new Set(previous); next.delete("cv"); return next; }); }}
                      />
                      <label
                        htmlFor="vvip-cv"
                        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/70 bg-card/50 p-6 text-center transition-all hover:border-primary/60 hover:bg-card peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${isInvalid("cv") ? "form-file-invalid" : ""}`}
                      >
                        <span className="block text-sm font-medium text-foreground">{t.cv} *</span>
                        <FileUp className="mt-3 h-8 w-8 text-primary transition-transform group-hover:scale-110" aria-hidden="true" />
                        <span className="mt-3 text-sm font-medium text-foreground">
                          {file ? file.name : t.chooseFile}
                        </span>
                        <span id="vvip-cv-hint" className="mt-1 text-xs text-muted-foreground">{t.fileHint}</span>
                      </label>
                    </div>

                    <label className={`form-consent-item flex items-start gap-3 cursor-pointer text-xs text-muted-foreground ${isInvalid("gdprConsent") ? "form-consent-item-invalid" : ""}`}>
                      <input
                        type="checkbox"
                        required
                        checked={form.gdprConsent}
                        aria-invalid={isInvalid("gdprConsent")}
                        onChange={(e) => update("gdprConsent", e.target.checked)}
                        className="form-consent-checkbox mt-0.5"
                      />
                      <span>{t.gdpr}</span>
                    </label>

                    <label className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
                      <span>Website</span>
                      <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website", e.target.value)} />
                    </label>

                    <div className={isInvalid("turnstile") ? "rounded-xl border border-destructive/50 p-2" : ""}><TurnstileWidget key={turnstileAttempt} onToken={setTurnstileToken} /></div>
                    {status === "error" && (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{errorMessage}</p>
                    )}

                    <button type="submit" disabled={status === "sending" || !turnstileToken} className="cta-primary w-full justify-center">
                      {status === "sending" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.sending}</> : t.submit}
                    </button>
                    </form>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Detailed Expertise Section */}
        <section className="container max-w-6xl mt-24">
          <div className="text-center max-w-2xl mx-auto">
            <p className="section-kicker">{t.section2Kicker}</p>
            <h2 className="mt-3 font-display text-3xl md:text-4xl text-foreground">{t.section2Title}</h2>
            <p className="mt-4 text-muted-foreground">{t.section2Sub}</p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              { title: t.card1Title, desc: t.card1Desc },
              { title: t.card2Title, desc: t.card2Desc },
              { title: t.card3Title, desc: t.card3Desc },
            ].map((card, idx) => (
              <div key={card.title} className="editorial-card p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-xs text-primary font-semibold tracking-widest">0{idx + 1} // VVIP</span>
                  <h3 className="mt-3 font-display text-xl text-foreground">{card.title}</h3>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{card.desc}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-border/40 flex items-center gap-2 text-xs text-primary font-medium">
                  <ShieldCheck className="h-4 w-4" /> {t.clearanceRequired}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Requirements Section */}
        <section className="container max-w-6xl mt-24">
          <div className="editorial-card p-8 md:p-12 relative overflow-hidden bg-gradient-to-br from-card via-card to-background">
            <div className="max-w-2xl">
              <span className="section-kicker">{t.reqKicker}</span>
              <h2 className="mt-3 font-display text-3xl text-foreground">{t.reqTitle}</h2>
              <p className="mt-3 text-muted-foreground">{t.reqSub}</p>

              <ul className="mt-8 space-y-4">
                {[t.req1, t.req2, t.req3, t.req4].map((req, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm leading-6 text-foreground">{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
