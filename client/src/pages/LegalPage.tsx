import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowLeft } from "lucide-react";
import { Link, useSearch } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import { useState, useEffect } from "react";
import Breadcrumb from "@/components/Breadcrumb";

export default function LegalPage() {
  const { language } = useLanguage();

  if (language === "en") {
    return <LegalPageEn />;
  }
  if (language === "de") {
    return <LegalPageDe />;
  }
  if (language === "zh") {
    return <LegalPageZh />;
  }

  return <LegalPageFr />;
}

function LegalPageFr() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab") as "legal" | "privacy" | "terms" | null;
  const [activeTab, setActiveTab] = useState<"legal" | "privacy" | "terms">(tabParam || "legal");

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Mentions Légales | Dr. Ahmed Ben Lallahom"
        description="Mentions légales, politique de confidentialité, conditions générales d'utilisation et informations RGPD du site Dr. Ahmed Ben Lallahom."
        ogUrl="https://drahmedbenlallahom.com/legal"
      />
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="container mb-8">
          <Breadcrumb items={[{ label: "Mentions Légales" }]} />
        </div>

        <div className="container max-w-4xl">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-12">
            Mentions Légales
          </h1>

          {/* Onglets interactifs */}
          <div className="mb-12">
            <div role="tablist" aria-label="Legal sections" className="legal-tabs flex gap-4 mb-8 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "legal"}
                onClick={() => setActiveTab("legal")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "legal"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Informations Légales
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "privacy"}
                onClick={() => setActiveTab("privacy")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "privacy"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Politique de Confidentialité
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "terms"}
                onClick={() => setActiveTab("terms")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "terms"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Conditions Générales
              </button>
            </div>

            {/* Contenu Informations Légales */}
            {activeTab === "legal" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Informations Légales</h2>
                
                <div className="text-muted-foreground space-y-6">
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Éditeur du site</h3>
                    <div className="space-y-2">
                      <p><strong>Nom :</strong> Dr. Ahmed Ben Lallahom</p>
                      <p><strong>Statut :</strong> Professionnel de santé indépendant</p>
                      <p><strong>Adresse :</strong> France</p>
                      <p><strong>Téléphone :</strong> +33 9 72 15 24 13</p>
                      <p><strong>Email :</strong> Disponible via le formulaire de contact</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Hébergeur</h3>
                    <div className="space-y-2">
                      <p><strong>Nom :</strong> Manus</p>
                      <p><strong>Adresse :</strong> Infrastructure cloud</p>
                      <p><strong>Service :</strong> Hébergement et déploiement de sites web</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Propriété Intellectuelle</h3>
                    <p className="mb-4">
                      L'ensemble du contenu de ce site (textes, images, logos, vidéos, etc.) est protégé par les lois sur la propriété intellectuelle. Toute reproduction, distribution ou utilisation du contenu sans autorisation écrite préalable est strictement interdite.
                    </p>
                    <p>
                      Les logos des entreprises partenaires sont la propriété de leurs propriétaires respectifs et sont utilisés avec permission.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Contenu Politique de Confidentialité */}
            {activeTab === "privacy" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Politique de Confidentialité</h2>
                <div className="text-muted-foreground space-y-4">
                  <h3 className="font-semibold text-foreground">1. Collecte de données personnelles</h3>
                  <p>Ce site traite des données personnelles dans le cadre du formulaire de contact, de la réservation et du paiement d’une consultation, de l’émission de factures et du traitement des demandes RGPD. Les données collectées incluent :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Nom complet</li>
                    <li>Adresse email</li>
                    <li>Numéro de téléphone (optionnel)</li>
                    <li>Contenu du message</li>
                    <li>Adresse IP (automatiquement collectée)</li>
                    <li>Cookies de session</li>
                    <li>Date et heure souhaitées, demande de consultation et référence de réservation</li>
                    <li>Informations nécessaires à la facture ; les données de carte sont traitées directement par Stripe</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">2. Base légale du traitement</h3>
                  <p>Le traitement de vos données personnelles est basé sur :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Votre consentement explicite (article 6.1.a du RGPD)</li>
                    <li>L'exécution d'une demande de contact (article 6.1.b du RGPD)</li>
                    <li>L'intérêt légitime du responsable du traitement (article 6.1.f du RGPD)</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">3. Utilisation des données</h3>
                  <p>Les données personnelles sont utilisées uniquement pour :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Répondre à vos demandes de contact et questions</li>
                    <li>Vous fournir les informations ou services demandés</li>
                    <li>Améliorer la qualité et la performance du service</li>
                    <li>Respecter les obligations légales et réglementaires</li>
                    <li>Prévenir la fraude et les abus</li>
                  </ul>
                  <p className="mt-4"><strong>Aucune vente ni utilisation commerciale :</strong> Vos données ne sont pas vendues ni utilisées à des fins commerciales. Elles peuvent être transmises aux sous-traitants strictement nécessaires au fonctionnement du service, conformément à la section dédiée ci-dessous.</p>

                  <h3 className="font-semibold text-foreground mt-4">4. Durée de conservation</h3>
                  <p>Les données personnelles sont conservées :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Données de contact :</strong> 3 ans après votre dernier contact ou jusqu'à votre demande de suppression</li>
                    <li><strong>Logs d'accès :</strong> 90 jours maximum</li>
                    <li><strong>Cookies :</strong> Selon votre consentement (jusqu'à 13 mois)</li>
                  </ul>
                  <p className="mt-4">Après cette période, vos données sont supprimées ou anonymisées de manière irréversible.</p>

                  <h3 className="font-semibold text-foreground mt-4">5. Sécurité des données</h3>
                  <p>Nous mettons en œuvre des mesures de sécurité appropriées pour protéger vos données :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Chiffrement SSL/TLS pour les transmissions</li>
                    <li>Accès restreint aux données personnelles</li>
                    <li>Serveurs sécurisés avec pare-feu</li>
                    <li>Sauvegardes régulières et chiffrées</li>
                    <li>Conformité aux normes de sécurité de l'industrie</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">6. Vos droits RGPD</h3>
                  <p>Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Droit d'accès :</strong> Obtenir une copie de vos données personnelles</li>
                    <li><strong>Droit de rectification :</strong> Corriger les données inexactes ou incomplètes</li>
                    <li><strong>Droit à l'oubli :</strong> Demander la suppression de vos données</li>
                    <li><strong>Droit à la limitation du traitement :</strong> Limiter l'utilisation de vos données</li>
                    <li><strong>Droit à la portabilité :</strong> Recevoir vos données dans un format structuré</li>
                    <li><strong>Droit d'opposition :</strong> Vous opposer au traitement de vos données</li>
                    <li><strong>Droit de ne pas être soumis à une décision automatisée :</strong> Droit à une intervention humaine</li>
                  </ul>
                  <p className="mt-4">Pour exercer ces droits, veuillez nous contacter via le formulaire de contact avec la mention "Demande RGPD".</p>

                  <h3 className="font-semibold text-foreground mt-4">7. Cookies et technologies de suivi</h3>
                  <p>Ce site utilise les types de cookies suivants :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Cookies essentiels :</strong> Nécessaires au fonctionnement du site</li>
                    <li><strong>Cookies de performance :</strong> Analysent l'utilisation du site</li>
                    <li><strong>Cookies de préférence :</strong> Mémorisent vos choix (langue, thème)</li>
                  </ul>
                  <p className="mt-4">Vous pouvez refuser les cookies non-essentiels en configurant votre navigateur.</p>

                  <h3 className="font-semibold text-foreground mt-4">8. Responsable du traitement</h3>
                  <p><strong>Responsable :</strong> Dr. Ahmed Ben Lallahom<br /><strong>Adresse :</strong> France<br /><strong>Contact :</strong> Via le formulaire de contact du site</p>

                  <h3 className="font-semibold text-foreground mt-4">9. Sous-traitants et transferts de données</h3>
                  <p>Nous utilisons les sous-traitants suivants pour traiter vos données :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Resend :</strong> Service d'envoi d'emails transactionnels (confirmations, factures, rappels)</li>
                    <li><strong>Stripe :</strong> Plateforme de paiement pour les réservations de consultations</li>
                    <li><strong>Manus :</strong> Hébergement et infrastructure cloud du site</li>
                  </ul>
                  <p className="mt-4">Ces sous-traitants traitent vos données uniquement selon nos instructions et conformément au RGPD. Ils s'engagent à respecter la confidentialité et la sécurité de vos données.</p>

                  <h3 className="font-semibold text-foreground mt-4">10. Registre des traitements</h3>
                  <p>Conformément aux exigences de la CNIL, nous maintenons un registre des traitements de données personnelles :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Traitement 1 - Formulaire de contact :</strong> Collecte du nom, email, téléphone et message. Base légale : consentement. Durée : 3 ans.</li>
                    <li><strong>Traitement 2 - Réservation de consultation :</strong> Collecte des données de contact et de paiement. Base légale : exécution du contrat. Durée : 3 ans.</li>
                    <li><strong>Traitement 3 - Demande GDPR :</strong> Collecte des données pour traiter les demandes d'accès, rectification ou suppression. Base légale : obligation légale. Durée : 1 an.</li>
                    <li><strong>Traitement 4 - Logs d'accès :</strong> Collecte automatique de l'adresse IP et des données de navigation. Base légale : intérêt légitime. Durée : 90 jours.</li>
                    <li><strong>Traitement 5 - Cookies :</strong> Stockage des préférences utilisateur (langue, thème). Base légale : consentement. Durée : 13 mois.</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">11. Droit de plainte</h3>
                  <p>Si vous estimez que vos droits RGPD ne sont pas respectés, vous avez le droit de déposer une plainte auprès de la CNIL (Commission Nationale de l'Informatique et des Libertés).</p>
                </div>
              </section>
            )}

            {/* Contenu Conditions Générales d'Utilisation */}
            {activeTab === "terms" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Conditions Générales d'Utilisation</h2>
                <div className="text-muted-foreground space-y-4">
                  <h3 className="font-semibold text-foreground">1. Acceptation des conditions</h3>
                  <p>En accédant et en utilisant ce site, vous acceptez pleinement et sans réserve les présentes conditions générales d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser ce site.</p>

                  <h3 className="font-semibold text-foreground mt-4">2. Description du service</h3>
                  <p>Ce site fournit des informations professionnelles et de consultation sur l'anesthésie-réanimation, l'entrepreneuriat en santé et les services connexes. Le site est fourni à titre informatif uniquement.</p>

                  <h3 className="font-semibold text-foreground mt-4">3. Utilisation acceptable</h3>
                  <p>Vous acceptez d'utiliser ce site uniquement à des fins légales et conformément à toutes les lois et réglementations applicables. Vous vous engagez à ne pas :</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Utiliser le site à des fins illégales, frauduleuses ou non autorisées</li>
                    <li>Reproduire, distribuer ou transmettre le contenu sans autorisation écrite préalable</li>
                    <li>Accéder ou tenter d'accéder à des zones non autorisées du site</li>
                    <li>Transmettre des virus, chevaux de Troie ou logiciels malveillants</li>
                    <li>Harceler, menacer, diffamer ou intimider d'autres utilisateurs</li>
                    <li>Collecter ou suivre les informations personnelles d'autres utilisateurs</li>
                    <li>Utiliser des robots, scrapers ou outils automatisés pour accéder au site</li>
                    <li>Surcharger ou interrompre le fonctionnement normal du site</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">4. Propriété intellectuelle</h3>
                  <p>L'ensemble du contenu de ce site (textes, images, logos, vidéos, graphiques, etc.) est protégé par les lois sur la propriété intellectuelle et les droits d'auteur. Vous n'avez le droit d'utiliser ce contenu que pour votre usage personnel et non commercial.</p>
                  <p className="mt-4"><strong>Restrictions :</strong> Vous ne pouvez pas reproduire, copier, modifier, adapter, vendre ou distribuer le contenu.</p>

                  <h3 className="font-semibold text-foreground mt-4">5. Limitation de responsabilité</h3>
                  <p><strong>Clause de non-responsabilité médicale :</strong> Les informations fournies sur ce site sont à titre informatif uniquement et ne constituent pas un avis médical professionnel. Elles ne remplacent pas une consultation avec un professionnel de santé qualifié.</p>
                  <p className="mt-4"><strong>Exactitude des informations :</strong> Bien que nous nous efforçons de maintenir l'exactitude des informations, nous ne garantissons pas l'absence d'erreurs ou d'omissions.</p>
                  <p className="mt-4"><strong>Absence de garantie :</strong> Le site est fourni "tel quel" sans garantie d'aucune sorte, expresse ou implicite.</p>

                  <h3 className="font-semibold text-foreground mt-4">6. Liens externes</h3>
                  <p>Ce site peut contenir des liens vers des sites externes. Nous ne sommes pas responsables du contenu, de l'exactitude ou des pratiques de confidentialité de ces sites externes.</p>

                  <h3 className="font-semibold text-foreground mt-4">7. Disponibilité du site</h3>
                  <p>Nous nous efforçons de maintenir le site disponible 24h/24, 7j/7. Cependant, nous ne garantissons pas une disponibilité ininterrompue. Le site peut être temporairement indisponible pour maintenance ou raisons techniques.</p>

                  <h3 className="font-semibold text-foreground mt-4">8. Modifications des conditions</h3>
                  <p>Nous nous réservons le droit de modifier ces conditions générales à tout moment. Les modifications seront effectives dès leur publication sur le site.</p>

                  <h3 className="font-semibold text-foreground mt-4">9. Loi applicable</h3>
                  <p>Ces conditions générales sont régies par la loi française. Tout litige découlant de l'utilisation du site sera soumis à la juridiction exclusive des tribunaux français.</p>

                  <h3 className="font-semibold text-foreground mt-4">10. Contact</h3>
                  <p>Pour toute question concernant ces conditions générales, veuillez nous contacter via le formulaire de contact sur le site.</p>
                </div>
              </section>
            )}
          </div>

          {/* Date de mise à jour */}
          <section className="pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Dernière mise à jour : juillet 2026
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function LegalPageEn() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab") as "legal" | "privacy" | "terms" | null;
  const [activeTab, setActiveTab] = useState<"legal" | "privacy" | "terms">(tabParam || "legal");

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Legal Notice | Dr. Ahmed Ben Lallahom"
        description="Legal notice, privacy policy, terms of use and GDPR information for Dr. Ahmed Ben Lallahom's website."
        ogUrl="https://drahmedbenlallahom.com/legal"
      />
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="container mb-8">
          <Breadcrumb items={[{ label: "Legal Notice" }]} />
        </div>

        <div className="container max-w-4xl">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-12">
            Legal Notice
          </h1>

          {/* Interactive Tabs */}
          <div className="mb-12">
            <div role="tablist" aria-label="Legal sections" className="legal-tabs flex gap-4 mb-8 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "legal"}
                onClick={() => setActiveTab("legal")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "legal"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Legal Information
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "privacy"}
                onClick={() => setActiveTab("privacy")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "privacy"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Privacy Policy
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "terms"}
                onClick={() => setActiveTab("terms")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "terms"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Terms of Use
              </button>
            </div>

            {/* Legal Information Content */}
            {activeTab === "legal" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Legal Information</h2>
                
                <div className="text-muted-foreground space-y-6">
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Website Editor</h3>
                    <div className="space-y-2">
                      <p><strong>Name:</strong> Dr. Ahmed Ben Lallahom</p>
                      <p><strong>Status:</strong> Independent healthcare professional</p>
                      <p><strong>Address:</strong> France</p>
                      <p><strong>Phone:</strong> +33 9 72 15 24 13</p>
                      <p><strong>Email:</strong> Available via contact form</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Hosting Provider</h3>
                    <div className="space-y-2">
                      <p><strong>Name:</strong> Manus</p>
                      <p><strong>Address:</strong> Cloud infrastructure</p>
                      <p><strong>Service:</strong> Website hosting and deployment</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Intellectual Property</h3>
                    <p className="mb-4">
                      All content on this website (texts, images, logos, videos, etc.) is protected by intellectual property laws. Any reproduction, distribution, or use of content without prior written authorization is strictly prohibited.
                    </p>
                    <p>
                      Partner company logos are the property of their respective owners and are used with permission.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Privacy Policy Content */}
            {activeTab === "privacy" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Privacy Policy</h2>
                <div className="text-muted-foreground space-y-4">
                  <h3 className="font-semibold text-foreground">1. Collection of personal data</h3>
                  <p>This website processes personal data through the contact form, consultation booking and payment, invoice issuance, and GDPR rights requests. Collected data includes:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Full name</li>
                    <li>Email address</li>
                    <li>Phone number (optional)</li>
                    <li>Message content</li>
                    <li>IP address (automatically collected)</li>
                    <li>Session cookies</li>
                    <li>Requested date and time, consultation request, and booking reference</li>
                    <li>Invoice information; card data is handled directly by Stripe</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">2. Legal basis for processing</h3>
                  <p>The processing of your personal data is based on:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Your explicit consent (Article 6.1.a of GDPR)</li>
                    <li>Execution of a contact request (Article 6.1.b of GDPR)</li>
                    <li>Legitimate interest of the data controller (Article 6.1.f of GDPR)</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">3. Data usage</h3>
                  <p>Personal data is used only for:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Responding to your contact requests and questions</li>
                    <li>Providing requested information or services</li>
                    <li>Improving service quality and performance</li>
                    <li>Complying with legal and regulatory obligations</li>
                    <li>Preventing fraud and abuse</li>
                  </ul>
                  <p className="mt-4"><strong>No sale or commercial use:</strong> Your data is not sold or used for commercial purposes. It may be transmitted to the processors strictly required to operate the service, as described in the dedicated section below.</p>

                  <h3 className="font-semibold text-foreground mt-4">4. Data retention</h3>
                  <p>Personal data is retained for:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Contact data:</strong> 3 years after your last contact or until your deletion request</li>
                    <li><strong>Access logs:</strong> Maximum 90 days</li>
                    <li><strong>Cookies:</strong> According to your consent (up to 13 months)</li>
                  </ul>
                  <p className="mt-4">After this period, your data is deleted or anonymized irreversibly.</p>

                  <h3 className="font-semibold text-foreground mt-4">5. Data security</h3>
                  <p>We implement appropriate security measures to protect your data:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>SSL/TLS encryption for transmissions</li>
                    <li>Restricted access to personal data</li>
                    <li>Secure servers with firewalls</li>
                    <li>Regular encrypted backups</li>
                    <li>Compliance with industry security standards</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">6. Your GDPR rights</h3>
                  <p>Under the General Data Protection Regulation (GDPR), you have the following rights:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Right of access:</strong> Obtain a copy of your personal data</li>
                    <li><strong>Right of rectification:</strong> Correct inaccurate or incomplete data</li>
                    <li><strong>Right to be forgotten:</strong> Request deletion of your data</li>
                    <li><strong>Right to restrict processing:</strong> Limit the use of your data</li>
                    <li><strong>Right to data portability:</strong> Receive your data in a structured format</li>
                    <li><strong>Right to object:</strong> Object to the processing of your data</li>
                    <li><strong>Right not to be subject to automated decision-making:</strong> Right to human intervention</li>
                  </ul>
                  <p className="mt-4">To exercise these rights, please contact us through the contact form with the mention "GDPR Request".</p>

                  <h3 className="font-semibold text-foreground mt-4">7. Cookies and tracking technologies</h3>
                  <p>This website uses the following types of cookies:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Essential cookies:</strong> Necessary for website operation</li>
                    <li><strong>Performance cookies:</strong> Analyze website usage</li>
                    <li><strong>Preference cookies:</strong> Remember your choices (language, theme)</li>
                  </ul>
                  <p className="mt-4">You can refuse non-essential cookies by configuring your browser.</p>

                  <h3 className="font-semibold text-foreground mt-4">8. Data controller</h3>
                  <p><strong>Controller:</strong> Dr. Ahmed Ben Lallahom<br /><strong>Address:</strong> France<br /><strong>Contact:</strong> Via the contact form on the website</p>

                  <h3 className="font-semibold text-foreground mt-4">9. Right to lodge a complaint</h3>
                  <p>If you believe your GDPR rights are not being respected, you have the right to lodge a complaint with the competent supervisory authority.</p>
                </div>
              </section>
            )}

            {/* Terms of Use Content */}
            {activeTab === "terms" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Terms of Use</h2>
                <div className="text-muted-foreground space-y-4">
                  <h3 className="font-semibold text-foreground">1. Acceptance of terms</h3>
                  <p>By accessing and using this website, you fully accept these terms of use. If you do not accept these terms, please do not use this website.</p>

                  <h3 className="font-semibold text-foreground mt-4">2. Service description</h3>
                  <p>This website provides professional information and consultation on anesthesiology-intensive care, healthcare entrepreneurship and related services. The website is provided for informational purposes only.</p>

                  <h3 className="font-semibold text-foreground mt-4">3. Acceptable use</h3>
                  <p>You agree to use this website only for legal purposes and in compliance with all applicable laws and regulations. You agree not to:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Use the website for illegal, fraudulent or unauthorized purposes</li>
                    <li>Reproduce, distribute or transmit content without prior written authorization</li>
                    <li>Access or attempt to access unauthorized areas of the website</li>
                    <li>Transmit viruses, Trojans or malicious software</li>
                    <li>Harass, threaten, defame or intimidate other users</li>
                    <li>Collect or track personal information of other users</li>
                    <li>Use robots, scrapers or automated tools to access the website</li>
                    <li>Overload or disrupt normal website operation</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">4. Intellectual property</h3>
                  <p>All website content (texts, images, logos, videos, graphics, etc.) is protected by intellectual property and copyright laws. You may only use this content for your personal, non-commercial use.</p>
                  <p className="mt-4"><strong>Restrictions:</strong> You may not reproduce, copy, modify, adapt, sell or distribute the content.</p>

                  <h3 className="font-semibold text-foreground mt-4">5. Limitation of liability</h3>
                  <p><strong>Medical disclaimer:</strong> The information provided on this website is for informational purposes only and does not constitute professional medical advice. It does not replace a consultation with a qualified healthcare professional.</p>
                  <p className="mt-4"><strong>Accuracy of information:</strong> While we strive to maintain the accuracy of information, we do not guarantee the absence of errors or omissions.</p>
                  <p className="mt-4"><strong>No warranty:</strong> The website is provided "as is" without any warranty of any kind, express or implied.</p>

                  <h3 className="font-semibold text-foreground mt-4">6. External links</h3>
                  <p>This website may contain links to external websites. We are not responsible for the content, accuracy or privacy practices of these external websites.</p>

                  <h3 className="font-semibold text-foreground mt-4">7. Website availability</h3>
                  <p>We strive to maintain the website available 24/7. However, we do not guarantee uninterrupted availability. The website may be temporarily unavailable for maintenance or technical reasons.</p>

                  <h3 className="font-semibold text-foreground mt-4">8. Modifications to terms</h3>
                  <p>We reserve the right to modify these terms of use at any time. Modifications will be effective upon publication on the website.</p>

                  <h3 className="font-semibold text-foreground mt-4">9. Applicable law</h3>
                  <p>These terms of use are governed by French law. Any dispute arising from the use of the website will be subject to the exclusive jurisdiction of French courts.</p>

                  <h3 className="font-semibold text-foreground mt-4">10. Contact</h3>
                  <p>For any questions regarding these terms of use, please contact us via the contact form on the website.</p>
                </div>
              </section>
            )}
          </div>

          {/* Last update date */}
          <section className="pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Last updated: July 2026
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function LegalPageDe() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab") as "legal" | "privacy" | "terms" | null;
  const [activeTab, setActiveTab] = useState<"legal" | "privacy" | "terms">(tabParam || "legal");

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Rechtliche Hinweise | Dr. Ahmed Ben Lallahom"
        description="Rechtliche Hinweise, Datenschutzrichtlinie, Nutzungsbedingungen und GDPR-Informationen für die Website von Dr. Ahmed Ben Lallahom."
        ogUrl="https://drahmedbenlallahom.com/legal"
      />
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="container mb-8">
          <Breadcrumb items={[{ label: "Rechtliche Hinweise" }]} />
        </div>

        <div className="container max-w-4xl">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-12">
            Rechtliche Hinweise
          </h1>

          {/* Interactive Tabs */}
          <div className="mb-12">
            <div role="tablist" aria-label="Legal sections" className="legal-tabs flex gap-4 mb-8 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "legal"}
                onClick={() => setActiveTab("legal")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "legal"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Rechtliche Informationen
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "privacy"}
                onClick={() => setActiveTab("privacy")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "privacy"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Datenschutzrichtlinie
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "terms"}
                onClick={() => setActiveTab("terms")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "terms"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Nutzungsbedingungen
              </button>
            </div>

            {/* Legal Information Content */}
            {activeTab === "legal" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Rechtliche Informationen</h2>
                
                <div className="text-muted-foreground space-y-6">
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Website-Herausgeber</h3>
                    <div className="space-y-2">
                      <p><strong>Name:</strong> Dr. Ahmed Ben Lallahom</p>
                      <p><strong>Status:</strong> Unabhängiger Gesundheitsfachmann</p>
                      <p><strong>Adresse:</strong> Frankreich</p>
                      <p><strong>Telefon:</strong> +33 9 72 15 24 13</p>
                      <p><strong>E-Mail:</strong> Verfügbar über das Kontaktformular</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Hosting-Anbieter</h3>
                    <div className="space-y-2">
                      <p><strong>Name:</strong> Manus</p>
                      <p><strong>Adresse:</strong> Cloud-Infrastruktur</p>
                      <p><strong>Service:</strong> Website-Hosting und Bereitstellung</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Geistiges Eigentum</h3>
                    <p className="mb-4">
                      Alle Inhalte dieser Website (Texte, Bilder, Logos, Videos usw.) sind durch Gesetze zum Schutz des geistigen Eigentums geschützt. Jede Vervielfältigung, Verbreitung oder Nutzung von Inhalten ohne vorherige schriftliche Genehmigung ist streng verboten.
                    </p>
                    <p>
                      Logos von Partnerunternehmen sind Eigentum ihrer jeweiligen Besitzer und werden mit Genehmigung verwendet.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Privacy Policy Content */}
            {activeTab === "privacy" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Datenschutzrichtlinie</h2>
                <div className="text-muted-foreground space-y-4">
                  <h3 className="font-semibold text-foreground">1. Erfassung personenbezogener Daten</h3>
                  <p>Diese Website verarbeitet personenbezogene Daten über das Kontaktformular, die Buchung und Zahlung einer Konsultation, die Ausstellung von Rechnungen und die Bearbeitung von DSGVO-Anfragen. Zu den Daten gehören:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Vollständiger Name</li>
                    <li>E-Mail-Adresse</li>
                    <li>Telefonnummer (optional)</li>
                    <li>Nachrichteninhalt</li>
                    <li>IP-Adresse (automatisch erfasst)</li>
                    <li>Sitzungs-Cookies</li>
                    <li>Gewünschtes Datum und Uhrzeit, Konsultationsanfrage und Buchungsreferenz</li>
                    <li>Rechnungsdaten; Kartendaten werden direkt von Stripe verarbeitet</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">2. Rechtsgrundlage für die Verarbeitung</h3>
                  <p>Die Verarbeitung Ihrer personenbezogenen Daten basiert auf:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Ihre ausdrückliche Zustimmung (Artikel 6.1.a der DSGVO)</li>
                    <li>Erfüllung einer Kontaktanfrage (Artikel 6.1.b der DSGVO)</li>
                    <li>Berechtigtes Interesse des Datenverantwortlichen (Artikel 6.1.f der DSGVO)</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">3. Datennutzung</h3>
                  <p>Personenbezogene Daten werden nur verwendet für:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Beantwortung Ihrer Kontaktanfragen und Fragen</li>
                    <li>Bereitstellung angeforderte Informationen oder Dienstleistungen</li>
                    <li>Verbesserung der Servicequalität und Leistung</li>
                    <li>Einhaltung gesetzlicher und behördlicher Verpflichtungen</li>
                    <li>Betrugsprävention und Missbrauchsbekämpfung</li>
                  </ul>
                  <p className="mt-4"><strong>Kein Verkauf oder keine kommerzielle Nutzung:</strong> Ihre Daten werden nicht verkauft oder für kommerzielle Zwecke genutzt. Sie können an die für den Betrieb des Dienstes unbedingt erforderlichen Auftragsverarbeiter übermittelt werden, wie im entsprechenden Abschnitt beschrieben.</p>

                  <h3 className="font-semibold text-foreground mt-4">4. Datenspeicherung</h3>
                  <p>Personenbezogene Daten werden gespeichert für:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Kontaktdaten:</strong> 3 Jahre nach Ihrem letzten Kontakt oder bis zu Ihrer Löschanfrage</li>
                    <li><strong>Zugriffsprotokolle:</strong> Maximal 90 Tage</li>
                    <li><strong>Cookies:</strong> Gemäß Ihrer Zustimmung (bis zu 13 Monaten)</li>
                  </ul>
                  <p className="mt-4">Nach diesem Zeitraum werden Ihre Daten gelöscht oder unwiederbringlich anonymisiert.</p>

                  <h3 className="font-semibold text-foreground mt-4">5. Datensicherheit</h3>
                  <p>Wir implementieren angemessene Sicherheitsmaßnahmen zum Schutz Ihrer Daten:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>SSL/TLS-Verschlüsselung für Übertragungen</li>
                    <li>Eingeschränkter Zugriff auf personenbezogene Daten</li>
                    <li>Sichere Server mit Firewalls</li>
                    <li>Regelmäßige verschlüsselte Sicherungen</li>
                    <li>Einhaltung von Branchensicherheitsstandards</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">6. Ihre DSGVO-Rechte</h3>
                  <p>Gemäß der Datenschutz-Grundverordnung (DSGVO) haben Sie folgende Rechte:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Auskunftsrecht:</strong> Erhalten Sie eine Kopie Ihrer personenbezogenen Daten</li>
                    <li><strong>Recht auf Berichtigung:</strong> Korrigieren Sie ungenaue oder unvollständige Daten</li>
                    <li><strong>Recht auf Vergessenwerden:</strong> Fordern Sie die Löschung Ihrer Daten an</li>
                    <li><strong>Recht auf Einschränkung der Verarbeitung:</strong> Beschränken Sie die Nutzung Ihrer Daten</li>
                    <li><strong>Recht auf Datenportabilität:</strong> Erhalten Sie Ihre Daten in strukturiertem Format</li>
                    <li><strong>Widerspruchsrecht:</strong> Widersprechen Sie der Verarbeitung Ihrer Daten</li>
                    <li><strong>Recht nicht automatisierter Entscheidungsfindung:</strong> Recht auf menschliche Intervention</li>
                  </ul>
                  <p className="mt-4">Um diese Rechte auszuüben, kontaktieren Sie uns bitte über das Kontaktformular mit dem Vermerk "DSGVO-Anfrage".</p>

                  <h3 className="font-semibold text-foreground mt-4">7. Cookies und Tracking-Technologien</h3>
                  <p>Diese Website verwendet die folgenden Arten von Cookies:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Essenzielle Cookies:</strong> Notwendig für den Website-Betrieb</li>
                    <li><strong>Performance-Cookies:</strong> Analysieren die Website-Nutzung</li>
                    <li><strong>Präferenz-Cookies:</strong> Merken Sie sich Ihre Einstellungen (Sprache, Design)</li>
                  </ul>
                  <p className="mt-4">Sie können nicht-essenzielle Cookies ablehnen, indem Sie Ihren Browser konfigurieren.</p>

                  <h3 className="font-semibold text-foreground mt-4">8. Datenverantwortlicher</h3>
                  <p><strong>Verantwortlicher:</strong> Dr. Ahmed Ben Lallahom<br /><strong>Adresse:</strong> Frankreich<br /><strong>Kontakt:</strong> Über das Kontaktformular auf der Website</p>

                  <h3 className="font-semibold text-foreground mt-4">9. Beschwerderecht</h3>
                  <p>Wenn Sie der Ansicht sind, dass Ihre DSGVO-Rechte nicht respektiert werden, haben Sie das Recht, eine Beschwerde bei der zuständigen Aufsichtsbehörde einzureichen.</p>
                </div>
              </section>
            )}

            {/* Terms of Use Content */}
            {activeTab === "terms" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">Nutzungsbedingungen</h2>
                <div className="text-muted-foreground space-y-4">
                  <h3 className="font-semibold text-foreground">1. Zustimmung zu den Bedingungen</h3>
                  <p>Durch den Zugriff auf und die Nutzung dieser Website akzeptieren Sie vollständig diese Nutzungsbedingungen. Wenn Sie diese Bedingungen nicht akzeptieren, verwenden Sie diese Website bitte nicht.</p>

                  <h3 className="font-semibold text-foreground mt-4">2. Dienstbeschreibung</h3>
                  <p>Diese Website bietet professionelle Informationen und Beratung zu Anästhesiologie-Intensivmedizin, Healthcare-Unternehmertum und verwandten Dienstleistungen. Die Website wird nur zu Informationszwecken bereitgestellt.</p>

                  <h3 className="font-semibold text-foreground mt-4">3. Akzeptable Nutzung</h3>
                  <p>Sie erklären sich damit einverstanden, diese Website nur für rechtmäßige Zwecke und in Übereinstimmung mit allen geltenden Gesetzen und Vorschriften zu nutzen. Sie verpflichten sich nicht zu:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Nutzen Sie die Website für illegale, betrügerische oder nicht autorisierte Zwecke</li>
                    <li>Reproduzieren, verteilen oder übertragen Sie Inhalte ohne vorherige schriftliche Genehmigung</li>
                    <li>Greifen Sie auf nicht autorisierte Bereiche der Website zu oder versuchen Sie dies</li>
                    <li>Übertragen Sie Viren, Trojaner oder Malware</li>
                    <li>Belästigen, bedrohen, verleumden oder bedrohen Sie andere Benutzer</li>
                    <li>Sammeln oder verfolgen Sie persönliche Informationen anderer Benutzer</li>
                    <li>Verwenden Sie Bots, Scraper oder automatisierte Tools für den Website-Zugriff</li>
                    <li>Überlasten oder unterbrechen Sie den normalen Website-Betrieb</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">4. Geistiges Eigentum</h3>
                  <p>Alle Website-Inhalte (Texte, Bilder, Logos, Videos, Grafiken usw.) sind durch Gesetze zum Schutz des geistigen Eigentums und Urheberrechte geschützt. Sie dürfen diese Inhalte nur für Ihre persönliche, nicht-kommerzielle Nutzung verwenden.</p>
                  <p className="mt-4"><strong>Einschränkungen:</strong> Sie dürfen die Inhalte nicht vervielfältigen, kopieren, ändern, anpassen, verkaufen oder verteilen.</p>

                  <h3 className="font-semibold text-foreground mt-4">5. Haftungsbeschränkung</h3>
                  <p><strong>Medizinischer Haftungsausschluss:</strong> Die auf dieser Website bereitgestellten Informationen dienen nur zu Informationszwecken und stellen keine professionelle medizinische Beratung dar. Sie ersetzen keine Konsultation mit einem qualifizierten Gesundheitsfachmann.</p>
                  <p className="mt-4"><strong>Genauigkeit der Informationen:</strong> Obwohl wir uns bemühen, die Genauigkeit der Informationen zu gewährleisten, garantieren wir nicht das Fehlen von Fehlern oder Auslassungen.</p>
                  <p className="mt-4"><strong>Keine Garantie:</strong> Die Website wird "wie besehen" ohne jegliche Garantie, ausdrücklich oder stillschweigend, bereitgestellt.</p>

                  <h3 className="font-semibold text-foreground mt-4">6. Externe Links</h3>
                  <p>Diese Website kann Links zu externen Websites enthalten. Wir sind nicht verantwortlich für den Inhalt, die Genauigkeit oder die Datenschutzpraktiken dieser externen Websites.</p>

                  <h3 className="font-semibold text-foreground mt-4">7. Website-Verfügbarkeit</h3>
                  <p>Wir bemühen uns, die Website 24/7 verfügbar zu halten. Wir garantieren jedoch keine ununterbrochene Verfügbarkeit. Die Website kann vorübergehend für Wartungs- oder technische Gründe nicht verfügbar sein.</p>

                  <h3 className="font-semibold text-foreground mt-4">8. Änderungen der Bedingungen</h3>
                  <p>Wir behalten uns das Recht vor, diese Nutzungsbedingungen jederzeit zu ändern. Änderungen werden wirksam, sobald sie auf der Website veröffentlicht werden.</p>

                  <h3 className="font-semibold text-foreground mt-4">9. Anwendbares Recht</h3>
                  <p>Diese Nutzungsbedingungen unterliegen französischem Recht. Alle Streitigkeiten, die sich aus der Nutzung der Website ergeben, unterliegen der ausschließlichen Gerichtsbarkeit französischer Gerichte.</p>

                  <h3 className="font-semibold text-foreground mt-4">10. Kontakt</h3>
                  <p>Bei Fragen zu diesen Nutzungsbedingungen kontaktieren Sie uns bitte über das Kontaktformular auf der Website.</p>
                </div>
              </section>
            )}
          </div>

          {/* Last update date */}
          <section className="pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Zuletzt aktualisiert: Juli 2026
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function LegalPageZh() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab") as "legal" | "privacy" | "terms" | null;
  const [activeTab, setActiveTab] = useState<"legal" | "privacy" | "terms">(tabParam || "legal");

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="法律声明 | Dr. Ahmed Ben Lallahom"
        description="Dr. Ahmed Ben Lallahom网站的法律声明、隐私政策、使用条款和GDPR信息。"
        ogUrl="https://drahmedbenlallahom.com/legal"
      />
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="container mb-8">
          <Breadcrumb items={[{ label: "法律声明" }]} />
        </div>

        <div className="container max-w-4xl">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-12">
            法律声明
          </h1>

          {/* Interactive Tabs */}
          <div className="mb-12">
            <div role="tablist" aria-label="Legal sections" className="legal-tabs flex gap-4 mb-8 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "legal"}
                onClick={() => setActiveTab("legal")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "legal"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                法律信息
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "privacy"}
                onClick={() => setActiveTab("privacy")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "privacy"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                隐私政策
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "terms"}
                onClick={() => setActiveTab("terms")}
                className={`shrink-0 pb-4 px-4 font-semibold transition-colors whitespace-nowrap ${
                  activeTab === "terms"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                使用条款
              </button>
            </div>

            {/* Legal Information Content */}
            {activeTab === "legal" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">法律信息</h2>
                
                <div className="text-muted-foreground space-y-6">
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">网站编辑</h3>
                    <div className="space-y-2">
                      <p><strong>姓名：</strong> Dr. Ahmed Ben Lallahom</p>
                      <p><strong>身份：</strong> 独立医疗专业人士</p>
                      <p><strong>地址：</strong> 法国</p>
                      <p><strong>电话：</strong> +33 9 72 15 24 13</p>
                      <p><strong>电子邮件：</strong> 可通过联系表格获取</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-3">托管服务商</h3>
                    <div className="space-y-2">
                      <p><strong>名称：</strong> Manus</p>
                      <p><strong>地址：</strong> 云基础设施</p>
                      <p><strong>服务：</strong> 网站托管和部署</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground mb-3">知识产权</h3>
                    <p className="mb-4">
                      本网站上的所有内容（文本、图像、徽标、视频等）均受知识产权法保护。未经事先书面授权，严禁复制、分发或使用任何内容。
                    </p>
                    <p>
                      合作公司的徽标是其各自所有者的财产，经许可使用。
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Privacy Policy Content */}
            {activeTab === "privacy" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">隐私政策</h2>
                <div className="text-muted-foreground space-y-4">
                  <h3 className="font-semibold text-foreground">1. 个人数据收集</h3>
                  <p>本网站会在联系表格、咨询预约与付款、发票开具以及 GDPR 权利请求的范围内处理个人数据。收集的数据包括：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>全名</li>
                    <li>电子邮件地址</li>
                    <li>电话号码（可选）</li>
                    <li>消息内容</li>
                    <li>IP地址（自动收集）</li>
                    <li>会话Cookie</li>
                    <li>期望的日期和时间、咨询请求以及预约编号</li>
                    <li>发票所需信息；银行卡数据由 Stripe 直接处理</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">2. 数据处理的法律依据</h3>
                  <p>您个人数据的处理基于：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>您的明确同意（GDPR第6.1.a条）</li>
                    <li>执行联系请求（GDPR第6.1.b条）</li>
                    <li>数据控制者的合法利益（GDPR第6.1.f条）</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">3. 数据使用</h3>
                  <p>个人数据仅用于：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>回复您的联系请求和问题</li>
                    <li>提供所请求的信息或服务</li>
                    <li>改进服务质量和性能</li>
                    <li>遵守法律和监管义务</li>
                    <li>防止欺诈和滥用</li>
                  </ul>
                  <p className="mt-4"><strong>不出售或商业使用：</strong>我们不会出售您的数据，也不会将其用于商业目的。为提供服务所必需的数据可能会按照下方专门章节的说明提供给相关处理者。</p>

                  <h3 className="font-semibold text-foreground mt-4">4. 数据保留</h3>
                  <p>个人数据保留：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>联系数据：</strong> 自您最后联系之日起3年或直到您的删除请求</li>
                    <li><strong>访问日志：</strong> 最多90天</li>
                    <li><strong>Cookie：</strong> 根据您的同意（最多13个月）</li>
                  </ul>
                  <p className="mt-4">此期限后，您的数据将被不可逆地删除或匿名化。</p>

                  <h3 className="font-semibold text-foreground mt-4">5. 数据安全</h3>
                  <p>我们实施适当的安全措施来保护您的数据：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>传输的SSL/TLS加密</li>
                    <li>对个人数据的受限访问</li>
                    <li>带防火墙的安全服务器</li>
                    <li>定期加密备份</li>
                    <li>符合行业安全标准</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">6. 您的GDPR权利</h3>
                  <p>根据《通用数据保护条例》(GDPR)，您拥有以下权利：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>访问权：</strong> 获取您个人数据的副本</li>
                    <li><strong>更正权：</strong> 更正不准确或不完整的数据</li>
                    <li><strong>被遗忘权：</strong> 请求删除您的数据</li>
                    <li><strong>处理限制权：</strong> 限制您数据的使用</li>
                    <li><strong>数据可携带权：</strong> 以结构化格式接收您的数据</li>
                    <li><strong>反对权：</strong> 反对您数据的处理</li>
                    <li><strong>不受自动决策约束的权利：</strong> 获得人工干预的权利</li>
                  </ul>
                  <p className="mt-4">要行使这些权利，请通过联系表格与我们联系，并注明"GDPR请求"。</p>

                  <h3 className="font-semibold text-foreground mt-4">7. Cookie和跟踪技术</h3>
                  <p>本网站使用以下类型的Cookie：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>必要Cookie：</strong> 网站运营所需</li>
                    <li><strong>性能Cookie：</strong> 分析网站使用情况</li>
                    <li><strong>偏好Cookie：</strong> 记住您的选择（语言、主题）</li>
                  </ul>
                  <p className="mt-4">您可以通过配置浏览器来拒绝非必要的Cookie。</p>

                  <h3 className="font-semibold text-foreground mt-4">8. 数据控制者</h3>
                  <p><strong>控制者：</strong> Dr. Ahmed Ben Lallahom<br /><strong>地址：</strong> 法国<br /><strong>联系：</strong> 通过网站上的联系表格</p>

                  <h3 className="font-semibold text-foreground mt-4">9. 投诉权</h3>
                  <p>如果您认为您的GDPR权利未得到尊重，您有权向主管监管机构提出投诉。</p>
                </div>
              </section>
            )}

            {/* Terms of Use Content */}
            {activeTab === "terms" && (
              <section className="space-y-6 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-foreground">使用条款</h2>
                <div className="text-muted-foreground space-y-4">
                  <h3 className="font-semibold text-foreground">1. 条款接受</h3>
                  <p>通过访问和使用本网站，您完全接受这些使用条款。如果您不接受这些条款，请不要使用本网站。</p>

                  <h3 className="font-semibold text-foreground mt-4">2. 服务描述</h3>
                  <p>本网站提供有关麻醉学-重症监护、医疗保健创业和相关服务的专业信息和咨询。该网站仅供信息之用。</p>

                  <h3 className="font-semibold text-foreground mt-4">3. 可接受的使用</h3>
                  <p>您同意仅出于合法目的并符合所有适用的法律和法规使用本网站。您同意不：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>为非法、欺诈或未授权目的使用网站</li>
                    <li>未经事先书面授权复制、分发或传输内容</li>
                    <li>访问或尝试访问网站的未授权区域</li>
                    <li>传输病毒、木马或恶意软件</li>
                    <li>骚扰、威胁、诽谤或恐吓其他用户</li>
                    <li>收集或跟踪其他用户的个人信息</li>
                    <li>使用机器人、爬虫或自动化工具访问网站</li>
                    <li>过载或中断网站的正常运行</li>
                  </ul>

                  <h3 className="font-semibold text-foreground mt-4">4. 知识产权</h3>
                  <p>本网站上的所有内容（文本、图像、徽标、视频、图形等）均受知识产权和版权法保护。您只能将此内容用于个人、非商业用途。</p>
                  <p className="mt-4"><strong>限制：</strong> 您不能复制、复制、修改、改编、销售或分发内容。</p>

                  <h3 className="font-semibold text-foreground mt-4">5. 责任限制</h3>
                  <p><strong>医学免责声明：</strong> 本网站上提供的信息仅供信息之用，不构成专业医学建议。它不能替代与合格医疗专业人士的咨询。</p>
                  <p className="mt-4"><strong>信息准确性：</strong> 虽然我们努力保持信息的准确性，但我们不保证不存在错误或遗漏。</p>
                  <p className="mt-4"><strong>无保证：</strong> 网站按"原样"提供，不提供任何形式的保证，无论是明示的还是暗示的。</p>

                  <h3 className="font-semibold text-foreground mt-4">6. 外部链接</h3>
                  <p>本网站可能包含指向外部网站的链接。我们不对这些外部网站的内容、准确性或隐私惯例负责。</p>

                  <h3 className="font-semibold text-foreground mt-4">7. 网站可用性</h3>
                  <p>我们努力保持网站24/7可用。但是，我们不保证不间断的可用性。网站可能因维护或技术原因而暂时不可用。</p>

                  <h3 className="font-semibold text-foreground mt-4">8. 条款修改</h3>
                  <p>我们保留随时修改这些使用条款的权利。修改将在网站上发布后生效。</p>

                  <h3 className="font-semibold text-foreground mt-4">9. 适用法律</h3>
                  <p>这些使用条款受法国法律管辖。因使用网站而引起的任何争议将受法国法院的专属管辖权。</p>

                  <h3 className="font-semibold text-foreground mt-4">10. 联系</h3>
                  <p>如有任何关于这些使用条款的问题，请通过网站上的联系表格与我们联系。</p>
                </div>
              </section>
            )}
          </div>

          {/* Last update date */}
          <section className="pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              最后更新：2026年7月
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
