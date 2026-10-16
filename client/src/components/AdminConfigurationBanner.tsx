import { AlertTriangle } from "lucide-react";
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

export default function AdminConfigurationBanner() {
  const { data } = trpc.system.configurationStatus.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  if (!data || data.ok || data.missing.length === 0) return null;

  return (
    <div role="alert" className="mb-6 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-foreground">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">Configuration de production incomplète</p>
          <p className="mt-1 text-muted-foreground">
            {data.missing.length === 1 ? "Une variable d’environnement critique manque" : `${data.missing.length} variables d’environnement critiques manquent`} dans Vercel
            (Settings → Environment Variables → Production). {data.missing.length === 1 ? "Ajoutez-la" : "Ajoutez-les"} puis redéployez le site.
          </p>
          <ul className="mt-2 space-y-1">
            {data.missing.map(name => (
              <li key={name} className="break-words">
                <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-xs">{name}</code>
                {MISSING_VARIABLE_IMPACT[name] ? <span className="text-muted-foreground"> — {MISSING_VARIABLE_IMPACT[name]}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
