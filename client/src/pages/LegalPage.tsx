import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { SEOHead } from "@/components/SEOHead";

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
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Retour à l'accueil
          </Link>
        </div>

        <div className="container max-w-4xl">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-12">
            Mentions Légales
          </h1>

          {/* Éditeur du site */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Éditeur du site</h2>
            <div className="text-muted-foreground space-y-2">
              <p><strong>Nom :</strong> Dr. Ahmed Ben Lallahom</p>
              <p><strong>Statut :</strong> Professionnel de santé indépendant</p>
              <p><strong>Adresse :</strong> France</p>
              <p><strong>Téléphone :</strong> +33 9 72 15 24 13</p>
              <p><strong>Email :</strong> Disponible via le formulaire de contact</p>
            </div>
          </section>

          {/* Hébergeur */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Hébergeur</h2>
            <div className="text-muted-foreground space-y-2">
              <p><strong>Nom :</strong> Manus</p>
              <p><strong>Adresse :</strong> Infrastructure cloud</p>
              <p><strong>Service :</strong> Hébergement et déploiement de sites web</p>
            </div>
          </section>

          {/* Propriété intellectuelle */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Propriété Intellectuelle</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                L'ensemble du contenu de ce site (textes, images, logos, vidéos, etc.) est protégé par les lois sur la propriété intellectuelle. Toute reproduction, distribution ou utilisation du contenu sans autorisation écrite préalable est strictement interdite.
              </p>
              <p>
                Les logos des entreprises partenaires sont la propriété de leurs propriétaires respectifs et sont utilisés avec permission.
              </p>
            </div>
          </section>

          {/* Politique de Confidentialité */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Politique de Confidentialité</h2>
            <div className="text-muted-foreground space-y-4">
              <h3 className="font-semibold text-foreground">1. Collecte de données personnelles</h3>
              <p>Ce site collecte des données personnelles uniquement via le formulaire de contact. Les données collectées incluent :</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Nom complet</li>
                <li>Adresse email</li>
                <li>Numéro de téléphone (optionnel)</li>
                <li>Contenu du message</li>
                <li>Adresse IP (automatiquement collectée)</li>
                <li>Cookies de session</li>
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
              <p className="mt-4"><strong>Aucun partage avec des tiers :</strong> Vos données ne sont jamais partagées avec des tiers sans votre consentement explicite, sauf si la loi l'exige.</p>

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

              <h3 className="font-semibold text-foreground mt-4">9. Droit de plainte</h3>
              <p>Si vous estimez que vos droits RGPD ne sont pas respectés, vous avez le droit de déposer une plainte auprès de la CNIL (Commission Nationale de l'Informatique et des Libertés).</p>
            </div>
          </section>

          {/* Conditions Générales d'Utilisation */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Conditions Générales d'Utilisation</h2>
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
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>

        <div className="container max-w-4xl">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-12">
            Legal Notice
          </h1>

          {/* Website Editor */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Website Editor</h2>
            <div className="text-muted-foreground space-y-2">
              <p><strong>Name:</strong> Dr. Ahmed Ben Lallahom</p>
              <p><strong>Status:</strong> Independent healthcare professional</p>
              <p><strong>Address:</strong> France</p>
              <p><strong>Phone:</strong> +33 9 72 15 24 13</p>
              <p><strong>Email:</strong> Available via contact form</p>
            </div>
          </section>

          {/* Hosting Provider */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Hosting Provider</h2>
            <div className="text-muted-foreground space-y-2">
              <p><strong>Name:</strong> Manus</p>
              <p><strong>Address:</strong> Cloud infrastructure</p>
              <p><strong>Service:</strong> Website hosting and deployment</p>
            </div>
          </section>

          {/* Intellectual Property */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Intellectual Property</h2>
            <div className="text-muted-foreground space-y-4">
              <p>All content on this website (texts, images, logos, videos, etc.) is protected by intellectual property laws. Any reproduction, distribution, or use of content without prior written authorization is strictly prohibited.</p>
              <p>Partner company logos are the property of their respective owners and are used with permission.</p>
            </div>
          </section>

          {/* Privacy Policy */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Privacy Policy</h2>
            <div className="text-muted-foreground space-y-4">
              <h3 className="font-semibold text-foreground">1. Collection of personal data</h3>
              <p>This website collects personal data only through the contact form. Collected data includes:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Full name</li>
                <li>Email address</li>
                <li>Phone number (optional)</li>
                <li>Message content</li>
                <li>IP address (automatically collected)</li>
                <li>Session cookies</li>
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
              <p className="mt-4"><strong>No sharing with third parties:</strong> Your data is never shared with third parties without your explicit consent, unless required by law.</p>

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

          {/* Terms of Use */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Terms of Use</h2>
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
              <p>All website content (texts, images, logos, videos, graphics, etc.) is protected by intellectual property and copyright laws. You may only use this content for personal, non-commercial purposes.</p>
              <p className="mt-4"><strong>Restrictions:</strong> You may not reproduce, copy, modify, adapt, sell or distribute the content.</p>

              <h3 className="font-semibold text-foreground mt-4">5. Limitation of liability</h3>
              <p><strong>Medical disclaimer:</strong> Information provided on this website is for informational purposes only and does not constitute professional medical advice. It does not replace consultation with a qualified healthcare professional.</p>
              <p className="mt-4"><strong>Accuracy of information:</strong> While we strive to maintain accuracy, we do not guarantee the absence of errors or omissions.</p>
              <p className="mt-4"><strong>No warranty:</strong> The website is provided "as is" without any warranty, express or implied.</p>

              <h3 className="font-semibold text-foreground mt-4">6. External links</h3>
              <p>This website may contain links to external websites. We are not responsible for the content, accuracy or privacy practices of these external sites.</p>

              <h3 className="font-semibold text-foreground mt-4">7. Website availability</h3>
              <p>We strive to keep the website available 24/7. However, we do not guarantee uninterrupted availability. The website may be temporarily unavailable for maintenance or technical reasons.</p>

              <h3 className="font-semibold text-foreground mt-4">8. Modifications to terms</h3>
              <p>We reserve the right to modify these terms of use at any time. Modifications will be effective upon publication on the website.</p>

              <h3 className="font-semibold text-foreground mt-4">9. Applicable law</h3>
              <p>These terms of use are governed by French law. Any dispute arising from the use of the website will be subject to the exclusive jurisdiction of French courts.</p>

              <h3 className="font-semibold text-foreground mt-4">10. Contact</h3>
              <p>For any questions about these terms of use, please contact us through the contact form on the website.</p>
            </div>
          </section>

          {/* Last Update */}
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
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Impressum | Dr. Ahmed Ben Lallahom"
        description="Impressum, Datenschutzrichtlinie und Nutzungsbedingungen der Website von Dr. Ahmed Ben Lallahom."
        ogUrl="https://drahmedbenlallahom.com/legal"
      />
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="container mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Zurück zur Startseite
          </Link>
        </div>

        <div className="container max-w-4xl">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-12">
            Impressum
          </h1>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Webseitenbetreiber</h2>
            <div className="text-muted-foreground space-y-2">
              <p><strong>Name:</strong> Dr. Ahmed Ben Lallahom</p>
              <p><strong>Status:</strong> Unabhängiger Gesundheitsfachmann</p>
              <p><strong>Adresse:</strong> Frankreich</p>
              <p><strong>Telefon:</strong> +33 9 72 15 24 13</p>
              <p><strong>E-Mail:</strong> Verfügbar über das Kontaktformular</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Hosting-Anbieter</h2>
            <div className="text-muted-foreground space-y-2">
              <p><strong>Name:</strong> Manus</p>
              <p><strong>Adresse:</strong> Cloud-Infrastruktur</p>
              <p><strong>Service:</strong> Website-Hosting und -Bereitstellung</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Datenschutzrichtlinie</h2>
            <div className="text-muted-foreground space-y-4">
              <p>Alle Inhalte dieser Website sind nach deutschem und internationalem Recht geschützt. Weitere Details finden Sie in unserer ausführlichen Datenschutzerklärung.</p>
              <p>Ihre Daten werden nur für die Beantwortung Ihrer Anfragen verwendet und nicht an Dritte weitergegeben.</p>
              <p>Sie haben das Recht, Ihre Daten zu sehen, zu korrigieren oder zu löschen. Kontaktieren Sie uns über das Kontaktformular.</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Nutzungsbedingungen</h2>
            <div className="text-muted-foreground space-y-4">
              <p>Durch die Nutzung dieser Website akzeptieren Sie alle geltenden Gesetze und Vorschriften.</p>
              <p>Der Inhalt dieser Website ist urheberrechtlich geschützt. Eine Vervielfältigung ohne Genehmigung ist nicht gestattet.</p>
              <p>Medizinische Informationen dienen nur zu Informationszwecken und ersetzen keine professionelle medizinische Beratung.</p>
            </div>
          </section>

          <section className="pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Letzte Aktualisierung: Juli 2026
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function LegalPageZh() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="法律声明 | Dr. Ahmed Ben Lallahom"
        description="Dr. Ahmed Ben Lallahom网站的法律声明、隐私政策和使用条款。"
        ogUrl="https://drahmedbenlallahom.com/legal"
      />
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="container mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </Link>
        </div>

        <div className="container max-w-4xl">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-12">
            法律声明
          </h1>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">网站编辑</h2>
            <div className="text-muted-foreground space-y-2">
              <p><strong>姓名：</strong>Dr. Ahmed Ben Lallahom</p>
              <p><strong>身份：</strong>独立医疗专业人士</p>
              <p><strong>地址：</strong>法国</p>
              <p><strong>电话：</strong>+33 9 72 15 24 13</p>
              <p><strong>电子邮件：</strong>通过联系表格提供</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">托管提供商</h2>
            <div className="text-muted-foreground space-y-2">
              <p><strong>名称：</strong>Manus</p>
              <p><strong>地址：</strong>云基础设施</p>
              <p><strong>服务：</strong>网站托管和部署</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">隐私政策</h2>
            <div className="text-muted-foreground space-y-4">
              <p>本网站的所有内容均受中国和国际法律保护。</p>
              <p>您的数据仅用于回答您的查询，不会与第三方共享。</p>
              <p>您有权查看、更正或删除您的数据。请通过联系表格与我们联系。</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">使用条款</h2>
            <div className="text-muted-foreground space-y-4">
              <p>使用本网站即表示您接受所有适用的法律和法规。</p>
              <p>本网站的内容受版权保护。未经许可，不得复制。</p>
              <p>医学信息仅供参考，不能替代专业医学建议。</p>
            </div>
          </section>

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
