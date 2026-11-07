// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Page Employeurs montée par React dans un DOM, dans chacune des quatre langues.
const { default: EmployersPage, employerCopy } = await import("./EmployersPage");
const { ThemeProvider } = await import("@/contexts/ThemeContext");
const { LanguageProvider } = await import("@/contexts/LanguageContext");
const { siteConfig } = await import("@/data/site-config");

type Language = keyof typeof employerCopy;

function mount(language: Language) {
  localStorage.setItem("language", language);
  return render(createElement(ThemeProvider, null, createElement(LanguageProvider, null, createElement(EmployersPage))));
}

/** Fills the required fields and sends the brief to a fake /api/client-briefs answering `status` and `body`. */
async function submitBrief(language: Language, status: number, body: Record<string, unknown>) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mount(language);
  for (const [id, value] of [["employer-organizationName", "Clinique du Golfe"], ["employer-contactName", "Dr. Haddad"], ["employer-email", "rh@clinique.example"], ["employer-specialtyNeeded", "Anesthésiste"], ["employer-country", "Qatar"]]) {
    fireEvent.change(document.getElementById(id)!, { target: { value } });
  }
  // What the environment menu shows when the brief leaves (left untouched).
  const shownEnvironment = (document.querySelector("form select") as HTMLSelectElement).value;
  fireEvent.submit(document.getElementById("employer-email")!.closest("form")!);
  const alertOrSuccess = await screen.findByRole(status === 200 ? "status" : "alert");
  return { shownEnvironment, text: alertOrSuccess.textContent ?? "", sent: JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as Record<string, unknown> };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pages orphelines reliées (PUB-NAV-01)", () => {
  it.each(["fr", "en", "de", "zh"] as const)("%s : la page Employeurs mène à /why-hippocampus", language => {
    mount(language);

    const link = screen.getByRole("link", { name: employerCopy[language].whyLink });
    expect(link.getAttribute("href")).toBe("/why-hippocampus");
  });
});

describe("brief employeur : valeur enregistrée, refus du serveur et information RGPD (REC-12)", () => {
  it.each(["fr", "en"] as const)("%s : enregistre l’environnement que le menu affiche au départ (la 1re option), et envoie la langue de la page", async language => {
    const { shownEnvironment, sent } = await submitBrief(language, 200, { success: true, briefId: "BRIEFABCDEFGHJKLM" });

    expect(sent.targetEnvironment).toBe(shownEnvironment);
    expect(sent.targetEnvironment).toBe("Hôpital / Clinique internationale");
    expect(sent.language).toBe(language);
    expect(screen.getByText("BRIEFABCDEFGHJKLM")).toBeTruthy();
  });

  it.each([["fr", "sous 24 h ouvrées"], ["en", "within 24 business hours"]] as const)("%s : promet, avant et après l’envoi, un premier contact %s, comme l’accusé, et plus de shortlist sous 24 h", async (language, firstContact) => {
    const { text } = await submitBrief(language, 200, { success: true, briefId: "BRIEFABCDEFGHJKLM" });
    expect(text).toContain(firstContact);
    cleanup();
    mount(language);
    const intro = screen.getByRole("heading", { name: employerCopy[language].formTitle }).nextElementSibling!.textContent!;
    expect(intro).toContain(firstContact);
    expect(intro.toLowerCase()).not.toContain("shortlist");
  });

  it.each(["fr", "en", "de", "zh"] as const)("%s : dit que la limite est atteinte (429) au lieu de « vérifiez vos informations », sans le texte français du serveur", async language => {
    const serverText = "Trop de demandes ont été envoyées. Veuillez patienter avant de soumettre un nouveau brief.";
    const { text } = await submitBrief(language, 429, { error: serverText, code: "rate_limited" });

    expect(text).toBe(employerCopy[language].rateLimited.replace("{email}", siteConfig.email));
    expect(text).not.toBe(employerCopy[language].genericError);
    expect(text).not.toContain(serverText);
  });

  it("dit que le service est indisponible (503) et que le brief n’est pas parti", async () => {
    const { text } = await submitBrief("en", 503, { error: "Service temporairement indisponible.", code: "service_unavailable" });
    expect(text).toBe(employerCopy.en.serviceUnavailable.replace("{email}", siteConfig.email));
  });

  it.each([
    ["fr", "Un champ contient un saut de ligne ou un caractère invisible qui n’y est pas accepté, souvent laissé par un copier-coller : retapez ce texte au clavier, puis renvoyez le formulaire."],
    ["en", "A field contains a line break or an invisible character that is not accepted there, often left by copying and pasting: type that text again on the keyboard, then send the form again."],
    ["de", "Ein Feld enthält einen Zeilenumbruch oder ein unsichtbares Zeichen, das dort nicht zulässig ist, oft ein Rest vom Kopieren und Einfügen: Geben Sie diesen Text erneut über die Tastatur ein und senden Sie das Formular dann erneut."],
    ["zh", "某个字段包含此处不允许的换行符或不可见字符，通常由复制粘贴带入：请用键盘重新输入该内容，然后重新提交表单。"],
  ] as const)("%s : dit de retaper le texte d’un champ refusé pour ses caractères (400 invalid_characters, INTL-05)", async (language, expected) => {
    const serverText = "Texte français écrit par le serveur.";
    const { text } = await submitBrief(language, 400, { error: serverText, code: "invalid_characters" });
    expect(text).toBe(expected);
    expect(text).not.toContain(serverText);
  });

  it("garde le message générique pour un autre échec", async () => {
    const { text } = await submitBrief("en", 500, { error: "Échec de l'enregistrement du brief." });
    expect(text).toBe(employerCopy.en.genericError);
  });

  it.each(["fr", "en", "de", "zh"] as const)("%s : donne, près du bouton d’envoi, l’usage des données et le lien vers la politique de confidentialité", language => {
    mount(language);
    // In the brief form itself, not the footer's link.
    const link = within(document.querySelector("main form") as HTMLElement).getByRole("link", { name: employerCopy[language].privacyLink });
    expect(link.getAttribute("href")).toBe("/legal?tab=privacy");
    expect(link.closest("p")!.textContent).toContain(employerCopy[language].privacyNotice);
  });

  it("laisse le navigateur remplir l’établissement et le nom, pas le pays de la mission avec celui de l’employeur (A11Y-16)", () => {
    mount("fr");
    const autocomplete = (id: string) => document.getElementById(id)!.getAttribute("autocomplete");
    expect(["employer-organizationName", "employer-contactName", "employer-email", "employer-country"].map(autocomplete)).toEqual(["organization", "name", "email", "off"]);
  });
});
