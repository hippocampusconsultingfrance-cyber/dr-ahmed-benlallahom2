import { AlertTriangle } from "lucide-react";
import { SITE_ORIGIN } from "@shared/routeMetadata";
import { trpc } from "@/lib/trpc";

/** Effet concret de chaque variable manquante, pour que le propriétaire sache quoi corriger en premier. */
export const MISSING_VARIABLE_IMPACT: Record<string, string> = {
  JWT_SECRET: "sessions et cookies signés",
  DATABASE_URL: "base de données (tout le site dynamique)",
  STRIPE_SECRET_KEY: "paiement des consultations",
  STRIPE_WEBHOOK_SECRET: "confirmation des paiements Stripe",
  CLERK_SECRET_KEY: "connexion administrateur",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "connexion administrateur (variable de build : redéployer après l’ajout)",
  RESEND_API_KEY: "envoi de tous les emails",
  TURNSTILE_SECRET_KEY: "formulaires publics (anti-robot)",
  BLOB_READ_WRITE_TOKEN: "dépôt des CV et documents",
  CANDIDATE_AUTH_PEPPER: "connexion à l’espace candidat",
  CANDIDATE_DOCUMENT_ENCRYPTION_KEY: "chiffrement des documents candidats",
  CRON_SECRET: "les 7 tâches planifiées (rappels, relances, nettoyage) sont refusées",
  CLERK_OWNER_USER_ID: "rôle administrateur du compte propriétaire",
  RESEND_WEBHOOK_SECRET: "suivi de délivrabilité des campagnes",
};

/**
 * Ce que met en jeu chaque incohérence relevée selon l’environnement Vercel
 * (EXPL-20), et ce qu’il faut changer. Le serveur n’envoie que le code : jamais
 * la valeur d’une clé.
 */
export const CONFIGURATION_WARNING_ADVICE: Record<string, string> = {
  stripe_test_key_in_production: "Stripe est en mode test en production (STRIPE_SECRET_KEY commence par sk_test_) : aucun paiement réel n’est encaissé. Mettez la clé live (sk_live_) et le secret du webhook live (STRIPE_WEBHOOK_SECRET) dans Vercel (Production), puis redéployez.",
  clerk_test_key_in_production: "La connexion administrateur passe par une instance Clerk de développement (clé sk_test_ ou pk_test_). Mettez les clés de l’instance de production Clerk (sk_live_, pk_live_) dans Vercel (Production), puis redéployez : la clé publique est intégrée au site au build.",
  turnstile_test_secret: "TURNSTILE_SECRET_KEY est une clé de test Cloudflare : la vérification anti-robot des formulaires publics accepte tout (ou refuse tout). Mettez la clé secrète du widget du site (Cloudflare → Turnstile) dans Vercel (Production), puis redéployez.",
  public_origin_mismatch: `PUBLIC_APP_ORIGIN n’est pas exactement ${SITE_ORIGIN} : les liens envoyés (retour après paiement, invitations des candidats, désinscription, accès à l’administration) mènent ailleurs. Corrigez-la ou supprimez-la dans Vercel (Production), puis redéployez.`,
  live_key_in_preview: "Une clé live Stripe (sk_live_) ou Clerk (sk_live_, pk_live_) est configurée en préproduction (Preview) : un essai y encaisserait de vrais paiements ou toucherait les vrais comptes. Mettez les clés de test dans l’environnement Preview de Vercel, puis redéployez.",
};

export default function AdminConfigurationBanner() {
  const { data } = trpc.system.configurationStatus.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  const missing = data && !data.ok ? data.missing : [];
  const warnings = data?.warnings ?? [];
  if (missing.length === 0 && warnings.length === 0) return null;

  return (
    <div role="alert" className="mb-6 space-y-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-foreground print:hidden">
      {missing.length > 0 && (
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">Configuration de production incomplète</p>
            <p className="mt-1 text-muted-foreground">
              {missing.length === 1 ? "Une variable d’environnement critique manque" : `${missing.length} variables d’environnement critiques manquent`} dans Vercel
              (Settings → Environment Variables → Production). {missing.length === 1 ? "Ajoutez-la" : "Ajoutez-les"} puis redéployez le site.
            </p>
            <ul className="mt-2 space-y-1">
              {missing.map(name => (
                <li key={name} className="break-words">
                  <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-xs">{name}</code>
                  {MISSING_VARIABLE_IMPACT[name] ? <span className="text-muted-foreground"> — {MISSING_VARIABLE_IMPACT[name]}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">Configuration à vérifier</p>
            <p className="mt-1 text-muted-foreground">Des réglages de Vercel ne conviennent pas à cet environnement :</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {warnings.map(code => <li key={code} className="break-words">{CONFIGURATION_WARNING_ADVICE[code] ?? code}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
