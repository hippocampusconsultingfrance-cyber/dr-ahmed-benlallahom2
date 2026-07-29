# Project TODO

- [x] Basic site structure with Navigation, Hero, About, Values, Experience, Services, Education, Contact, Footer
- [x] Bilingual FR/EN system with language toggle
- [x] Content stored in easily editable data files (content-fr.ts, content-en.ts, site-config.ts)
- [x] Dark "Midnight Authority" design with ECG motifs, cyan accents, gold prestige markers
- [x] Responsive design (mobile + desktop)
- [x] Scroll reveal animations
- [x] Contact form with mailto fallback
- [x] Upgrade to backend with database (web-db-user feature)
- [x] Functional contact form with tRPC backend API
- [x] Contact messages saved to database
- [x] Owner notification on new contact form submission
- [x] Vitest tests for contact form validation
- [x] Renommer section "Expériences & Ventures" en "Leadership & Entreprises" (FR) / "Leadership & Ventures" (EN)
- [x] Préciser les rôles : CEO pour Hippocampus, Co-fondateur pour les autres entreprises
- [x] Créer des sous-pages dédiées pour chaque société (Hippocampus, Laska, Appel Médical Tunisie, Octopus Talent, Sawa4You, Pratique Clinique)
- [x] Ajouter le routing vers les sous-pages depuis la section Leadership
- [x] Contenu bilingue FR/EN pour chaque sous-page société
- [x] Ajouter section Direction sur la page Hippocampus Consulting
- [x] Inclure les 5 membres : Ahmed, Youssef, Omar, Lotfi, Monia Ben Lallahom
- [x] Silhouettes placeholder pour chaque membre (remplaçables par vraies photos)
- [x] Remplacer les silhouettes par les photos LinkedIn de chaque membre (Lotfi et Monia restent en silhouette - pas de profil LinkedIn public)
- [x] Ajouter les liens vers les sites web des sociétés (Laska: laskacorp.com, Octopus: octopustalent.io, Sawa4You: sawayou.com)
- [x] Mettre à jour la section Formation avec les 15 diplômes exacts (2006-2024)
- [x] Ajouter section Direction sur Laska Corporate et Appel Médical Tunisie (Amine, Sonia, Ahmed)
- [x] Ajouter section Direction sur Sawa4You (Wafa, Amine, Sonia, Ahmed)
- [x] Ajouter section Direction sur Octopus Talent (Ahmed, Sonia, Amine, Ines)
- [x] Corriger toutes les photos des membres de direction (Ines, Amine, Wafa, Sonia, Youssef, Omar, Monia, Lotfi, Ahmed)
- [x] Remplacer la photo de la section À Propos par un portrait professionnel médical généré par IA
- [x] Remplacer l'image hero par une photo cinématique générée par IA (Dr. Ahmed en tenue médicale dans un ICU high-tech)
- [x] Mettre à jour la section Formation avec les intitulés complets des diplômes (16 entrées, 2006-2026) en FR et EN
- [x] Ajouter le logo Octopus Talent sur la sous-page entreprise
- [x] Ajouter les logos Hippocampus Consulting, Laska Corporate et Appel Médical Tunisie
- [x] Ajouter une page Mentions Légales (FR/EN) avec RGPD, conditions d'utilisation, hébergeur
- [x] Optimiser le SEO : balises meta, Open Graph, Twitter Card, canonical URLs
- [x] Ajouter robots.txt et sitemap.xml pour l'indexation par les moteurs de recherche
- [x] Ajouter un bouton WhatsApp flottant en bas à droite
- [x] Ajouter l'allemand et le chinois avec drapeaux pour chaque langue
- [x] Ajouter un favicon personnalisé avec monogramme AB
- [x] Remplacer le bouton de changement de langue par une liste déroulante
- [x] Ajouter les métadonnées structurées Schema.org (Person, Organization, LocalBusiness, WebSite)
- [x] Développer complètement la Politique de Confidentialité (9 sections) avec détails RGPD
- [x] Développer complètement les Conditions Générales d'Utilisation (10 sections) en FR et EN
- [x] Ajouter versions simplifiées en allemand et chinois pour la page Mentions Légales
- [x] Vérifier que la page Mentions Légales s'affiche correctement sur le site en direct
- [x] Ajouter champ gdprConsent au schéma de base de données (table contact_messages)
- [x] Créer table gdpr_requests pour gérer les demandes RGPD
- [x] Mettre à jour le formulaire de contact avec case à cocher "J'accepte la Politique de Confidentialité"
- [x] Créer formulaire GDPR dédié pour les demandes d'accès, rectification, suppression, portabilité, opposition
- [x] Ajouter procédure tRPC contact.submit avec validation du consentement RGPD
- [x] Ajouter procédure tRPC gdpr.submit pour traiter les demandes RGPD
- [x] Créer composant GDPRRequestForm pour le formulaire GDPR
- [x] Créer page GDPRPage avec route /gdpr
- [x] Ajouter contenu multilingue pour le formulaire GDPR (FR, EN, DE, ZH)
- [x] Écrire tests vitest pour validation des schémas GDPR et contact (38 tests)
- [x] Tous les tests passent avec succès
- [x] Vérifier que le formulaire de contact affiche correctement la case à cocher RGPD
- [x] Vérifier que la page GDPR est accessible et affiche le formulaire complet
- [x] Ajouter système d'onglets interactifs sur la page Mentions Légales (Politique de Confidentialité, Conditions Générales)
- [x] Restructurer les onglets avec 3 sections cliquables : Informations Légales, Politique de Confidentialité, Conditions Générales
- [x] Rendre les liens "Politique de Confidentialité" et "Conditions Générales" cliquables dans le footer

