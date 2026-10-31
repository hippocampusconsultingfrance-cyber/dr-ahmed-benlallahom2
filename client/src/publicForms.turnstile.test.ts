import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

// Formulaires publics sensibles rendus et utilisés : le bouton d’envoi reste
// désactivé sans jeton Turnstile, et un nouveau défi remplace celui dont le
// jeton a servi (échec d’une candidature, inscription ou demande de lien).

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

type MutationOptions = { onSuccess?: (...args: never[]) => unknown; onError?: (error: unknown) => unknown; onSettled?: () => unknown };
const view = vi.hoisted(() => ({
  mutations: {} as Record<string, { options: MutationOptions; mutate: ReturnType<typeof import("vitest").vi.fn> }>,
}));

vi.mock("@/contexts/LanguageContext", async () => {
  const { contentFr } = await import("@/data/content-fr");
  return { useLanguage: () => ({ language: "fr", content: contentFr }) };
});
vi.mock("@/components/TurnstileWidget", () => ({ TurnstileWidget: function TurnstileWidget() { return null; } }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/LanguageMenu", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()], Link: () => null }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => ({
    useMutation: (options: MutationOptions = {}) => {
      view.mutations[name] ??= { options, mutate: vi.fn() };
      view.mutations[name]!.options = options;
      return { mutate: view.mutations[name]!.mutate, isPending: false };
    },
  });
  return {
    trpc: {
      useUtils: () => ({ candidatePortal: { me: { invalidate: vi.fn() } } }),
      contact: { submit: mutation("contact.submit") },
      gdpr: { submit: mutation("gdpr.submit") },
      candidatePortal: {
        login: mutation("candidatePortal.login"),
        register: mutation("candidatePortal.register"),
        requestPasswordReset: mutation("candidatePortal.requestPasswordReset"),
        resendVerification: mutation("candidatePortal.resendVerification"),
        resolveInvitation: { useQuery: () => ({ data: undefined, isError: false }) },
      },
    },
  };
});

const { TurnstileWidget } = await import("@/components/TurnstileWidget");
const { default: ContactSection } = await import("@/components/ContactSection");
const { default: GDPRRequestForm } = await import("@/components/GDPRRequestForm");
const { default: RecruitmentPage } = await import("@/pages/RecruitmentPage");
const { default: VvipOffshorePage } = await import("@/pages/VvipOffshorePage");
const { default: CandidateAccessPage } = await import("@/pages/CandidateAccessPage");
const { getContactFormCopy, getGdprRequestCopy } = await import("@/lib/publicFormCopy");
const { toast } = await import("sonner");

type Element = { type: unknown; props: Record<string, any>; key?: string | null };
const elements = (component: () => unknown) => elementsOf(renderStateful(component as () => ReactElement)) as Element[];
const submitButton = (component: () => unknown) => elements(component).find(element => element.props.type === "submit")!;
const widget = (component: () => unknown) => elements(component).find(element => element.type === TurnstileWidget);
/** Opens a form of the candidate space with its button (login, register, forgot, activation, in this order). */
function openCandidateMode(mode: "login" | "register" | "forgot" | "activation") {
  const buttons = elements(CandidateAccessPage).filter(element => element.type === "button" && element.props["aria-controls"] === "candidate-access-form");
  buttons[["login", "register", "forgot", "activation"].indexOf(mode)]!.props.onClick();
}
const byId = (component: () => unknown, id: string) => elements(component).find(element => element.props.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  view.mutations = {};
  vi.stubGlobal("window", { location: { search: "", href: "https://drahmedbenlallahom.com/" }, requestAnimationFrame: vi.fn(), scrollTo: vi.fn() });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), getElementById: () => ({ focus: vi.fn() }) });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  resetStatefulHooks();
  vi.unstubAllGlobals();
});

