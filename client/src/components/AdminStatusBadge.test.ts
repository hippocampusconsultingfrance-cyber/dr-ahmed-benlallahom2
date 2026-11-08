import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { contrastRatio, oklchToLinearRgb, relativeLuminance, type Oklch } from "@/lib/contrast";

// ADM-07 — un badge de statut unique pour l’administration : les statuts des
// paiements, rendez-vous, questions santé, témoignages et demandes RGPD en
// mots, en français dans les onglets écrits en français quelle que soit la
// langue du site, en anglais quand un onglet traduit le demande.
// A11Y-12 — ses teintes se lisent à 4,5:1 au moins, en thème clair (texte -700
// sur fond -50) comme en thème sombre (texte -300 sur sa teinte, posée sur la
// carte ou le fond des pages), mesurées sur les classes que le badge rend.

const { default: AdminStatusBadge, AdminBadge, ADMIN_BADGE_TONES, adminStatusLabel, adminStatusTone } = await import("./AdminStatusBadge");

describe("ADM-07 — libellés des statuts", () => {
  it.each([
    ["payment", { pending: "En attente de paiement", completed: "Payé", failed: "Échoué", refunded: "Remboursé" }, { pending: "Awaiting payment", completed: "Paid", failed: "Failed", refunded: "Refunded" }],
    ["appointment", { held: "Créneau réservé", confirmed: "Confirmé", cancelled: "Annulé", completed: "Terminé", no_show: "Absent" }, { held: "Slot held", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed", no_show: "No-show" }],
    ["medicalQuestion", { submitted: "À répondre", drafting: "Brouillon", answered: "Répondue", published: "Publiée", rejected: "Classée sans suite" }, { submitted: "To answer", drafting: "Draft", answered: "Answered", published: "Published", rejected: "Closed without follow-up" }],
    ["testimonial", { pending: "À modérer", approved: "Approuvé", rejected: "Rejeté", featured: "Mis en avant" }, { pending: "To moderate", approved: "Approved", rejected: "Rejected", featured: "Featured" }],
    ["gdprRequest", { pending: "À traiter", in_progress: "En cours", completed: "Traitée", rejected: "Refusée" }, { pending: "To process", in_progress: "In progress", completed: "Processed", rejected: "Refused" }],
  ] as const)("%s : en français et en anglais, chaque statut a son libellé et sa teinte", (kind, french, english) => {
    for (const [status, label] of Object.entries(french)) {
      expect(adminStatusLabel(kind, status)).toBe(label);
      expect(adminStatusLabel(kind, status, "en")).toBe(english[status as keyof typeof english]);
      // German and Chinese read the French, as the rest of these tabs.
      expect(adminStatusLabel(kind, status, "de")).toBe(label);
      expect(adminStatusLabel(kind, status, "zh")).toBe(label);
      expect(Object.keys(ADMIN_BADGE_TONES)).toContain(adminStatusTone(kind, status));
    }
  });

  it("distingue « completed » d’un paiement (« Payé ») de celui d’un rendez-vous (« Terminé »), et garde une valeur inconnue telle quelle, en gris", () => {
    expect([adminStatusLabel("payment", "completed"), adminStatusLabel("appointment", "completed")]).toEqual(["Payé", "Terminé"]);
    expect(adminStatusTone("payment", "completed")).toBe("success");
    expect(adminStatusLabel("payment", "disputed")).toBe("disputed");
    expect(adminStatusTone("payment", "disputed")).toBe("neutral");
  });

  it("rend le libellé en français sans langue donnée, en anglais quand on le lui demande", () => {
    expect(renderToStaticMarkup(createElement(AdminStatusBadge, { kind: "payment", status: "refunded" }))).toMatch(/>Remboursé<\/span>$/);
    const html = renderToStaticMarkup(createElement(AdminStatusBadge, { kind: "payment", status: "refunded", language: "en", className: "shrink-0" }));
    expect(html).toMatch(/>Refunded<\/span>$/);
    expect(html).toContain("shrink-0");
    expect(html).toContain(ADMIN_BADGE_TONES.accent.split(" ")[0]);
  });
});

/** Tailwind 4 shades of the badges (node_modules/tailwindcss/theme.css). */
const PALETTE: Record<string, Record<string, Oklch>> = {
  emerald: { 50: [0.979, 0.021, 166.113], 300: [0.845, 0.143, 164.978], 500: [0.696, 0.17, 162.48], 700: [0.508, 0.118, 165.612] },
  amber: { 50: [0.987, 0.022, 95.277], 300: [0.879, 0.169, 91.605], 500: [0.769, 0.188, 70.08], 700: [0.555, 0.163, 48.998] },
  orange: { 50: [0.98, 0.016, 73.684], 300: [0.837, 0.128, 66.29], 500: [0.705, 0.213, 47.604], 700: [0.553, 0.195, 38.402] },
  red: { 50: [0.971, 0.013, 17.38], 300: [0.808, 0.114, 19.571], 500: [0.637, 0.237, 25.331], 700: [0.505, 0.213, 27.518] },
  blue: { 50: [0.97, 0.014, 254.604], 300: [0.809, 0.105, 251.813], 500: [0.623, 0.214, 259.815], 700: [0.488, 0.243, 264.376] },
  violet: { 50: [0.969, 0.016, 293.756], 300: [0.811, 0.111, 293.571], 500: [0.606, 0.25, 292.717], 700: [0.491, 0.27, 292.581] },
  slate: { 50: [0.984, 0.003, 247.858], 300: [0.869, 0.022, 252.894], 500: [0.554, 0.046, 257.417], 700: [0.372, 0.044, 257.287] },
};

/** Card and page background of the dark theme (client/src/index.css). */
const DARK_SURFACES: Oklch[] = [[0.15, 0.025, 250], [0.12, 0.02, 250]];

const encode = (channel: number) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);
const decode = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** Contrast of a text on a tint laid over a surface, blended as the browser does, in sRGB. */
function contrastOnTint(text: Oklch, tint: Oklch, alpha: number, surface: Oklch) {
  const over = oklchToLinearRgb(tint).map(encode);
  const under = oklchToLinearRgb(surface).map(encode);
  const [red, green, blue] = over.map((channel, index) => decode(channel * alpha + under[index]! * (1 - alpha)));
  const background = 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  const [lighter, darker] = [relativeLuminance(text), background].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("A11Y-12 — teintes des badges lisibles dans les deux thèmes", () => {
  it.each(Object.keys(ADMIN_BADGE_TONES))("teinte %s", tone => {
    const classes = renderToStaticMarkup(createElement(AdminBadge, { tone: tone as keyof typeof ADMIN_BADGE_TONES, children: "Statut" })).match(/class="([^"]*)"/)![1]!.split(" ");
    const light = { text: classes.find(name => /^text-\w+-\d+$/.test(name))!, background: classes.find(name => /^bg-\w+-\d+$/.test(name))! };
    const dark = { text: classes.find(name => /^dark:text-\w+-\d+$/.test(name))!, background: classes.find(name => /^dark:bg-\w+-\d+\/\d+$/.test(name))! };
    const shade = (name: string) => {
      const [, hue, value] = /(\w+)-(\d+)(?:\/\d+)?$/.exec(name)!;
      return PALETTE[hue!]![value!]!;
    };

    // One hue: a -700 text on its -50 background.
    expect(light.background.split("-")[1]).toBe(light.text.split("-")[1]);
    expect([light.text, light.background].map(name => name.split("-")[2])).toEqual(["700", "50"]);
    expect(contrastRatio(shade(light.text), shade(light.background))).toBeGreaterThanOrEqual(4.5);

    const alpha = Number(dark.background.split("/")[1]) / 100;
    for (const surface of DARK_SURFACES) expect(contrastOnTint(shade(dark.text), shade(dark.background), alpha, surface)).toBeGreaterThanOrEqual(4.5);
  });
});
