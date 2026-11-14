import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeEmailPreviews } from "../scripts/emails-preview.mts";

// MAIL-13: `pnpm emails:preview` writes every email, in French and in English,
// built by its real builder or sender, and sends nothing.

const BOTH_LANGUAGES = [
  "brief-employeur-accuse",
  "candidature-recue",
  "contact-accuse",
  "espace-candidat-invite",
  "espace-candidat-reset",
  "espace-candidat-verify",
  "question-sante-accuse",
  "question-sante-reponse",
  "recrutement-campagne",
  "recrutement-demander-un-complement",
  "recrutement-proposer-un-echange",
  "rendez-vous-annulation-praticien",
  "rendez-vous-confirmation",
  "rendez-vous-facture",
  "rendez-vous-paiement-a-regulariser",
  "rendez-vous-paiement-non-confirme-rembourse",
  "rendez-vous-rappel",
  "rendez-vous-remboursement",
  "rgpd-accuse",
];
const FRENCH_ONLY = [
  "admin-code-de-securite",
  "proprietaire-brief-employeur",
  "proprietaire-demande-rgpd",
  "proprietaire-question-sante",
  "proprietaire-reservation-payee",
];

let outDir = "";
const realFetch = globalThis.fetch;
afterEach(async () => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

describe("pnpm emails:preview (MAIL-13)", () => {
  it("écrit chaque email en français et en anglais, avec sa version texte et un index, sans aucune requête réseau", async () => {
    const network = vi.fn(async () => {
      throw new Error("network reached");
    });
    globalThis.fetch = network as unknown as typeof fetch;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    outDir = await mkdtemp(path.join(tmpdir(), "emails-preview-"));

    const written = await writeEmailPreviews(outDir);

    expect(network).not.toHaveBeenCalled();
    expect(globalThis.fetch).toBe(network);
    const html = async (language: string) =>
      (await readdir(path.join(outDir, language)))
        .filter(file => file.endsWith(".html"))
        .map(file => file.replace(/\.html$/, ""))
        .sort();
    expect(await html("en")).toEqual([...BOTH_LANGUAGES].sort());
    expect(await html("fr")).toEqual(
      [...BOTH_LANGUAGES, ...FRENCH_ONLY].sort()
    );
    expect(written).toContain(path.join(outDir, "index.html"));

    const campaign = await readFile(
      path.join(outDir, "en", "recrutement-campagne.html"),
      "utf8"
    );
    expect(campaign.startsWith('<!DOCTYPE html>\n<html lang="en">')).toBe(true);
    expect(campaign).toContain(
      "Unsubscribe from future recruitment opportunities"
    );
    expect(
      await readFile(
        path.join(outDir, "fr", "recrutement-campagne.txt"),
        "utf8"
      )
    ).toContain(
      "Ne plus recevoir d’opportunités de recrutement : https://drahmedbenlallahom.com/recruitment/unsubscribe?token=exemple"
    );
    // An email that has no builder of its own is caught from its real send.
    expect(
      await readFile(path.join(outDir, "fr", "candidature-recue.html"), "utf8")
    ).toContain("<title>Candidature reçue - CV-2026-000123</title>");
    // RGPD-13: the requester's acknowledgement with its confirmation link, the owner's email without the description.
    expect(
      await readFile(path.join(outDir, "en", "rgpd-accuse.txt"), "utf8")
    ).toContain("https://drahmedbenlallahom.com/gdpr?confirm=exemple&lang=en");
    expect(
      await readFile(path.join(outDir, "fr", "rgpd-accuse.html"), "utf8")
    ).toContain(">Confirmer mon adresse</a>");
    expect(
      await readFile(
        path.join(outDir, "fr", "proprietaire-demande-rgpd.html"),
        "utf8"
      )
    ).toContain("à lire dans l’administration");
    const index = await readFile(path.join(outDir, "index.html"), "utf8");
    expect(index).toContain(
      `Aperçu des emails (${BOTH_LANGUAGES.length * 2 + FRENCH_ONLY.length})`
    );
    expect(index).toContain(
      'en · rendez-vous-confirmation</a> (<a href="en/rendez-vous-confirmation.txt">texte</a>) — Booking confirmation - APT-2026-000123'
    );
  });
});
