// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  buildBookingConfirmationEmail,
  buildCandidatePortalAccessEmail,
  buildHippocampusEmailShell,
  buildInvoiceEmail,
  buildRecruitmentTemplateEmail,
  buildRefundEmail,
} from "./notifications";
import { buildOwnerNotificationEmail } from "./notification";
import { resolveConsultationContact } from "../consultationContact";

// MAIL-09, MAIL-10, MAIL-11, MAIL-12, A11Y-21 — the common frame of the
// emails, read as a mail client reads it: the document, its tables, its
// header, footer, buttons and inbox preview.

const NIGHT_APPOINTMENT = new Date("2026-10-15T22:30:00.000Z");
const contact = resolveConsultationContact({});

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
/** The header's two lines: the eyebrow, then the name. */
const headerName = (document: Document) => Array.from(document.querySelectorAll('td[bgcolor="#071827"] div'), line => line.textContent).join(" ");
const footerOf = (document: Document) => Array.from(document.querySelectorAll("td")).at(-1)!;
const preheaderOf = (document: Document) => {
  const first = document.body.firstElementChild as HTMLElement | null;
  return first?.tagName === "DIV" && first.style.display === "none" ? first.textContent!.replace(/[͏‌ ]/g, "").trim() : null;
};

function channel(hex: string, offset: number) {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string) {
  const color = hex.replace("#", "").toLowerCase();
  return 0.2126 * channel(color, 0) + 0.7152 * channel(color, 2) + 0.0722 * channel(color, 4);
}
/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
const toHex = (color: string) => {
  const rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
  return rgb ? `#${rgb.slice(1).map(part => Number(part).toString(16).padStart(2, "0")).join("")}` : color;
};

