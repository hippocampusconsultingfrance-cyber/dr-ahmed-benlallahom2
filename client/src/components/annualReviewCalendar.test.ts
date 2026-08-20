import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("calendrier annuel de revue", () => {
  it("prépare les revues éditoriales, conformité, parcours et technique", async () => {
    const source = await readFile(path.join(process.cwd(), "ANNUAL_REVIEW_CALENDAR.md"), "utf8");
    for (const marker of ["T1", "T2", "T3", "T4", "Traductions", "contacts professionnels", "coordonnées publiques", "noms et rôles des partenaires", "diplômes et certifications", "photographies professionnelles", "biographies", "Lecteur d’écran", "Droits sur visuels", "politique de confidentialité", "mentions légales", "conditions générales", "Réservation", "dashboard", "Domaines", "sitemap", "Sobriété", "Interactions et langues", "Réservation et suivi", "Information médicale et consentement", "SEO et découverte", "Navigation et actions", "Système visuel", "focus/hover/active", "disabled/loading/error/success", "empty/skeletons/toasts", "modales/drawers/menus déroulants", "Composants et médias", "Diffusion et résilience", "Pages et routes", "Liens et intégrations", "droits RGPD", "sous-traitants", "sauvegarde", "LinkedIn", "remboursement", "Planification et données", "Google/Microsoft", "confidentialité médicale", "base de données", "Sécurité, performance et inclusion", "permissions policy", "Lighthouse", "lecteurs d’écran", "Bibliothèque UI", "radio/radio group", "progress, sonner, spinner", "Fondations visuelles", "tokens, thèmes clair/sombre", "Visibilité et expérience installable", "Twitter Card", "Performance et diffusion", "Brotli/Gzip", "www/non-www", "Qualité de livraison", "régression visuelle", "paiement, réservation, e-mail, SMS"]) expect(source).toContain(marker);
  });
});