describe("garde-fous Turnstile des parcours publics", () => {
  it.each([
    ["le formulaire de contact", ContactSection],
    ["la demande RGPD", () => GDPRRequestForm({ onBack: () => undefined })],
    ["la candidature standard", RecruitmentPage],
    ["la candidature VVIP offshore", VvipOffshorePage],
  ] as const)("bloque l’envoi de %s sans jeton Turnstile", (_label, component) => {
    expect(widget(component)).toBeDefined();
    expect(submitButton(component).props.disabled).toBe(true);

    widget(component)!.props.onToken("turnstile-token-from-the-widget");
    expect(submitButton(component).props.disabled).toBe(false);

    // Expired or failed challenge: the widget hands back null.
    widget(component)!.props.onToken(null);
    expect(submitButton(component).props.disabled).toBe(true);
  });

  it("renouvelle automatiquement le contrôle recrutement après un échec serveur", async () => {
    class FormDataFromState extends FormData { constructor() { super(); } }
    vi.stubGlobal("FormData", FormDataFromState);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "Service indisponible" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const page = RecruitmentPage;
    const change = (id: string, event: unknown) => byId(page, id).props.onChange(event);

    change("recruitment-firstName", { target: { value: "Amina" } });
    change("recruitment-lastName", { target: { value: "Haddad" } });
    change("recruitment-email", { target: { value: "amina@example.org" } });
    change("recruitment-specialty", { target: { value: "Médecine d’urgence" } });
    byId(page, "recruitment-diploma-country-search").props.onInput({ currentTarget: { value: "Tunisie" } });
    change("recruitment-target-country-0", {});
    change("recruitment-cv", { target: { files: [new File(["%PDF-1.7\n"], "cv.pdf", { type: "application/pdf" })] } });
    change("recruitment-gdpr-consent", { target: { checked: true } });
    widget(page)!.props.onToken("single-use-token");
    const firstChallenge = widget(page)!.key;

    await elements(page).find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(widget(page)!.key).not.toBe(firstChallenge);
    expect(submitButton(page).props.disabled).toBe(true);
  });

  it.each([
    ["un refus du serveur", async () => new Response(JSON.stringify({ error: "Dossier refusé" }), { status: 400, headers: { "Content-Type": "application/json" } })],
    ["une connexion coupée", async () => { throw new TypeError("Failed to fetch"); }],
  ] as const)("renouvelle le contrôle VVIP offshore après %s", async (_label, answer) => {
    class FormDataFromState extends FormData { constructor() { super(); } }
    vi.stubGlobal("FormData", FormDataFromState);
    const fetch = vi.fn(answer);
    vi.stubGlobal("fetch", fetch);
    const page = VvipOffshorePage;
    const change = (id: string, event: unknown) => byId(page, id).props.onChange(event);

    change("vvip-firstName", { target: { value: "Karim" } });
    change("vvip-lastName", { target: { value: "Saidi" } });
    change("vvip-email", { target: { value: "karim@example.org" } });
    change("vvip-specialty", { target: { value: "Médecin urgentiste (ATLS / ACLS)" } });
    change("vvip-environment-0", {});
    change("vvip-diploma-country", { target: { value: "Tunisie" } });
    change("vvip-cv", { target: { files: [new File(["%PDF-1.7\n"], "cv.pdf", { type: "application/pdf" })] } });
    change("vvip-gdpr-consent", { target: { checked: true } });
    widget(page)!.props.onToken("single-use-token");
    const firstChallenge = widget(page)!.key;

    await elements(page).find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(widget(page)!.key).not.toBe(firstChallenge);
    expect(submitButton(page).props.disabled).toBe(true);
  });

  it.each([
    ["register", "candidatePortal.register"],
    ["forgot", "candidatePortal.requestPasswordReset"],
    ["activation", "candidatePortal.resendVerification"],
  ] as const)("renouvelle le contrôle de l’espace candidat après chaque demande (%s, REC-03)", (mode, mutation) => {
    const page = CandidateAccessPage;
    // No challenge to sign in normally; the mode buttons open the other forms.
    expect(widget(page)).toBeUndefined();
    openCandidateMode(mode);
    const first = widget(page)!;
    expect(first.key).toBe(`${mode}-0`);

    first.props.onToken("single-use-token");
    view.mutations[mutation]!.options.onSettled!();
    expect(widget(page)!.key).toBe(`${mode}-1`);
  });

  it("renouvelle aussi le contrôle après un refus de connexion", () => {
    const page = CandidateAccessPage;
    expect(widget(page)).toBeUndefined();
    // Many failures on this email: the server asks for the challenge, a fresh one each time.
    view.mutations["candidatePortal.login"]!.options.onError!({ message: "Refus", data: { code: "PRECONDITION_FAILED" } });
    expect(widget(page)!.key).toBe("login-1");
    view.mutations["candidatePortal.login"]!.options.onError!({ message: "Refus", data: { code: "PRECONDITION_FAILED" } });
    expect(widget(page)!.key).toBe("login-2");
  });
});