describe("identité visuelle des emails (MAIL-09)", () => {
  it("encadre les emails du recrutement à l’en-tête d’Hippocampus Consulting, logo inchangé et décoratif", () => {
    const document = parse(buildHippocampusEmailShell("<p>Contenu test</p>"));
    expect(headerName(document)).toBe("ABL / HIPPOCAMPUS Hippocampus Consulting");
    const logo = document.querySelector("img")!;
    expect(logo.getAttribute("src")).toBe("https://drahmedbenlallahom.com/assets/abl-logo.svg");
    // The name is written beside it: a screen reader no longer reads it twice.
    expect(logo.getAttribute("alt")).toBe("");
    expect(footerOf(document).textContent).toMatch(/^Hippocampus Consulting/);
    expect(document.body.textContent).toContain("Contenu test");
  });

  it("signe la réservation au nom du Dr Ahmed Ben Lallahom, sans en-tête ni pied Hippocampus, et toujours « Dr » sans point", () => {
    const confirmation = buildBookingConfirmationEmail({ customerName: "Patient Test", trackingId: "APTBRAND0001", appointmentDate: NIGHT_APPOINTMENT, finalPrice: 100 }, contact);
    const document = parse(confirmation.html);
    expect(headerName(document)).toBe("MD, DESAIC Dr Ahmed Ben Lallahom");
    expect(footerOf(document).textContent).toMatch(/^Dr Ahmed Ben Lallahom/);
    expect(confirmation.html).not.toContain("Hippocampus");
    expect(confirmation.text.trimEnd().split("\n").at(-1)).toBe("Dr Ahmed Ben Lallahom");
    for (const email of [confirmation, buildRecruitmentTemplateEmail("Amina", "CV-2026", "profile_interest"), buildCandidatePortalAccessEmail({ to: "a@example.test", firstName: "Aisha", kind: "verify", actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=t" })]) {
      expect(email.html).not.toMatch(/Dr\.\s/);
    }
  });

  it("écrit le pied de page dans la langue de l’email, avec le site et la politique de confidentialité (MAIL-07)", () => {
    const links = (html: string) => Array.from(footerOf(parse(html)).querySelectorAll("a"), link => [link.textContent, link.getAttribute("href")]);
    const french = buildHippocampusEmailShell("<p>Test</p>", "fr");
    const english = buildHippocampusEmailShell("<p>Test</p>", "en");
    expect(links(french)).toEqual([["Site", "https://drahmedbenlallahom.com/?lang=fr"], ["Politique de confidentialité", "https://drahmedbenlallahom.com/legal?tab=privacy&lang=fr"]]);
    expect(links(english)).toEqual([["Website", "https://drahmedbenlallahom.com/?lang=en"], ["Privacy policy", "https://drahmedbenlallahom.com/legal?tab=privacy&lang=en"]]);
    expect(footerOf(parse(french)).textContent).toContain("Communication professionnelle et confidentielle");
    expect(footerOf(parse(english)).textContent).toContain("Professional and confidential communication");
    expect(footerOf(parse(english)).textContent).not.toMatch(/Communication professionnelle|Politique|Site\b/);
  });

  it("applique le shell au modèle de recrutement, avec un lien vers le formulaire RGPD (MAIL-07)", () => {
    const french = parse(buildRecruitmentTemplateEmail("Dr Test", "REC-123", "profile_interest").html);
    expect(headerName(french)).toBe("ABL / HIPPOCAMPUS Hippocampus Consulting");
    expect(french.body.textContent).toContain("REC-123");
    const gdpr = (document: Document) => Array.from(document.querySelectorAll("a")).find(link => link.getAttribute("href")?.includes("/gdpr"));
    expect([gdpr(french)?.textContent, gdpr(french)?.getAttribute("href")]).toEqual(["formulaire RGPD", "https://drahmedbenlallahom.com/gdpr?lang=fr"]);
    const english = parse(buildRecruitmentTemplateEmail("Amina", "REC-123", "additional_information", { language: "en" }).html);
    expect([gdpr(english)?.textContent, gdpr(english)?.getAttribute("href")]).toEqual(["GDPR form", "https://drahmedbenlallahom.com/gdpr?lang=en"]);
  });
});

describe("structure des emails (A11Y-21, MAIL-10)", () => {
  it("est un document dans la langue de l’email, titré de son sujet", () => {
    const english = buildRefundEmail({ customerName: "John Smith", trackingId: "APTSTRUCT001", appointmentDate: NIGHT_APPOINTMENT, refundAmount: "150.00", context: "practitioner_cancellation", language: "en" }, contact);
    const document = parse(english.html);
    expect(english.html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(document.title).toBe(english.subject);
    expect(parse(buildHippocampusEmailShell("<p>Test</p>")).documentElement.getAttribute("lang")).toBe("fr");
    expect(parse(buildHippocampusEmailShell("<p>Test</p>")).title).toBe("Hippocampus Consulting");
  });

  it("place le contenu dans une table centrée de 600 px, plus étroite sur mobile et tenue à 600 px dans Outlook", () => {
    const html = buildHippocampusEmailShell("<p>Contenu</p>");
    const document = parse(html);
    const content = Array.from(document.querySelectorAll("table")).find(table => table.style.maxWidth === "600px")!;
    expect(content.getAttribute("role")).toBe("presentation");
    expect(content.getAttribute("width")).toBe("100%");
    expect((content.parentElement as HTMLTableCellElement).getAttribute("align")).toBe("center");
    expect(content.textContent).toContain("Contenu");
    // Outlook for Windows ignores max-width: its own table holds the width.
    expect(html).toMatch(/<!--\[if mso\]><table role="presentation" width="600"[^>]*><tr><td><!\[endif\]-->/);
    // No layout left to a div's max-width, which Outlook ignores.
    expect(Array.from(document.querySelectorAll("div")).filter(div => div.style.maxWidth && div.style.display !== "none")).toEqual([]);
  });

  it("met la notification au propriétaire dans le même cadre : document français titré, table de 600 px, lignes en <br />", () => {
    const email = buildOwnerNotificationEmail({ reference: "C7EPGD79OKU03", title: "Contact", name: "Jeanne Martin", content: "Ligne 1\nLigne <2>\r\nLigne 3" });
    const document = parse(email.html);
    expect(document.documentElement.getAttribute("lang")).toBe("fr");
    expect(document.title).toBe(email.subject);
    expect(Array.from(document.querySelectorAll("table")).some(table => table.style.maxWidth === "600px")).toBe(true);
    expect(email.html).toMatch(/<!--\[if mso\]><table role="presentation" width="600"/);
    expect(email.html).toContain("Ligne 1<br />Ligne &lt;2&gt;<br />Ligne 3");
    expect(email.html).not.toContain("white-space");
    expect(email.text).toContain("Ligne 1\nLigne <2>\r\nLigne 3");
  });

  it("garde les retours à la ligne d’un motif saisi par le praticien en <br />, échappé", () => {
    const email = buildRefundEmail({ customerName: "Patient Test", trackingId: "APTSTRUCT002", appointmentDate: NIGHT_APPOINTMENT, refundAmount: "150.00", context: "practitioner_cancellation", reason: "Indisponibilité <urgente>\nNous vous recontactons." }, contact);
    expect(email.html).toContain("Indisponibilité &lt;urgente&gt;<br />Nous vous recontactons.");
    expect(email.text).toContain("Motif : Indisponibilité <urgente>\nNous vous recontactons.");
  });
});

describe("boutons des emails (MAIL-10, MAIL-11)", () => {
  const buttonEmails = () => [
    buildCandidatePortalAccessEmail({ to: "a@example.test", firstName: "Aisha", kind: "verify", actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=t" }).html,
    buildCandidatePortalAccessEmail({ to: "a@example.test", firstName: "Aisha", kind: "reset", actionUrl: "https://drahmedbenlallahom.com/candidate/reset-password?token=t", language: "en" }).html,
    buildRefundEmail({ customerName: "Patient Test", trackingId: "APTBUTTON001", appointmentDate: NIGHT_APPOINTMENT, refundAmount: "100.00", context: "practitioner_cancellation" }, contact).html,
  ];

  it("dessine chaque bouton sur une cellule de table colorée, sans dégradé, texte blanc à 4,5:1 au moins", () => {
    for (const html of buttonEmails()) {
      expect(html).not.toMatch(/gradient|display:inline-block/);
      const cells = Array.from(parse(html).querySelectorAll("td[bgcolor]")).filter(cell => cell.querySelector("a"));
      expect(cells).toHaveLength(1);
      const background = cells[0]!.getAttribute("bgcolor")!;
      const text = toHex((cells[0]!.querySelector("a") as HTMLElement).style.color);
      expect(background).toBe("#0e7490");
      expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
    }
    // The former #0891b2 stayed below the AA threshold for 16 px text.
    expect(contrast("#ffffff", "#0891b2")).toBeLessThan(4.5);
  });

  it("propose de choisir un nouveau créneau dans l’email d’annulation, sur la page de réservation dans la langue de l’email (MAIL-07)", () => {
    const button = (html: string) => parse(html).querySelector('td[bgcolor="#0e7490"] a')!;
    const french = buildRefundEmail({ customerName: "Patient Test", trackingId: "APTREBOOK001", appointmentDate: NIGHT_APPOINTMENT, refundAmount: "100.00", context: "practitioner_cancellation" }, contact);
    expect([button(french.html).textContent, button(french.html).getAttribute("href")]).toEqual(["Choisir un nouveau créneau", "https://drahmedbenlallahom.com/booking?lang=fr"]);
    expect(french.text).toContain("Choisir un nouveau créneau : https://drahmedbenlallahom.com/booking?lang=fr");
    const english = buildRefundEmail({ customerName: "John Smith", trackingId: "APTREBOOK002", appointmentDate: NIGHT_APPOINTMENT, refundAmount: "100.00", context: "practitioner_cancellation", language: "en" }, contact);
    expect([button(english.html).textContent, button(english.html).getAttribute("href")]).toEqual(["Choose a new slot", "https://drahmedbenlallahom.com/booking?lang=en"]);
    // A refund that is not a cancellation does not offer one.
    expect(buildRefundEmail({ customerName: "Patient Test", trackingId: "APTREBOOK003", appointmentDate: NIGHT_APPOINTMENT, refundAmount: "100.00" }, contact).html).not.toContain("/booking");
  });
});

describe("aperçu dans la boîte de réception (MAIL-12)", () => {
  it("donne la date et l’heure de Paris et la référence d’un rendez-vous, en texte caché en tête du corps", () => {
    const french = buildBookingConfirmationEmail({ customerName: "Patient Test", trackingId: "APTPREVIEW01", appointmentDate: NIGHT_APPOINTMENT, finalPrice: 100 }, contact);
    expect(preheaderOf(parse(french.html))).toBe("Rendez-vous le vendredi 16 octobre 2026 à 00:30 (heure de Paris) – réf. APTPREVIEW01");
    const english = buildBookingConfirmationEmail({ customerName: "John Smith", trackingId: "APTPREVIEW02", appointmentDate: NIGHT_APPOINTMENT, finalPrice: 100, language: "en" }, contact);
    expect(preheaderOf(parse(english.html))).toBe("Appointment on Friday, 16 October 2026 at 00:30 (Paris time) – ref. APTPREVIEW02");
    expect(preheaderOf(parse(buildInvoiceEmail({ customerName: "Patient Test", trackingId: "APTPREVIEW03", finalPrice: 150, invoiceNumber: "FAC-2026-000007" }, contact).html))).toBe("Facture FAC-2026-000007 – 150,00 € – réf. APTPREVIEW03");
  });

  it("donne la durée de validité d’un lien, jamais le nom saisi", () => {
    const access = buildCandidatePortalAccessEmail({ to: "a@example.test", firstName: "Aisha", kind: "verify", actionUrl: "https://drahmedbenlallahom.com/candidate/verify?token=t" });
    expect(preheaderOf(parse(access.html))).toBe("Lien personnel valable 30 minutes, à usage unique.");
    expect(preheaderOf(parse(access.html))).not.toContain("Aisha");
    expect(preheaderOf(parse(buildCandidatePortalAccessEmail({ to: "a@example.test", firstName: "Aisha", kind: "invite", actionUrl: "https://drahmedbenlallahom.com/candidate/access?invite=i", language: "en" }).html))).toBe("Invitation link valid for 7 days.");
  });

  it("n’ajoute aucun texte caché sans aperçu, et échappe celui qu’il reçoit", () => {
    expect(preheaderOf(parse(buildHippocampusEmailShell("<p>Test</p>")))).toBeNull();
    const html = buildHippocampusEmailShell("<p>Test</p>", "fr", { preheader: "Réf. <APT1>" });
    expect(html).toContain("Réf. &lt;APT1&gt;");
    expect(preheaderOf(parse(html))).toBe("Réf. <APT1>");
  });
});
