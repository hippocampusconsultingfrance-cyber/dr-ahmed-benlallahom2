import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { trpc } from "@/lib/trpc";

export default function RecruitmentUnsubscribePage() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") || "");
  const unsubscribe = trpc.recruitmentPreferences.unsubscribe.useMutation();

  useEffect(() => {
    if (token && !unsubscribe.isPending && !unsubscribe.isSuccess && !unsubscribe.isError) unsubscribe.mutate({ token });
  }, [token, unsubscribe]);

  const failed = !token || unsubscribe.isError;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="container flex min-h-[65vh] items-center justify-center pt-32 pb-20">
        <section className="w-full max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-lg md:p-10">
          {unsubscribe.isPending && token ? <><Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" /><h1 className="mt-5 text-2xl font-semibold">Mise à jour de vos préférences…</h1><p className="mt-3 text-muted-foreground">Nous vérifions votre demande de désinscription.</p></> : failed ? <><XCircle className="mx-auto h-11 w-11 text-destructive" /><h1 className="mt-5 text-2xl font-semibold">Lien indisponible</h1><p className="mt-3 text-muted-foreground">Ce lien de désinscription est invalide, incomplet ou n’est plus utilisable. Vous pouvez contacter Hippocampus Consulting pour toute question relative à vos données.</p></> : <><CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600 dark:text-emerald-300" /><h1 className="mt-5 text-2xl font-semibold">Préférences mises à jour</h1><p className="mt-3 text-muted-foreground">Vous ne recevrez plus d’opportunités de recrutement envoyées depuis notre vivier. Cette décision ne supprime pas votre candidature et ne modifie pas vos autres droits RGPD.</p></>}
          <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />Vous pouvez toujours demander l’accès, la rectification ou l’effacement de vos données par l’intermédiaire de notre page RGPD.</div>
          <Link href="/gdpr" className="cta-primary mt-7 inline-flex">Accéder à mes droits RGPD</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