describe("retours publics après soumission", () => {
  const textOf = (node: unknown): string => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (typeof node === "object" && "props" in (node as object)) return textOf((node as Element).props.children);
    return "";
  };
  const submit = (component: () => unknown) => elements(component).find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn() });

  it("refuse un message de contact sans consentement, puis confirme l’envoi par un panneau explicite", () => {
    const copy = getContactFormCopy("fr");
    widget(ContactSection)!.props.onToken("turnstile-token-from-the-widget");
    submit(ContactSection);
    expect(toast.error).toHaveBeenCalledWith(copy.consentRequired);
    expect(view.mutations["contact.submit"]!.mutate).not.toHaveBeenCalled();

    view.mutations["contact.submit"]!.options.onSuccess!();
    const confirmation = elements(ContactSection);
    expect(confirmation.find(element => String(element.props.className ?? "").includes("success-panel"))).toBeDefined();
    expect(textOf(confirmation)).toContain(copy.successTitle);
    expect(confirmation.find(element => element.type === "form")).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith(copy.sent);
  });

  it("confirme la réception d’une demande RGPD", () => {
    const form = () => GDPRRequestForm({ onBack: () => undefined });
    elements(form);
    view.mutations["gdpr.submit"]!.options.onSuccess!();
    const confirmation = elements(form);
    expect(textOf(confirmation)).toContain(getGdprRequestCopy("fr").received);
    expect(confirmation.find(element => element.type === "form")).toBeUndefined();
  });

  it("signale le consentement obligatoire du contact en erreur après une tentative d’envoi", () => {
    const consentItem = () => elements(ContactSection).find(element => String(element.props.className ?? "").includes("contact-consent"))!;
    expect(consentItem().props.className).not.toContain("form-consent-item-invalid");
    submit(ContactSection);
    expect(consentItem().props.className).toContain("form-consent-item-invalid");
  });

  it("signale les consentements candidat manquants après une tentative d’inscription", () => {
    openCandidateMode("register");
    const consentItems = () => elements(CandidateAccessPage).filter(element => String(element.props.className ?? "").startsWith("candidate-consent-item"));
    expect(consentItems().map(item => item.props.className.includes("candidate-consent-item-invalid"))).toEqual([false, false]);
    submit(CandidateAccessPage);
    expect(consentItems().map(item => item.props.className.includes("candidate-consent-item-invalid"))).toEqual([true, true]);
    expect(view.mutations["candidatePortal.register"]!.mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["la candidature standard", RecruitmentPage, "recruitment-firstName"],
    ["la candidature VVIP offshore", VvipOffshorePage, "vvip-firstName"],
  ] as const)("marque les champs requis de %s en erreur après un envoi incomplet", (_label, page, firstField) => {
    class FormDataFromState extends FormData { constructor() { super(); } }
    vi.stubGlobal("FormData", FormDataFromState);
    expect(byId(page, firstField).props["aria-invalid"]).toBeFalsy();
    elements(page).find(element => element.type === "form")!.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });
    const field = byId(page, firstField);
    expect(field.props["aria-invalid"]).toBe(true);
    expect(field.props.className).toContain("form-field-invalid");
    expect(elements(page).some(element => String(element.props.className ?? "").includes("form-file-invalid"))).toBe(true);
  });
});