## Corrections et Tests Identifiés

- [ ] Corriger les statistiques dans la section "À Propos" (9+ années, 5+ entreprises, 16+ certifications, 3 langues)
- [ ] Tester la soumission du formulaire de contact sans cocher GDPR (doit être rejeté)
- [ ] Tester la soumission du formulaire de contact avec GDPR coché (doit être accepté)
- [ ] Vérifier la responsive design sur mobile (375x812)
- [ ] Vérifier la responsive design sur tablet (768x1024)
- [ ] Tester le changement de langue vers l'anglais (EN)
- [ ] Tester le changement de langue vers l'allemand (DE)
- [ ] Tester le changement de langue vers le chinois (ZH)

## Indexation Google et Configuration des Domaines

- [x] Vérifier la configuration des domaines personnalisés (www.drahmedbenlallahom.com et drahmedbenlallahom.com)
- [x] Créer guide complet pour l'indexation Google et Google Search Console
- [ ] Soumettre le site à Google Search Console pour l'indexation (manuel - voir guide)
- [ ] Créer et soumettre le sitemap.xml à Google (manuel - voir guide)
- [ ] Vérifier les redirections des domaines vers le site Manus
- [ ] Vérifier que le site est accessible via les domaines personnalisés
- [ ] Attendre l'indexation par Google (3-7 jours)

## Système d'Avis/Témoignages

- [x] Créer le schéma de base de données pour les avis/témoignages
- [x] Créer les procédures tRPC pour gérer les avis (testimonials.list)
- [x] Créer le composant TestimonialsSection pour la page d'accueil
- [x] Créer la page dédiée Testimonials avec tous les avis et filtrage par note
- [x] Ajouter les avis de démonstration multilingues (FR, EN, DE, ZH) - 10 avis total
- [x] Ajouter le Review Schema (JSON-LD) pour Google Rich Snippets
- [x] Intégrer tRPC dans les composants frontend
- [x] Ajouter support du schéma structuré au composant SEOHead
- [x] Écrire et valider 15 tests vitest pour le système complet
- [x] Tous les tests passent avec succès

## Améliorations et Corrections du Système de Témoignages

- [ ] Ajouter gestion des états d'erreur dans TestimonialsSection (loading, error, empty states)
- [ ] Ajouter gestion des états d'erreur dans TestimonialsPage (loading, error, empty states)
- [ ] Corriger le schéma Review JSON-LD pour utiliser les types Schema.org appropriés
- [ ] Modifier SEOHead pour injecter les scripts JSON-LD sans écraser les schémas existants
- [ ] Ajouter tests tRPC end-to-end pour les procédures testimonials.list
- [ ] Ajouter tests UI pour les composants TestimonialsSection et TestimonialsPage
- [ ] Valider que tous les tests vitest passent (pnpm test)

## Système de Réservation et Paiement Stripe

- [x] Créer la table appointments dans la base de données
- [x] Créer les procédures tRPC appointments.create et appointments.createCheckoutSession
- [x] Créer le formulaire de réservation frontend (BookingPage.tsx)
- [x] Intégrer Stripe Checkout pour le paiement
- [x] Configurer le webhook Stripe pour la réconciliation de paiement
- [x] Configurer les notifications email/SMS après paiement confirmé
- [x] Ajouter le bouton "Réserver une Consultation" sur la page d'accueil
- [x] Corriger le bug tracking_id trop long (varchar(20) vs 27 chars)
- [x] Corriger le bug URL invalide pour Stripe success_url/cancel_url
- [x] Tester le flux complet : création réservation → Stripe Checkout → URL valide
- [x] Changer les textes "Témoignages de Patients" en "Témoignages des Partenaires"
