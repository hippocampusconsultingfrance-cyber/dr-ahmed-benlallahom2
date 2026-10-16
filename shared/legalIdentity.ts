/**
 * Identité légale de la société, telle que publiée dans les mentions légales.
 *
 * Source unique : la page /legal (client/src/pages/LegalPage.tsx) et la
 * facture PDF (server/invoice.ts) lisent toutes deux cet objet. Modifier une
 * valeur ici la met à jour aux deux endroits. Ne jamais y ajouter un
 * identifiant (SIRET, n° de TVA, RPPS…) qui n’a pas été fourni par la société :
 * les compléments propres à la facturation passent par les variables
 * d’environnement documentées dans server/invoiceSeller.ts.
 */
export const HIPPOCAMPUS_LEGAL = {
  name: "Hippocampus Consulting SARL",
  legalForm: "Société à responsabilité limitée (SARL)",
  registeredOffice: "6 rue d’Armaillé, 75017 Paris, France",
  rcs: "999 259 252 R.C.S. Paris",
  capital: "1 000 €",
  director: "Ahmed Ben Lallahom",
  contactEmail: "hippocampusconsultingfrance@gmail.com",
} as const;
