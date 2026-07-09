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

  return <LegalPageFr />;
}

function LegalPageFr() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Mentions Légales | Dr. Ahmed Ben Lallahom"
        description="Mentions légales, RGPD, conditions d'utilisation et informations légales du site Dr. Ahmed Ben Lallahom."
        ogUrl="https://drahmedbenlallahom.com/legal"
      />
      <Navigation />
      <main className="pt-24 pb-20">
        {/* Back Button */}
        <div className="container mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Retour à l'accueil
          </Link>
        </div>

        {/* Content */}
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
              <p><strong>Téléphone :</strong> Disponible via le formulaire de contact</p>
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

          {/* Responsabilité */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Limitation de Responsabilité</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                Le site est fourni à titre informatif. Bien que nous nous efforçons de maintenir l'exactitude des informations, nous ne garantissons pas l'absence d'erreurs ou d'omissions.
              </p>
              <p>
                Les informations médicales présentées sur ce site sont à titre informatif uniquement et ne constituent pas un avis médical professionnel. Veuillez consulter un professionnel de santé qualifié pour toute question médicale.
              </p>
              <p>
                Nous ne sommes pas responsables des dommages directs ou indirects résultant de l'utilisation ou de l'impossibilité d'utiliser ce site.
              </p>
            </div>
          </section>

          {/* Données personnelles et RGPD */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Données Personnelles et RGPD</h2>
            <div className="text-muted-foreground space-y-4">
              <h3 className="font-semibold text-foreground">Collecte de données</h3>
              <p>
                Ce site peut collecter des données personnelles via le formulaire de contact. Les données collectées incluent votre nom, adresse email et message.
              </p>

              <h3 className="font-semibold text-foreground mt-4">Utilisation des données</h3>
              <p>
                Les données personnelles sont utilisées uniquement pour :
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Répondre à vos demandes de contact</li>
                <li>Améliorer la qualité du service</li>
              </ul>

              <h3 className="font-semibold text-foreground mt-4">Durée de conservation</h3>
              <p>
                Les données personnelles sont conservées pendant une durée raisonnable nécessaire pour traiter votre demande, puis supprimées conformément à la réglementation applicable.
              </p>

              <h3 className="font-semibold text-foreground mt-4">Vos droits</h3>
              <p>
                Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Droit d'accès à vos données personnelles</li>
                <li>Droit de rectification des données inexactes</li>
                <li>Droit à l'oubli (suppression des données)</li>
                <li>Droit à la portabilité des données</li>
                <li>Droit d'opposition au traitement</li>
              </ul>
              <p className="mt-4">
                Pour exercer ces droits, veuillez nous contacter via le formulaire de contact.
              </p>

              <h3 className="font-semibold text-foreground mt-4">Cookies</h3>
              <p>
                Ce site utilise des cookies pour améliorer l'expérience utilisateur. Vous pouvez configurer votre navigateur pour refuser les cookies, bien que cela puisse affecter certaines fonctionnalités du site.
              </p>
            </div>
          </section>

          {/* Conditions d'utilisation */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Conditions d'Utilisation</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                En accédant et en utilisant ce site, vous acceptez de respecter toutes les lois et réglementations applicables. Vous vous engagez à ne pas :
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Utiliser le site à des fins illégales ou non autorisées</li>
                <li>Reproduire ou distribuer le contenu sans permission</li>
                <li>Accéder ou tenter d'accéder à des zones non autorisées</li>
                <li>Transmettre des virus ou logiciels malveillants</li>
                <li>Harceler ou menacer d'autres utilisateurs</li>
              </ul>
            </div>
          </section>

          {/* Modifications */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Modifications</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                Nous nous réservons le droit de modifier ces mentions légales à tout moment. Les modifications seront effectives dès leur publication sur le site. Votre utilisation continue du site après les modifications signifie votre acceptation des nouvelles conditions.
              </p>
            </div>
          </section>

          {/* Contact */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Contact</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                Pour toute question concernant ces mentions légales ou le traitement de vos données personnelles, veuillez nous contacter via le formulaire de contact sur le site.
              </p>
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
        description="Legal notice, GDPR, terms of use and legal information for Dr. Ahmed Ben Lallahom's website."
        ogUrl="https://drahmedbenlallahom.com/legal"
      />
      <Navigation />
      <main className="pt-24 pb-20">
        {/* Back Button */}
        <div className="container mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>

        {/* Content */}
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
              <p><strong>Phone:</strong> Available via contact form</p>
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
              <p>
                All content on this website (texts, images, logos, videos, etc.) is protected by intellectual property laws. Any reproduction, distribution, or use of content without prior written authorization is strictly prohibited.
              </p>
              <p>
                Partner company logos are the property of their respective owners and are used with permission.
              </p>
            </div>
          </section>

          {/* Disclaimer */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Disclaimer</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                The website is provided for informational purposes only. While we strive to maintain the accuracy of information, we do not guarantee the absence of errors or omissions.
              </p>
              <p>
                Medical information presented on this website is for informational purposes only and does not constitute professional medical advice. Please consult a qualified healthcare professional for any medical questions.
              </p>
              <p>
                We are not responsible for any direct or indirect damages resulting from the use or inability to use this website.
              </p>
            </div>
          </section>

          {/* Personal Data and GDPR */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Personal Data and GDPR</h2>
            <div className="text-muted-foreground space-y-4">
              <h3 className="font-semibold text-foreground">Data Collection</h3>
              <p>
                This website may collect personal data through the contact form. Collected data includes your name, email address, and message.
              </p>

              <h3 className="font-semibold text-foreground mt-4">Data Usage</h3>
              <p>
                Personal data is used only for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Responding to your contact requests</li>
                <li>Improving service quality</li>
              </ul>

              <h3 className="font-semibold text-foreground mt-4">Data Retention</h3>
              <p>
                Personal data is retained for a reasonable period necessary to process your request, then deleted in accordance with applicable regulations.
              </p>

              <h3 className="font-semibold text-foreground mt-4">Your Rights</h3>
              <p>
                Under the General Data Protection Regulation (GDPR), you have the following rights:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Right to access your personal data</li>
                <li>Right to rectify inaccurate data</li>
                <li>Right to be forgotten (data deletion)</li>
                <li>Right to data portability</li>
                <li>Right to object to processing</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, please contact us through the contact form.
              </p>

              <h3 className="font-semibold text-foreground mt-4">Cookies</h3>
              <p>
                This website uses cookies to improve user experience. You can configure your browser to refuse cookies, although this may affect certain website features.
              </p>
            </div>
          </section>

          {/* Terms of Use */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Terms of Use</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                By accessing and using this website, you agree to comply with all applicable laws and regulations. You agree not to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Use the website for illegal or unauthorized purposes</li>
                <li>Reproduce or distribute content without permission</li>
                <li>Access or attempt to access unauthorized areas</li>
                <li>Transmit viruses or malicious software</li>
                <li>Harass or threaten other users</li>
              </ul>
            </div>
          </section>

          {/* Modifications */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Modifications</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                We reserve the right to modify these legal notices at any time. Modifications will be effective upon publication on the website. Your continued use of the website after modifications signifies your acceptance of the new terms.
              </p>
            </div>
          </section>

          {/* Contact */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Contact</h2>
            <div className="text-muted-foreground space-y-4">
              <p>
                For any questions regarding these legal notices or the processing of your personal data, please contact us through the contact form on the website.
              </p>
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
