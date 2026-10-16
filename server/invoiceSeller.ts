import { HIPPOCAMPUS_LEGAL } from "../shared/legalIdentity";
import { siteConfig } from "../client/src/data/site-config";

/**
 * Identité du vendeur imprimée sur les factures.
 *
 * Valeurs par défaut : l’identité légale publiée dans les mentions légales
 * (shared/legalIdentity.ts) et l’email de contact public du site
 * (client/src/data/site-config.ts). Chaque champ peut être remplacé par une
 * variable d’environnement, sans modifier le code :
 *
 * - INVOICE_SELLER_NAME, INVOICE_SELLER_LEGAL_FORM, INVOICE_SELLER_CAPITAL,
 *   INVOICE_SELLER_RCS, INVOICE_SELLER_ADDRESS, INVOICE_SELLER_EMAIL ;
 * - INVOICE_SELLER_VAT_NUMBER : n° de TVA intracommunautaire (aucun par défaut) ;
 * - INVOICE_VAT_MENTION : mention de TVA validée par l’expert-comptable, par
 *   exemple une mention d’exonération ou de franchise. Sans cette variable, la
 *   facture n’affiche aucune ligne de TVA : rien n’est inventé.
 */
export type InvoiceSeller = {
  name: string;
  legalForm: string;
  capital: string;
  rcs: string;
  address: string;
  email: string;
  website: string;
  vatNumber: string | null;
  vatMention: string | null;
};

type Env = Record<string, string | undefined>;

function envValue(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value.slice(0, 300) : null;
}

export function resolveInvoiceSeller(env: Env = process.env): InvoiceSeller {
  return {
    name: envValue(env, "INVOICE_SELLER_NAME") ?? HIPPOCAMPUS_LEGAL.name,
    legalForm: envValue(env, "INVOICE_SELLER_LEGAL_FORM") ?? HIPPOCAMPUS_LEGAL.legalForm,
    capital: envValue(env, "INVOICE_SELLER_CAPITAL") ?? HIPPOCAMPUS_LEGAL.capital,
    rcs: envValue(env, "INVOICE_SELLER_RCS") ?? HIPPOCAMPUS_LEGAL.rcs,
    address: envValue(env, "INVOICE_SELLER_ADDRESS") ?? HIPPOCAMPUS_LEGAL.registeredOffice,
    email: envValue(env, "INVOICE_SELLER_EMAIL") ?? siteConfig.email,
    website: "www.drahmedbenlallahom.com",
    vatNumber: envValue(env, "INVOICE_SELLER_VAT_NUMBER"),
    vatMention: envValue(env, "INVOICE_VAT_MENTION"),
  };
}
