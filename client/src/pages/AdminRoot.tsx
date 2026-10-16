import { ClerkProvider } from "@clerk/react";
import { lazy, Suspense } from "react";
import PublicContentSkeleton from "@/components/PublicContentSkeleton";

// Chunk séparé : le tableau de bord garde son propre budget (scripts/check-performance-budgets.mjs),
// @clerk/react est partagé entre cette racine et le tableau de bord.
const AdminDashboard = lazy(() => import("./AdminDashboard"));

/**
 * Racine de l'espace /admin, chargée à la demande (React.lazy dans App.tsx).
 *
 * Clerk ne sert qu'à l'authentification de l'administrateur : son fournisseur est
 * monté ici et non plus dans main.tsx, pour que les pages publiques (patients,
 * candidats, employeurs) ne téléchargent ni @clerk/react ni clerk-js, ne contactent
 * pas l'instance Clerk et ne reçoivent aucun cookie Clerk (PERF-01, PUB-COOKIE-02).
 */
export default function AdminRoot() {
  const publishableKey = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    // Variable de build : sans elle, seul l'espace admin est indisponible, le site public reste en ligne.
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Administration indisponible</h1>
          <p className="text-muted-foreground">
            La clé publique Clerk (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) n’est pas configurée pour ce déploiement.
            Ajoutez-la dans Vercel puis redéployez le site.
          </p>
        </div>
      </main>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInFallbackRedirectUrl="/admin"
      signUpFallbackRedirectUrl="/admin"
      afterSignOutUrl="/"
    >
      <Suspense
        fallback={
          <div className="min-h-screen bg-background px-4 py-16">
            <div className="mx-auto max-w-3xl">
              <PublicContentSkeleton cards={1} label="Chargement de l’accès administrateur" />
            </div>
          </div>
        }
      >
        <AdminDashboard />
      </Suspense>
    </ClerkProvider>
  );
}
