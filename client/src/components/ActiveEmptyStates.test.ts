import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function readComponent(name: string) {
  return readFile(new URL(`./${name}`, import.meta.url), "utf8");
}

describe("états vides actifs", () => {
  it("conserve l’état vide localisé des témoignages partenaires", async () => {
    const source = await readComponent("TestimonialsSection.tsx");
    expect(source).toContain("if (featuredTestimonials.length === 0)");
    expect(source).toContain("currentContent.empty");
    expect(source).toContain("Aucun témoignage disponible pour le moment.");
    expect(source).toContain("No testimonials are available at the moment.");
  });

  it("conserve les états vides du pilotage des briefs employeurs", async () => {
    const source = await readComponent("EmployerBriefsTab.tsx");
    expect(source).toContain("noBrief");
    expect(source).toContain("noCandidate");
    expect(source).toContain("Aucun brief Employeur à traiter.");
  });

  it("conserve les états vides d’audience et d’historique du mailing", async () => {
    const source = await readComponent("MailingTab.tsx");
    expect(source).toContain("noSelected");
    expect(source).toContain("noCampaign");
    expect(source).toContain("Aucune campagne n’a encore été enregistrée.");
  });

  it("conserve l’état vide illustré et filtrable du Vivier", async () => {
    const source = await readComponent("VivierTab.tsx");
    expect(source).toContain("candidates?.length ?");
    expect(source).toContain("UsersRound");
    expect(source).toContain("copy.empty");
    expect(source).toContain("Aucun candidat éligible ne correspond aux filtres actuels.");
  });

  it("conserve l’état vide de la revue documentaire selon le filtre actif", async () => {
    const source = await readComponent("CandidateDocumentsAdminTab.tsx");
    expect(source).toContain("!list.isLoading && !list.data?.length");
    expect(source).toContain("border-dashed");
    expect(source).toContain("copy.empty");
    expect(source).toContain("Aucun document ne correspond à ce filtre.");
  });

  it("conserve les panneaux illustrés des témoignages et disponibilités administratifs", async () => {
    const source = await readFile(new URL("../pages/AdminDashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain('AdminEmptyState icon={CalendarDays} title="Aucune réservation"');
    expect(source).toContain('AdminEmptyState icon={MessageSquare} title="Aucun message"');
    expect(source).toContain('AdminEmptyState icon={Shield} title="Aucune demande RGPD"');
    expect(source).toContain('AdminEmptyState icon={Star} title="Aucun témoignage"');
    expect(source).toContain('AdminEmptyState icon={CalendarDays} title="Aucun créneau configuré"');
    expect(source).toContain('AdminEmptyState icon={CalendarDays} title="Aucune date bloquée"');
  });

  it("conserve les alternatives d’absence de données des tableaux recrutement et sécurité", async () => {
    const [security, dashboard, recruitment] = await Promise.all([
      readComponent("SecurityOperationsTab.tsx"),
      readComponent("RecruitmentDashboardPanel.tsx"),
      readComponent("RecruitmentTab.tsx"),
    ]);
    expect(security).toContain("rows.length === 0");
    expect(security).toContain("copy.noEvents");
    expect(security).toContain("ShieldCheck");
    expect(dashboard).toContain("nonNegativeCount(candidates.total)");
    expect(dashboard).toContain("CV enregistrés");
    expect(dashboard).toContain("Les ratios sont indicatifs et n’automatisent aucune décision.");
    expect(recruitment).toContain("FileSearch");
    expect(recruitment).toContain("Aucune candidature ne correspond aux filtres.");
    expect(recruitment).toContain('aria-hidden="true"');
  });
});
