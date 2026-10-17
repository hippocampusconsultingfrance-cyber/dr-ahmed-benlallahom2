# Audit de lancement commercial — 12 octobre 2026

**Site :** drahmedbenlallahom.com — consultation payante du Dr Ahmed Ben Lallahom et plateforme de recrutement Hippocampus Consulting.
**Version auditée :** commit `095cdba` (branche `main` après la PR #64, avec la PR #65 : photos et logos locaux).
**Objet :** dire si le site peut être lancé commercialement, en testant chaque espace.

---

## 1. Verdict

### ❌ Pas prêt pour le lancement commercial de la **consultation payante**
La technique de paiement fonctionne : réservation, paiement, emails, remboursement et protections ont tous été testés de bout en bout. En revanche, **le cadre juridique de la vente n'existe pas encore** :
- la consultation n'a pas de qualification juridique (acte médical ou conseil) ;
- il n'y a ni CGV, ni droit de rétractation, ni facture conforme, ni consentement pour les données de santé.

Ces points ne se corrigent pas uniquement dans le code : ils demandent d'abord des **décisions de votre part, avec un avocat en droit de la santé et votre expert-comptable**.

### ⚠️ **Recrutement et espace candidat** : lançables après 2 corrections bloquantes
- Une faille permet de **prendre le contrôle d'un futur espace candidat** et de lire ses pièces d'identité.
- Le portail candidat accepte des **casiers judiciaires et des justificatifs de vaccination**, et les fait analyser par une IA externe (Manus Forge).

Ces deux corrections sont faisables dans le code en quelques jours. Il faut ajouter les points majeurs sur le RGPD des candidats (section 4).

### ✅ **Site vitrine** (présentation, ventures, FAQ, contact) : lançable après quelques corrections visibles
Trois défauts sont visibles par les visiteurs :
- le logo disparaît sur mobile ;
- l'accueil affiche « PORTRAIT OFFICIEL À AJOUTER » à la place de votre photo ;
- les témoignages notés avec badge « Vérifié » posent problème pour un médecin et sont à retirer.

---

## 2. Méthode et couverture

Le site en ligne et les services externes (Stripe, Resend, Clerk, Cloudflare, Google) ne sont pas joignables depuis l'environnement d'audit. J'ai donc construit une **réplique complète du site** :
- le code de production a été construit à l'identique ;
- il tourne sur une vraie base PostgreSQL ;
- un émulateur reproduit le routage Vercel (`vercel.json`) ;
- les services tiers sont simulés de façon réaliste. Les signatures Stripe sont vraiment vérifiées, la double authentification admin est la vraie, et les emails et les factures PDF sont capturés et lus.

| Espace testé | Vérifications réussies | Constats |
|---|---|---|
| Réservation & paiement | 46 | 17 |
| Juridique & conformité | 26 | 24 |
| Sécurité | 31 | 11 |
| Recrutement & espace candidat | 54 | 23 |
| Back-office admin | 60 | 21 |
| Site public (27 pages × mobile/desktop × thèmes × 4 langues) | 42 | 31 |
| Performance, SEO & exploitation | 27 | 26 |
| **Total** | **286** | **153 bruts (≈ 120 problèmes distincts)** |

Chaque constat **bloquant ou majeur (58)** a ensuite été revérifié par un relecteur chargé de le réfuter :
- **49 confirmés tels quels** ;
- **9 confirmés avec une sévérité ajustée** : 4 doublons fusionnés, 5 sévérités revues (3 abaissées, 2 ramenées de bloquant à majeur) ;
- **aucun réfuté**.

La liste exhaustive (ID, preuve, recommandation) figure en **Annexe A**. La couverture détaillée est en **Annexe B**. Ce qui reste à vérifier en production est en **Annexe C** et dans la **section 7**.

---

## 3. Ce qui fonctionne bien

- **Contrôle d'accès admin solide.**
  - Les 65 procédures admin refusent l'accès sans connexion, sans droits admin ou sans le code de double authentification (68/68 refus pour un utilisateur non admin).
  - La double authentification résiste au rejeu et à la force brute.
- **Aucune faille XSS.** Des charges malveillantes ont été injectées dans **tous** les formulaires publics. Elles restent inertes dans les 13 onglets admin, sur la page d'accueil et dans les questions publiées.
- **Paiement robuste.**
  - Les signatures Stripe sont vérifiées, ainsi que les montants.
  - Une même réservation n'est jamais confirmée deux fois.
  - Deux patients ne peuvent pas réserver le même créneau.
  - Le remboursement est idempotent : un double clic ne rembourse pas deux fois.
  - Un paiement qui ne peut pas être confirmé n'est jamais perdu.
- **Tâches planifiées sécurisées.** Les 7 tâches répondent avec le secret et refusent sans.
- **Export CSV protégé** contre l'injection de formules.
- **Documents candidats chiffrés.** Les téléchargements passent par des routes authentifiées.
- **Référencement.** 27 pages ont leur propre titre, description et canonical. Il n'y a aucune violation de CSP et aucun secret dans le code envoyé au navigateur.
- **Performance sur ordinateur excellente** : LCP < 1 s et aucun décalage de mise en page (CLS = 0) partout.
- **Qualité du code.** TypeScript ne signale aucune erreur, 584 tests réussissent et le budget de performance est respecté.
- **Recrutement sans frais pour les candidats**, conformément à l'article L5321-3 du Code du travail. La grille de notation de l'IA n'utilise aucun critère discriminatoire.

---

## 4. Points bloquants (à régler avant tout lancement commercial)

| # | Problème | Espace | Qui |
|---|---|---|---|
| **B1** | **Nature juridique de la consultation non tranchée** : le site vend tour à tour un « conseil en santé », une « consultation » par un « médecin anesthésiste-réanimateur », via la SARL Hippocampus Consulting. Selon la qualification (acte médical ou service commercial), tout change : vendeur, TVA, hébergement HDS, droit de rétractation, médiateur, déontologie. *(LEGAL-01)* | Consultation | **Vous + avocat santé / CDOM** |
| **B2** | **Pas de CGV ni d'information avant paiement, aucune case d'acceptation.** Le droit de rétractation de 14 jours n'est ni annoncé ni écarté régulièrement : la clause « non remboursable à moins de 24 h » ne suffit pas. Aucun médiateur de la consommation n'est désigné. *(BOOK-CGV, LEGAL-03, LEGAL-04, LEGAL-05)* | Consultation | **Vous + avocat** (puis code : page /cgv + cases obligatoires) |
| **B3** | **Facture non conforme.** Le numéro n'est pas séquentiel (`INV-APT…` aléatoire). Le vendeur n'est pas identifié (ni SIREN, ni adresse, ni TVA). La facture indique « TOTAL TTC » sans régime de TVA. **L'heure du rendez-vous est en UTC** : un rendez-vous à 19:00 apparaît à 17:00, à côté de la « majoration de nuit ». *(BOOK-INVOICE-LEGAL, LEGAL-06, BOOK-INVOICE-TZ, LEGAL-07)* | Consultation | **Comptable** (régime TVA, entité) puis **code** |
| **B4** | **Données de santé collectées sans consentement explicite.** Le champ obligatoire « Décrivez votre situation » recueille des données de santé (RGPD art. 9). Elles sont recopiées en clair dans les emails vers une boîte Gmail. Elles sont stockées chez des prestataires a priori non certifiés HDS (Vercel, Neon, Resend), ce qui est à faire valider. *(LEGAL-09, BOOK-HEALTHDATA, LEGAL-10)* | Consultation | **Vous + avocat** (choix : ne plus collecter, ou consentement + HDS), puis **code** |
| **B5** | **Prise de contrôle d'un espace candidat.** Une personne qui connaît seulement l'email d'un candidat crée l'espace avant lui avec SON mot de passe. Le candidat active ensuite son compte et dépose son passeport. L'attaquant se connecte et **télécharge les documents**. Le problème a été reproduit de bout en bout. *(SEC-02, CAND-16)* | Candidat | **Code** |
| **B6** | **Documents sensibles dans le portail candidat.** Les catégories « Casier / extrait judiciaire » et « Justificatif de vaccination » sont acceptées. Leur contenu déchiffré est **envoyé à l'IA de Manus Forge**, sous-traitant non déclaré dans la politique de confidentialité. *(LEGAL-12, OPS-02)* | Candidat | **Code** (retirer les catégories, couper l'IA sur ces documents) + **vous** (prestataire IA) |

---

## 5. Points majeurs (à corriger avant ou juste après le lancement)

### Réservation & paiement
- **M1 — Envoi après paiement fragile.** Si l'envoi immédiat échoue, ni le patient ni le médecin ne sont prévenus avant la tâche du lendemain matin. La notification au médecin part *après* l'email patient, dans la même tâche. *(BOOK-FULFILL-RETRY)*
- **M2 — Aucun délai minimal de réservation.** On peut réserver et payer 2 minutes avant le créneau. La session de paiement reste même ouverte après l'heure de début. *(BOOK-LEADTIME)*
- **M3 — Annulation par le médecin impossible proprement.** Le remboursement est refusé à moins de 24 h, même quand c'est le médecin qui annule. L'annulation depuis l'admin libère le créneau sans rembourser ni prévenir le patient. *(BOOK-DOCTOR-CANCEL)*
- **M4 — Emails patients incomplets.**
  - Il manque les modalités (visio ? téléphone ?), un contact pour annuler et la mention « heure de Paris ».
  - L'expéditeur est `recrutement@` et il n'y a pas d'adresse de réponse.
  - La réponse aux questions santé part sous l'identité « Hippocampus Consulting ».

  *(BOOK-EMAIL-CONTENT, LEGAL-24, OPS-07, ADM-MQ-02)*
- **M5 — Retour arrière depuis Stripe.** Le formulaire se vide et le créneau du patient reste bloqué 30 minutes (« déjà réservé »). *(BOOK-BACKNAV)*
- **M6 — Aucun lien juridique sur `/booking`, la confirmation et `/candidate/access`.** Ces pages n'ont pas de pied de page. *(LEGAL-23)*

### Recrutement & espace candidat
- **M7 — Effacement RGPD incomplet.** Le bouton « Effacer RGPD » supprime une seule ligne. Restent :
  - le CV dans le stockage, et sa copie Google Drive ;
  - les expériences, langues et certifications extraites ;
  - l'espace candidat et ses documents.

  *(CAND-02, ADM-ERASE-01)*
- **M8 — Aucune suppression à l'échéance de conservation.** La tâche de rétention se contente d'envoyer un email. La politique de confidentialité promet pourtant une suppression irréversible. *(CAND-03, LEGAL-13)*
- **M9 — Candidats mal informés.** Ils ne sont pas avertis de la transmission de leur profil aux employeurs, y compris hors UE, avec le « Score IA ». *(CAND-23, LEGAL-22)*
- **M10 — Lien d'invitation trop court.** Le lien « Créer mon espace » expire **30 minutes** après l'envoi, sans que l'email le dise. *(CAND-11)*
- **M11 — Capacité d'analyse insuffisante.** Seulement **5 CV analysés par jour**. Au-delà, la file grossit, puis le formulaire refuse les candidatures (503). Avec une IA lente, la tâche dépasse la limite de 60 s. *(CAND-05, OPS-03)*
- **M12 — Fichiers refusés par Vercel au-delà de 4,5 Mo.** Le site annonce pourtant 5 Mo pour les CV et 10 Mo pour les documents. *(OPS-09, CAND-06)*
- **M13 — CV piégé.** Un CV compressé de moins de 1 Mo fait monter la mémoire à 3,6 Go pendant l'analyse. *(SEC-09)*
- **M14 — Rafales d'alertes.** Une rafale d'échecs de connexion envoie **30 emails d'alerte en 2 secondes** au propriétaire. *(CAND-15)*

### Back-office admin
- **M15 — Google Drive connectable sans double authentification.** Cela remplace le jeton utilisé pour l'export des CV. *(ADM-DRIVE-02)*
- **M16 — Code de double authentification refusé.** Après deux envois, le code du **dernier** email est refusé, ce qui peut bloquer l'accès admin pendant 10 minutes. *(ADM-MFA-01)*
- **M17 — Note interne effacée.** Changer le statut d'une candidature efface la note du recruteur. *(ADM-REC-01)*
- **M18 — Missions employeurs incomplètes.** Les coordonnées et le besoin détaillé de l'employeur ne sont visibles nulle part dans l'admin. *(ADM-BRIEF-01)*

### Site public
- **M19 — Logo absent sur mobile.** Il disparaît de l'en-tête sur les téléphones de 393 px de large et moins : iPhone, Android courants. *(PUB-UI-01)*
- **M20 — Portrait manquant.** L'accueil affiche « PORTRAIT OFFICIEL À AJOUTER ». Votre photo existe pourtant déjà sur le site. *(PUB-CONTENT-01)*
- **M21 — Questions santé sans suivi.** Aucune notification au médecin, aucun accusé de réception au patient. *(PUB-FORM-01)*
- **M22 — Témoignages problématiques pour un médecin.** Ils sont notés en étoiles et portent un badge « Vérifié », posé d'office sans vérification, sur la page qui vend la consultation. Le Code de déontologie interdit les témoignages de tiers dans la communication du médecin (art. R4127-19-1). **À retirer avant le lancement.** *(LEGAL-08)*

### Juridique & RGPD (textes à faire valider)
- **M23 — Mentions légales incomplètes** : adresse et téléphone de l'hébergeur, profession réglementée, RPPS, TVA. *(LEGAL-02)*
- **M24 — Politique de confidentialité et registre des traitements dépassés.** Les prestataires d'IA, les transferts hors UE et Google Fonts y manquent. Le registre cite encore Manus comme hébergeur. *(LEGAL-14, OPS-08)*
- **M25 — Consentement à la publication imposé.** Il faut accepter la publication de sa question pour obtenir une réponse : ce consentement n'est donc pas libre. *(LEGAL-11)*
- **M26 — Communication à revoir au regard du Code de déontologie.**
  - L'expérience annoncée est incohérente : « plus d'une décennie » et « 9+ ans ».
  - On y trouve des superlatifs et une promesse de résultat.
  - Des établissements sont cités.

  *(LEGAL-16, PUB-CONTENT-03)*

### Exploitation
- **M27 — Un oubli de configuration passe inaperçu.** Le contrôle des variables obligatoires **ne s'exécute jamais sur Vercel**. Un `CRON_SECRET` manquant désactive les 7 tâches en silence. Un `CLERK_OWNER_USER_ID` manquant bloque l'admin. *(OPS-01)*
- **M28 — Offre Vercel à changer.** L'offre gratuite **Hobby est réservée à un usage non commercial**. Un site qui vend des consultations doit passer en **Pro**, ce qui permet aussi des tâches horaires au lieu de quotidiennes. *(OPS-04)*
- **M29 — Aucune supervision.** Il n'y a ni suivi d'erreurs ni sonde de disponibilité. Toutes les alertes passent par Resend : si Resend tombe, elles tombent avec. *(OPS-05)*
- **M30 — Configuration « live » des services tiers à faire** : Stripe, Clerk, Google, Turnstile, DNS email. *(OPS-06 — voir section 7)*
- **M31 — Script admin chargé partout.** Clerk, qui ne sert qu'à l'admin, est chargé sur **toutes** les pages publiques. Cela ajoute 110 à 300 Ko de JavaScript et double le temps de blocage sur mobile. *(PERF-01)*
- **M32 — Base de données non reproductible depuis le dépôt.** Les 27 migrations du dépôt sont en syntaxe **MySQL** : 0 sur 136 instructions s'appliquent sur PostgreSQL. En cas de sinistre, la base de production ne peut pas être recréée à partir du dépôt. *(constat de la réplique, voir section 7)*

Les **≈ 80 points mineurs** concernent l'accessibilité, les traductions, le SEO, la robustesse et l'ergonomie admin. Ils sont listés en Annexe A.

---

## 6. Plan d'action

### Étape 1 — Vos décisions, avec avocat et comptable (bloque la consultation payante)
1. **Qualifier la prestation** (B1) : acte médical exercé en votre nom, avec RPPS, ou conseil non médical facturé par la SARL. Un rendez-vous chez un avocat en droit de la santé et un échange avec le CDOM sont recommandés.
2. Faire rédiger les **CGV** (B2) et compléter les **mentions légales** et la **politique de confidentialité** (M23, M24).
3. Faire fixer par l'expert-comptable le **régime de TVA** et l'**entité qui facture** (B3).
4. Décider du sort des **données de santé** (B4) : ne plus les collecter à la réservation (le plus simple), ou consentement explicite et hébergement HDS.
5. **Retirer les témoignages** (M22) et faire relire les textes de présentation (M26).
6. Passer le projet Vercel en **Pro** (M28) et adhérer à un **médiateur de la consommation** si la prestation relève du Code de la consommation.

### Étape 2 — Corrections de code que je peux faire tout de suite, sans attendre l'étape 1
- **Bloquants** : B5 (prise de contrôle de compte) et B6 (catégories sensibles et IA). Pour B3, la numérotation séquentielle et l'heure de Paris ; l'identité du vendeur sera ajoutée quand vous aurez les informations.
- **Réservation** :
  - délai minimal de réservation (M2, 2 h par défaut) ;
  - annulation et remboursement par le médecin (M3) ;
  - reprise des paiements après un retour arrière (M5) ;
  - pied de page juridique (M6) ;
  - envoi plus robuste après paiement (M1).
- **Recrutement** :
  - effacement RGPD complet (M7) ;
  - suppression automatique à l'échéance (M8) ;
  - invitation valable 7 jours (M10) ;
  - traitement continu des CV (M11) ;
  - limites d'envoi de fichiers alignées sur Vercel (M12) ;
  - protection contre les CV piégés (M13) ;
  - regroupement des alertes (M14).
- **Admin** : double authentification sur Google Drive et correction du code refusé (M15, M16), conservation de la note interne (M17), détail des missions (M18).
- **Site public** : logo mobile (M19), votre portrait sur l'accueil (M20), notification et accusé pour les questions santé (M21), consentement de publication facultatif (M25).
- **Exploitation** : vérification des variables obligatoires y compris sur Vercel (M27), Clerk chargé uniquement sur `/admin` (M31), migrations PostgreSQL de référence (M32).
- **Points mineurs** : la plupart.

Chaque lot passera par TypeScript, la suite de tests et une nouvelle exécution sur la réplique avant d'être poussé.

### Étape 3 — Après les corrections
Il restera à intégrer vos textes juridiques et l'identité du vendeur, puis à refaire une **recette rapide en production** (section 7) avant d'ouvrir la vente.

---

## 7. À vérifier en production (impossible depuis l'environnement d'audit)

1. **Stripe en mode live.**
   - Créer l'endpoint `https://drahmedbenlallahom.com/api/stripe/webhook`, abonné à `checkout.session.completed` et `checkout.session.expired`, puis copier son `whsec_` dans Vercel.
   - Faire **un vrai paiement de bout en bout, puis le rembourser.**
2. **Emails.**
   - Configurer SPF, DKIM et DMARC du domaine dans Resend.
   - Vérifier que `contact@`, `recrutement@` et l'adresse de réponse reçoivent bien le courrier.
   - Contrôler le rendu dans Gmail et Outlook : le logo SVG ne s'y affiche pas.
3. **Clerk.** Instance de production sur `clerk.drahmedbenlallahom.com`, compte propriétaire protégé par un mot de passe fort et une application d'authentification (TOTP) ou une passkey.
4. **Variables Vercel (Production).** `CRON_SECRET`, `CLERK_OWNER_USER_ID`, `RESEND_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY` et `VITE_TURNSTILE_SITE_KEY` doivent être présentes. Les 7 tâches doivent apparaître dans Cron Jobs ; en lancer une avec Run doit renvoyer 200.
5. **Envoi de fichiers.** Sur une preview, envoyer un CV de 4,8 Mo et une photo de 8 Mo pour confirmer M12.
6. **Base de données.** M'envoyer un export CSV de `information_schema.columns` de Neon (requête fournie sur demande) : je le compare automatiquement au schéma du code. Vérifier aussi que la **restauration à un instant donné** (PITR) de Neon est active.
7. **Région.** Aligner la région des fonctions Vercel sur celle de Neon (`fra1` ou `cdg1`).
8. **Adresses inconnues.** Vérifier qu'une adresse inconnue renvoie une page 404, et non une page 200 marquée noindex.

---

## Annexe A — Liste exhaustive des constats

Sévérité finale après revérification critique. « Doublon de X » : même problème signalé par deux testeurs, compté une seule fois dans la synthèse. Responsable : **Code** = correction dans le site ; **Vous** = décision, contenu, juriste, comptable ou configuration.


### Réservation & paiement — 17 constats, 46 vérifications réussies

| ID | Sévérité | Constat | Recommandation | Resp. |
|---|---|---|---|---|
| BOOK-CGV | bloquant | Vente en ligne sans CGV ni informations précontractuelles, sans acceptation avant paiement | Faire rédiger des CGV de la consultation couvrant : identité du prestataire ; nature exacte de la prestation (acte médical/téléconsultation ou conseil) ; modalités ; prix TTC ; paiement ; annulation et remboursement ; droit de rétractation ou motif d'exclusion (art. L221-2 et L221-28 C. consom.), avec demande expresse d'exécution avant la fin du délai si la rétractation s'applique ; médiateur de la consommation ;… | Vous |
| BOOK-INVOICE-LEGAL | bloquant | Facture non conforme : numérotation non séquentielle, vendeur non identifié, mention TVA absente | Faire valider par l'expert-comptable le régime de TVA et l'entité qui facture. Ensuite : numérotation séquentielle par compteur en base (séquence PostgreSQL, ex. 2026-000123), attribuée dans la transaction de confirmation et stockée sur le rendez-vous. Bloc vendeur complet : dénomination, forme, capital, RCS/SIREN, adresse, n° TVA ou mention d'exonération. Afficher HT/TVA/TTC ou la mention légale, la date de… | Vous |
| BOOK-BACKNAV | majeur | Retour arrière depuis Stripe : formulaire vidé et créneau du patient bloqué 30 min (« déjà réservé ») | Garder en sessionStorage le rendez-vous en attente et proposer « Reprendre le paiement » (createCheckoutSession) ou « Annuler et choisir un autre créneau » (cancelPending). Conserver la saisie du formulaire. | Code |
| BOOK-DOCTOR-CANCEL | majeur | Annulation par le médecin : remboursement impossible à moins de 24 h ; annulation admin sans remboursement ni avis au patient | Distinguer l'annulation par le patient (règle des 24 h) de l'annulation par le praticien (remboursement intégral toujours possible, motif obligatoire). Permettre de rembourser les paiements non confirmables depuis le tableau de bord. Lors d'une annulation admin d'un rendez-vous payé, proposer le remboursement et envoyer un email au patient. Traiter charge.refunded pour que la base reste à jour quand le… | Code |
| BOOK-EMAIL-CONTENT | majeur | Email de confirmation : aucune modalité de consultation, aucun contact, aucune politique d'annulation | Ajouter la modalité (appel au numéro fourni ou lien visio), "heure de Paris", les coordonnées et un Reply-To vers une boîte suivie, ainsi que la politique d'annulation avec un lien vers les CGV. Utiliser un expéditeur dédié aux consultations, ajouter une version texte et, si possible, envoyer dans la langue du patient. | Vous |
| BOOK-FULFILL-RETRY | majeur | Si l'envoi immédiat échoue, ni le patient ni le médecin ne sont prévenus avant le cron quotidien (24 à 48 h) | Envoyer la notification au propriétaire indépendamment et en premier (job séparé). Réessayer quelques secondes dans le webhook (2 à 3 essais avec backoff). Rendre le cron appointment-fulfillment horaire (plan Vercel Pro). Alerter le médecin dès le premier échec d'envoi après paiement. | Code |
| BOOK-HEALTHDATA | majeur | Le champ libre « Décrivez brièvement votre situation » collecte des données de santé, recopiées par email et stockées hors cadre HDS | Faire valider par le DPO ou un avocat si la consultation relève du soin (art. L1111-8 CSP, hébergement HDS). Sinon, minimiser : motif non médical ou avertissement explicite dans le formulaire, plus de recopie de la demande dans les emails, et base légale art. 9 RGPD documentée. | Vous |
| BOOK-INVOICE-TZ | majeur | La facture affiche l'heure du rendez-vous en UTC (1 à 2 h d'écart) et une date d'émission UTC | Ajouter timeZone: "Europe/Paris" aux deux toLocaleDateString de server/invoice.ts, préciser "heure de Paris" sur la facture et ajouter un test qui la génère avec TZ=UTC. | Code |
| BOOK-LEADTIME | majeur | Aucun délai minimal : un créneau peut être réservé et payé quelques minutes avant (voire après) son début | Imposer un délai minimal configurable (ex. 2 h) côté serveur et client, et limiter expires_at et le hold à l'heure de début du créneau. Afficher ce délai sur la page. | Vous |
| BOOK-BLOCKREASON | mineur | Le motif des dates bloquées est public | Ne renvoyer que les dates futures, sans le motif. | Code |
| BOOK-CANCEL-PAGE-COPY | mineur | Page « paiement interrompu » : étapes de confirmation hors sujet et liens manquants | N'afficher les étapes qu'en cas de succès, et ajouter des liens vers le contact et vers la politique de confidentialité. | Code |
| BOOK-ERROR-MSG | mineur | Une date passée s'affiche « Créneau disponible », puis un message d'erreur générique ; panne Stripe sans consigne | Refuser les dates passées dans le formulaire, afficher le message métier du serveur et un message dédié quand le paiement est indisponible. | Code |
| BOOK-INVALIDCAL | mineur | Le serveur accepte une date impossible (30 février) et la décale sans prévenir | Vérifier côté serveur que la date relue en Europe/Paris correspond à la saisie. | Code |
| BOOK-NO-HORIZON | mineur | Aucun horizon maximal de réservation, téléphone non contrôlé | Limiter l'horizon (ex. 90 jours) et valider le format du téléphone, côté client et serveur. | Code |
| BOOK-OWNER-DUP | mineur | Le propriétaire reçoit deux emails pour chaque réservation | Supprimer sendOwnerNotificationSMS et corriger les messages de log. | Code |
| BOOK-STRIPE-EXPIRY-MARGIN | mineur | expires_at Stripe fixé exactement au minimum autorisé (30 min), sans marge de latence | Donner une marge : expires_at à 31-35 min, avec un hold aligné. | Code |
| BOOK-SUCCESS-UNVERIFIED | mineur *(revu : majeur → mineur)* | La page de succès affirme « Votre consultation est confirmée » sans vérifier le paiement ni le rendez-vous | Ajouter {CHECKOUT_SESSION_ID} à success_url et une requête publique appointments.status(trackingId, session_id) qui renvoie l'état réel (confirmé / en cours de validation / à régulariser), affiché avec un sondage court. Dans le cas non confirmable, informer le patient (page + email) qu'il sera contacté et remboursé. | Code |

### Juridique & conformité — 24 constats, 26 vérifications réussies

| ID | Sévérité | Constat | Recommandation | Resp. |
|---|---|---|---|---|
| LEGAL-01 | bloquant | Nature juridique de la consultation payante non qualifiée (acte médical ou conseil non médical) et cadre d'exercice incompatible en l'état | Avant le lancement, obtenir un avis écrit d'un avocat en droit de la santé et consulter le CDOM de Paris, puis retenir UNE qualification et aligner textes, vendeur, contrat, facture, TVA et hébergement. Si la prestation est médicale : l'exercer en nom propre (ou via une SEL) avec le RPPS affiché sur le site et la facture, utiliser un outil de téléconsultation conforme, un hébergement HDS, une RCP, et retirer la… | Vous |
| LEGAL-03 | bloquant | Aucune CGV ni information précontractuelle pour la consultation payante, aucune acceptation dans le parcours de réservation | Faire rédiger des CGV de la consultation par un avocat. Elles doivent couvrir : vendeur exact, nature de la prestation et ce qu'elle n'est pas, modalité (canal, durée, outil), prix TTC et régime de TVA, paiement, report et annulation par chaque partie, absence ou retard du praticien, rétractation (LEGAL-04), réclamations, médiateur (LEGAL-05), droit applicable. Les publier sur une page dédiée (/cgv). Sur… | Vous |
| LEGAL-04 | bloquant | Droit de rétractation ni annoncé ni écarté régulièrement : clause « non remboursable » et aucun recueil de la demande d'exécution anticipée avec renonciation | Faire trancher la qualification (LEGAL-01). Si la rétractation s'applique : (1) informer dans les CGV et sur /booking du délai de 14 jours, de ses modalités et du formulaire type ; (2) ajouter avant le paiement une case obligatoire et distincte, du type « Je demande expressément que la consultation ait lieu avant la fin du délai de rétractation de 14 jours et je reconnais perdre mon droit de rétractation une fois… | Vous |
| LEGAL-06 | bloquant | Facture non conforme (mentions CGI/Code de commerce, numérotation non séquentielle) et régime de TVA non déterminé (« TOTAL TTC » sans TVA) | Faire valider par l'expert-comptable avant la première vente : (1) le régime de TVA de la prestation, selon la qualification (LEGAL-01) ; (2) l'entité qui facture. Corriger ensuite invoice.ts : identité complète du vendeur (dénomination, forme, capital, siège, SIREN/RCS, TVA ; ou nom du médecin, adresse professionnelle et RPPS si exercice médical), adresse du client (à collecter), numéro séquentiel continu tiré… | Vous |
| LEGAL-09 | bloquant | Données de santé collectées à la réservation sans consentement explicite (RGPD art. 9) ni information à la collecte, puis diffusées en clair par email | Deux options, au choix. (A) Ne plus collecter de données de santé à la réservation : remplacer le champ par « Objet de la demande (sans information médicale) » avec un avertissement explicite, et ne plus recopier ce texte dans les emails. (B) Si la description est nécessaire : ajouter une case distincte et non pré-cochée « J'accepte que les informations de santé que je communique soient traitées pour préparer la… | Vous |
| LEGAL-12 | bloquant | Portail candidat : collecte de casiers judiciaires et de justificatifs de vaccination, documents envoyés à un LLM via Manus Forge, sous-traitant non déclaré | Avant le lancement : (1) retirer la catégorie « Casier / extrait judiciaire » (au besoin, prévoir une simple attestation de présentation saisie par l'admin, sans copie, après validation de l'avocat) ; (2) retirer ou isoler « Justificatif de vaccination », sans analyse IA, en le limitant aux cas où l'employeur l'exige légalement ; (3) suspendre l'analyse IA des pièces d'identité et des documents sensibles, ou… | Vous |
| LEGAL-02 | majeur | Mentions légales incomplètes (LCEN) : hébergeur sans adresse ni téléphone, pas de téléphone éditeur ni de TVA, profession réglementée absente, identité incohérente | Compléter le bloc éditeur (téléphone, TVA intracommunautaire si assujetti, adresse email au nom de domaine) et le bloc hébergeur (Vercel Inc., adresse postale et téléphone à reprendre de vercel.com/legal ; l'adresse couramment publiée, 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis, est à vérifier). Ajouter une rubrique « Profession réglementée » : médecin, qualification, État de délivrance du diplôme,… | Vous |
| LEGAL-05 | majeur | Aucun médiateur de la consommation désigné ni affiché | Si la prestation relève du droit de la consommation : adhérer à un médiateur référencé par la CECMC, puis publier son nom, son site et son adresse dans les CGV, sur /legal et sur /booking, ainsi que la procédure de réclamation préalable (adresse et délai de réponse). Pour l'activité de recrutement B2B, rien n'est requis. | Vous |
| LEGAL-07 | majeur | La facture indique l'heure de la consultation en UTC et non en heure de Paris (date fausse possible la nuit) | Ajouter timeZone: 'Europe/Paris' aux deux toLocaleDateString de invoice.ts et ajouter un test qui vérifie la facture d'un rendez-vous à 00:30 heure de Paris. | Code |
| LEGAL-08 | majeur *(revu : bloquant → majeur)* | Témoignages notés et badge « Vérifié » sur le site d'un médecin : contraire à R4127-19-1 CSP, avis non vérifiés au sens du Code de la consommation | Avant le lancement : retirer les témoignages, les notes et le JSON-LD aggregateRating de toute page qui présente le médecin ou la consultation (accueil, /testimonials), et vérifier en base de production (SELECT * FROM testimonials) qu'aucun avis issu des anciens scripts n'est publié. Si des retours de partenaires B2B (établissements, recruteurs) sont conservés pour Hippocampus Consulting, les placer uniquement… | Vous |
| LEGAL-10 | majeur | Hébergement des données de santé chez des prestataires non certifiés HDS (Vercel, Neon, Resend, Gmail) : risque à faire valider | Faire trancher par l'avocat santé et le DPO externe éventuel : (1) si l'activité est médicale, migrer les données de santé (requestDetails, questions médicales) vers une base et une messagerie certifiées HDS, ou ne plus les collecter sur le site et utiliser un outil de téléconsultation certifié ; (2) ne plus envoyer de contenu de santé par email (envoyer un lien vers un espace authentifié) ; (3) documenter la… | Vous |
| LEGAL-11 | majeur | Questions médicales gratuites : le consentement à la publication est obligatoire pour accéder au service (consentement non libre) et le consentement santé n'est pas explicite | Rendre la case de publication facultative côté client et côté serveur (z.boolean()), le filtre publicationConsent = 1 existant (medicalQuestionsRouter.ts l.115) suffisant à protéger la publication. Reformuler le consentement principal, par exemple : « J’accepte que ma question, qui peut contenir des informations sur ma santé, et mes coordonnées soient traitées pour me répondre par email (consentement retirable à… | Code |
| LEGAL-13 | majeur | Durées de conservation non appliquées : la « purge » ne supprime rien, alors que la politique annonce une suppression irréversible | Fixer avec le conseil une grille par traitement : contacts 3 ans, questions médicales 3 ans, candidatures 2 ans après le dernier contact, réservations et factures 10 ans en archive comptable (données minimales, request_details effacé après la consultation), demandes RGPD 1 an (ou 5 ans pour la preuve), journaux 6 à 12 mois. Implémenter un job planifié qui supprime ou anonymise réellement les lignes et les objets… | Vous |
| LEGAL-14 | majeur | Politique de confidentialité et registre art. 30 incomplets par rapport aux traitements réels (destinataires IA, transferts, bases légales, recrutement) | Réécrire la politique par traitement (finalité, base légale, données, destinataires nommés, pays et garanties, durée, droits), comme le demandait déjà LEGAL_RGPD_AUDIT_2026-08-20.md (priorité 2), en ajoutant les fournisseurs IA (AI Gateway / OpenAI / Google, Manus Forge s'il est conservé), Google Fonts (ou les auto-héberger) et la boîte de notification. Indiquer les transferts vers les États-Unis et leur base… | Vous |
| LEGAL-16 | majeur | Communication du médecin à revoir au regard du Code de déontologie : expérience annoncée incohérente, promesse de résultat, superlatifs, établissements cités, activité médicale mêlée aux sociétés commerciales | Faire relire l'ensemble des contenus de présentation par le CDOM ou l'avocat, puis : harmoniser l'expérience sur un chiffre vérifiable et exact (années d'exercice en France / hors de France), supprimer « garantir » et les superlatifs (« excellence », « de référence », « faire avancer la médecine à l'échelle mondiale »), retirer les noms d'établissements ou obtenir leur accord écrit, afficher la qualification… | Vous |
| LEGAL-22 | majeur | Transmission des profils candidats aux employeurs clients, y compris hors UE et avec le « Score IA », sans information ni base de transfert | Informer le candidat, avant tout envoi, de la communication de son profil à l'établissement nommé et du pays concerné. Recueillir son accord spécifique par mission (email ou portail), ce qui constitue aussi la base la plus sûre pour un transfert hors UE (art. 49.1.a, avec information sur l'absence de garanties) ; à défaut, signer des CCT avec les clients. Retirer la colonne « Score IA » des exports destinés aux… | Vous |
| LEGAL-23 | majeur | /booking, /booking/confirmation et /candidate/access n'ont ni pied de page ni lien vers les mentions légales, les conditions ou la politique de confidentialité | Ajouter le Footer, ou au minimum un bandeau de liens juridiques (Mentions légales, CGV, Confidentialité, Cookies), sur /booking, /booking/confirmation et /candidate/*. Placer un lien vers la politique, et vers les CGV pour la réservation, dans chaque libellé de consentement et à côté du bouton « Procéder au paiement ». | Code |
| LEGAL-24 | majeur | Les emails patients (confirmation, facture, rappel) n'indiquent aucun contact pour annuler et partent d'une adresse « recrutement@ » sans Reply-To | Confirmer qu'une boîte surveillée reçoit les réponses. Ajouter un replyTo patient (par exemple consultation@drahmedbenlallahom.com) aux emails de confirmation, de facture et de rappel, et indiquer dans chacun l'email et le téléphone de contact ainsi que la marche à suivre pour annuler (idéalement un lien d'annulation en libre-service qui applique les CGV). Utiliser un expéditeur dédié à la consultation, distinct… | Vous |
| LEGAL-15 | mineur | Bandeau cookies : refuser les « cookies de préférence » n'a aucun effet, texte de politique obsolète, consentement sans expiration, scripts tiers chargés avant tout choix | Retirer la catégorie « préférence » du bandeau (ou rendre le refus effectif) et décrire la langue et le thème comme des stockages fonctionnels exemptés. Réécrire la section 7 avec la liste réelle des traceurs : cookieConsent, préférences locales, Umami (finalité, durée, éditeur), Turnstile, cookies d'authentification Clerk et candidat. Ajouter l'ancre id="cookies". Horodater le choix et le redemander après 6 mois… | Code |
| LEGAL-17 | mineur | Recrutement : la gratuité pour les candidats n'est pas affichée, le formulaire employeur ne rappelle pas l'interdiction des critères discriminatoires, et l'AI Act est à anticiper | Ajouter sur les pages recrutement et dans l'email de confirmation la mention « Service gratuit pour les candidats : Hippocampus Consulting ne demande jamais de paiement ». Ajouter sous le champ libre du brief employeur : « Les critères liés à l'âge, au sexe, à l'origine, à la nationalité, à la religion, à l'état de santé ou à la situation familiale ne seront pas pris en compte. » Faire qualifier le statut AI Act… | Vous |
| LEGAL-19 | mineur | Portraits de 8 personnes identifiables et logos de sociétés publiés sans preuve d'autorisation archivée, contrairement au registre interne | Recueillir et archiver un accord écrit (email suffisant) de chaque personne représentée, précisant l'usage, le site et la durée, ainsi que l'accord des sociétés pour leurs logos. Ajouter les lignes correspondantes dans VISUAL_ASSET_RIGHTS_REGISTER.md. Confirmer la provenance des portraits et, s'ils ont été générés ou altérés par IA, le signaler ou utiliser les photos d'origine. | Vous |
| LEGAL-21 | mineur | CGU : clauses qui seraient abusives envers un consommateur et description du service différente selon la langue | Restreindre explicitement les CGU à l'usage du site (sans portée sur la prestation payante, qui relève des futures CGV), supprimer ou encadrer les clauses de modification unilatérale et d'exonération de garantie pour les consommateurs, remplacer « juridiction exclusive » par une clause conforme, puis aligner les quatre langues sur une description unique validée par l'avocat. | Vous |
| LEGAL-18 | info | Honoraires : 100 € / 150 € la demi-heure et majoration de nuit dès 18 h pour un rendez-vous programmé, à confronter à la règle du « tact et mesure » | Faire valider la grille par le conseil (CDOM si l'activité est médicale), envisager d'appeler cette majoration « créneau en soirée » plutôt que « tarif de nuit », et la justifier dans les CGV. | Vous |
| LEGAL-20 | info | Accessibilité : a priori pas d'obligation légale de conformité ni de déclaration pour une micro-entreprise, recommandation seulement | Confirmer le statut de micro-entreprise. Aucune action légale n'est requise dans ce cas ; publier une courte page « Accessibilité » décrivant l'état et un contact reste recommandé (public de patients), et deviendra obligatoire si l'entreprise dépasse les seuils. | Vous |

### Sécurité — 11 constats, 31 vérifications réussies

| ID | Sévérité | Constat | Recommandation | Resp. |
|---|---|---|---|---|
| SEC-02 | bloquant | Pré-détournement de compte candidat : un tiers qui inscrit l'email d'un candidat avant lui garde l'accès au compte et à ses documents d'identité | Ne jamais conserver un mot de passe défini avant la preuve de possession de l'email : (a) lors d'une inscription sur un compte non vérifié existant, remplacer passwordHash/firstName/lastName par les nouvelles valeurs ; ou mieux (b) ne définir le mot de passe qu'après verifyEmail (lien -> écran « choisissez votre mot de passe »), et révoquer toutes les sessions existantes à la vérification. Ajouter un test… | Code |
| SEC-09 | majeur | Aucune limite sur la taille décompressée des CV DOCX/PDF à l'extraction de texte : le cron de traitement sature la mémoire et un texte démesuré est stocké en base | Avant l'extraction, vérifier la taille décompressée totale déclarée par l'archive DOCX et refuser au-delà d'un plafond raisonnable (par exemple 20 Mo). Pour les PDF, limiter le nombre de pages et la taille des flux traités, ou extraire dans un worker isolé avec plafond de mémoire et délai. Tronquer le texte extrait (par exemple 200 000 caractères) avant de l'enregistrer. Ne plus renvoyer extracted_text complet… | Code |
| SEC-01 | mineur | Erreurs internes renvoyées telles quelles au client par les formulaires publics : requête SQL complète avec paramètres, codes Turnstile en HTTP 500 | Ajouter un errorFormatter dans initTRPC.create() qui remplace le message de toute erreur INTERNAL_SERVER_ERROR non TRPCError par un texte générique avec une référence, et journalise l'original côté serveur. Supprimer la concaténation du message brut dans appointments.create. Refuser les caractères de contrôle (\u0000) dans les schémas Zod des champs texte. Ajouter app.disable('x-powered-by'). Convertir les échecs… | Code |
| SEC-03 | mineur | La déconnexion de l'administrateur ne révoque pas la session MFA serveur (8 h) | Dans auth.logout, renseigner revoked_at sur la ligne admin_mfa_sessions du cookie et effacer le cookie avec les mêmes options ; côté client, appeler auth.logout avant clerk.signOut. Option : lier la session MFA à l'identifiant de session Clerk (auth.sessionId) et la refuser si celui-ci change. | Code |
| SEC-04 | mineur | Aucune vérification d'origine sur les mutations tRPC : la protection CSRF repose uniquement sur SameSite=Lax | Ajouter avant /api/trpc un middleware qui refuse les POST dont l'en-tête Origin (ou Sec-Fetch-Site=cross-site) ne correspond pas à PUBLIC_APP_ORIGIN, ou exiger un en-tête personnalisé (par exemple x-trpc-source, ajouté par httpBatchLink) qui force une pré-vérification CORS. Appliquer la même règle à /api/candidate/documents. | Code |
| SEC-05 | mineur | Énumération des comptes candidats par mesure du temps de réponse (connexion et inscription) | Dans login, toujours vérifier scrypt sur un hash factice précalculé quand le compte est absent, non vérifié ou verrouillé. Dans register, hacher le mot de passe dans tous les cas et rendre le temps de réponse constant (envoi d'email en tâche de fond). Ajouter une limite par IP seule sur login. | Code |
| SEC-06 | mineur | Le verrouillage de compte permet de bloquer un candidat (5 échecs = 15 min, depuis n'importe quelle IP) | Remplacer le verrouillage dur par un ralentissement progressif par couple compte+IP, ou exiger Turnstile après 3 échecs au lieu de bloquer. Ne pas compter les échecs venant d'une IP où le compte s'est déjà connecté avec succès. Prévenir le candidat par email en cas de verrouillage, avec un lien de réinitialisation. | Code |
| SEC-07 | mineur | Le motif des dates bloquées, saisi comme une note interne, est publié par l'API publique | Ne renvoyer que la date dans la procédure publique (db.select({ date: blockedDates.date })) et garder le motif pour admin.availability.listBlockedDates. Relire les motifs déjà saisis en production. | Vous |
| SEC-10 | mineur | pnpm audit --prod : 5 avis modérés, dont seul qs est réellement atteignable | Ajouter dans package.json > pnpm.overrides « qs »: « >=6.16.0 » (ou monter express/body-parser), régénérer le lockfile et relancer pnpm audit --prod. Monter multer en >= 2.4.0 par hygiène. Retirer mysql2 s'il ne sert plus qu'à un ancien test. | Code |
| SEC-08 | info | Dérivation de l'IP cliente : deux règles différentes, sûres seulement parce que Vercel écrase X-Forwarded-For | Centraliser la dérivation dans une seule fonction qui lit x-vercel-forwarded-for (ou x-real-ip posé par Vercel) en production, et l'utiliser partout : limites, remoteip Turnstile, journaux. Documenter qu'aucun proxy ne doit être placé devant Vercel sans revoir cette fonction. | Code |
| SEC-11 | info | Des origines de développement et de l'ancien hébergement Manus sont encore acceptées en production | N'ajouter les origines localhost à authorizedParties et à TRUSTED_HOSTS que si NODE_ENV !== 'production', retirer le domaine manus.space, et exiger le champ hostname dans la réponse siteverify. | Code |

### Recrutement & espace candidat — 23 constats, 54 vérifications réussies

| ID | Sévérité | Constat | Recommandation | Resp. |
|---|---|---|---|---|
| CAND-02 | majeur *(revu : bloquant → majeur)* | L’effacement RGPD d’un candidat n’efface ni le CV, ni sa copie Google Drive, ni les données dérivées, ni l’espace candidat et ses documents | Faire de l’effacement une opération complète et vérifiable : del() Vercel Blob du CV et de chaque document .enc, suppression du fichier Drive (files.delete via le token stocké), suppression des lignes dérivées (cv_candidate_*, cv_processing_jobs, cv_google_drive_export_jobs, recruitment_email_events/campaign_recipients ou pseudonymisation), suppression/anonymisation du compte candidat + révocation de ses sessions… | Code |
| CAND-03 | majeur | Aucune purge à l’échéance de conservation : le cron de rétention ne fait que notifier, et la politique de confidentialité n’indique aucune durée pour les candidats | Décider et publier une durée de conservation candidats (ex. 2 ans après le dernier contact, conforme à la recommandation CNIL pour les viviers de candidats) dans la politique de confidentialité ; faire supprimer réellement (Blob, Drive, lignes dérivées, documents du coffre) par le cron à l’échéance, éventuellement après un email de prolongation au candidat ; conserver la notification propriétaire comme simple… | Vous |
| CAND-05 | majeur | Le cron quotidien n’analyse que 5 CV par jour : au-delà, la file grossit et le formulaire de candidature finit par refuser tout le monde (503) | Drainer la file dans le cron (boucle par lots jusqu’à file vide ou ~50 s, comme drainInBatches) et/ou lancer l’analyse juste après le dépôt via waitUntil (@vercel/functions) ; passer le cron à l’heure (plan Vercel Pro) ; ne pas bloquer la candidature quand la file d’analyse est pleine (accepter le dépôt et alerter le propriétaire) ; idem pour les exports Drive. | Code |
| CAND-11 | majeur | Le lien « Créer mon espace candidat » de l’email de confirmation expire au bout de 30 minutes et bloque ensuite l’inscription | Donner aux invitations une durée de 7 à 14 jours (jeton signé, usage lié à l’email de la candidature) ou, à l’expiration, basculer automatiquement vers l’inscription classique avec l’email pré-rempli au lieu de bloquer ; ne plus transmettre un jeton expiré au register ; indiquer la durée de validité dans l’email. | Code |
| CAND-15 | majeur | Chaque échec de connexion « high » envoie un email d’alerte au propriétaire, sans limitation : 30 emails en 2 s depuis un seul compte | Agréger les alertes (au plus 1 email par catégorie et par fenêtre de 15–60 min, avec le nombre d’événements et le compte concerné), ne pas alerter pour chaque échec mais au franchissement du seuil, et corriger la course de CAND-01. Surveiller le quota Resend. | Code |
| CAND-23 | majeur | Information des candidats incomplète : transmission aux employeurs, transferts hors UE et durée de conservation absents ; case de consentement sans lien | Ajouter dans la politique une section « Candidats » (finalités, base légale, destinataires = employeurs clients après accord du candidat, transferts hors UE et garanties – clauses contractuelles types ou consentement explicite par mission –, durée de conservation, droits) et un lien cliquable dans chaque case de consentement ; idéalement demander l’accord du candidat avant chaque transmission de son dossier à un… | Vous |
| CAND-01 | mineur *(revu : majeur → mineur)* | Verrouillage de compte et limite de débit de connexion contournables par requêtes parallèles | Rendre les compteurs atomiques : UPDATE candidate_accounts SET failed_login_count = failed_login_count + 1, locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' END WHERE id = $1 RETURNING … ; pour la limite de débit, un seul INSERT … ON CONFLICT (action, subject_hash) DO UPDATE SET attempt_count = CASE WHEN … THEN 1 ELSE candidate_security_rate_limits.attempt_count + 1 END… | Code |
| CAND-07 | mineur | Le formulaire VVIP enregistre des données inventées : 5 ans d’expérience par défaut et langues « Français, Anglais » imposées | Envoyer une expérience vide quand le champ est vide, ajouter un champ langues (ou envoyer une liste vide) et un champ pays ciblés distinct de l’environnement ; corriger les candidatures déjà reçues si possible (principe d’exactitude, art. 5.1.d RGPD). | Code |
| CAND-08 | mineur | CV de mauvais format ou trop lourd : le formulaire standard affiche seulement « Champ obligatoire. » | Afficher t.fileError quand le champ cv est invalide (comme VvipOffshorePage) et formater la taille sans arrondi trompeur (ou afficher « 5,0 Mo — maximum 5 Mo dépassé »). | Code |
| CAND-09 | mineur | Brief employeur : message trompeur quand la limite est atteinte et aucun accusé de réception à l’employeur | Afficher le message renvoyé par l’API (ou un texte dédié pour 429/503) ; envoyer à l’employeur un accusé de réception avec la référence BRIEF… ; vérifier que l’engagement « sous 24h » est tenable ou l’atténuer. | Code |
| CAND-10 | mineur | Connexion depuis /candidate/portal (favori, session expirée) : premier login réussi mais renvoi silencieux vers le formulaire | Dans onSuccess de login/verifyEmail/resetPassword : await utils.candidatePortal.me.invalidate() (ou setData) avant navigate ; à la déconnexion, utils.candidatePortal.invalidate()/reset ; dans CandidatePortalPage, ne rediriger que si !me.isFetching && me.data === null. | Code |
| CAND-12 | mineur | Verrouillage reconduit à la première erreur après expiration : un tiers peut bloquer un candidat indéfiniment | Remettre failed_login_count à 0 quand un verrou expiré est constaté (ou compter les échecs dans une fenêtre glissante) ; afficher au candidat verrouillé un message neutre l’invitant à réinitialiser son mot de passe ; envisager un délai progressif plutôt qu’un verrou fixe. | Code |
| CAND-13 | mineur | Énumération des comptes candidats par le temps de réponse de la connexion | Exécuter un scrypt factice (hash de référence précalculé) dans toutes les branches d’échec pour égaliser le temps de réponse. | Code |
| CAND-14 | mineur | Après une panne Resend, l’invitation portail d’un candidat ne peut plus être renvoyée depuis l’admin | Traiter un 503/500 renvoyé par Resend avant acceptation comme un échec certain (seuls les timeouts/erreurs réseau sont incertains), ou ajouter un bouton admin « Renvoyer quand même » après X minutes, la clé d’idempotence par tentative évitant déjà les doublons côté Resend. | Code |
| CAND-18 | mineur | Logo des emails en SVG : non affiché par Gmail et Outlook | Utiliser un PNG (128 px, fond opaque) hébergé sur le domaine pour le logo des emails et fournir une version texte à chaque envoi (option text de Resend). | Code |
| CAND-19 | mineur | Déduplication non atomique : 3 envois simultanés du même dossier créent 3 candidatures | Ajouter une contrainte unique (lower(email), lower(specialty), file_checksum) ou une clé d’idempotence côté client, et traiter la violation comme le cas duplicate. | Code |
| CAND-20 | mineur | La « note de revue » interne de l’admin et les points IA sont renvoyés au candidat sans que l’admin le sache | Séparer une note interne (jamais renvoyée au candidat) d’un message destiné au candidat, libeller clairement ce qui est visible, et retirer aiFlags/aiSummary/aiConfidence de la réponse candidat si ce n’est pas voulu (en gardant le droit d’accès RGPD sur demande). | Code |
| CAND-21 | mineur | Portail mobile : boutons flottants « Préférences cookies » et chat masquent en partie « Télécharger » ; champ fichier rouge après un dépôt réussi | Ajouter un espace bas (padding-bottom ≥ 96 px) sur les pages du portail ou masquer les boutons flottants dans l’espace candidat ; ne pas afficher l’état invalide du champ fichier tant qu’aucun envoi n’a été tenté après la réinitialisation. | Code |
| CAND-22 | mineur | CV Word ancien format (.doc) accepté sans aucune inspection des macros | Refuser le format .doc (proposer PDF/DOCX) ou détecter les flux VBA (_VBA_PROJECT, Macros/) et brancher un antivirus (ClamAV, VirusTotal privé…) avant l’export Drive ; former l’équipe à ne jamais activer les macros. | Code |
| CAND-04 | info | Candidats jamais facturés (conforme à L5321-3) mais gratuité non affichée ; allégations « Réseau mondial certifié » et « Conformité RGPD stricte » | Ajouter dans le parcours candidat et les CGU une phrase du type « Nos services sont entièrement gratuits pour les candidats ; nous sommes rémunérés exclusivement par les établissements employeurs » ; retirer ou justifier « Réseau mondial certifié » (par quel organisme ?) et « Conformité RGPD stricte » tant que CAND-02/03 ne sont pas corrigés ; corriger « Isolat » en « isolés ». Vérifier aussi la déclaration… | Vous |
| CAND-06 | info *(doublon de OPS-09)* | Limite Vercel de 4,5 Mo par requête/réponse incompatible avec les 5 Mo (CV) et 10 Mo (documents) annoncés | Vérifier sur une preview Vercel avec un PDF de 4,8 Mo et une photo de 8 Mo. Puis soit abaisser les limites annoncées et contrôlées à 4 Mo (client et serveur) avec un message clair, soit passer à un upload direct navigateur -> Vercel Blob (client upload avec jeton signé, chiffrement côté serveur ensuite) et à un téléchargement par URL signée de courte durée au lieu de faire transiter le fichier par la fonction. | Code |
| CAND-16 | info *(doublon de SEC-02)* | Pré-détournement de compte : un tiers qui connaît l’email d’un candidat fixe le mot de passe du futur espace et lit ensuite ses documents (passeport…) | Ne jamais conserver un mot de passe fixé avant la preuve de possession de l’email : soit remplacer passwordHash (et nom/prénom) par ceux de la dernière inscription et révoquer toutes les sessions du compte non vérifié, soit ne choisir le mot de passe qu’après le clic sur le lien d’activation (le lien ouvre un écran « définir mon mot de passe »). En complément : à la vérification, invalider tout mot de passe… | Code |
| CAND-17 | info | CV stockés en clair dans Vercel Blob (contrairement aux documents du coffre) et procédure tRPC documentDownload inutilisable | Chiffrer aussi les CV avec la même clé (ou documenter le choix) ; supprimer la procédure documentDownload ou la faire pointer vers la route qui déchiffre. | Code |

### Back-office admin — 21 constats, 60 vérifications réussies

| ID | Sévérité | Constat | Recommandation | Resp. |
|---|---|---|---|---|
| ADM-BRIEF-01 | majeur | Missions : les coordonnées et le besoin détaillé de l'employeur ne sont visibles nulle part dans l'admin | Ajouter un panneau de détail du brief : contact, email cliquable, téléphone, exigences, description, notes, date de réception. Compléter l'email de notification, idéalement avec une note interne par brief. | Code |
| ADM-DRIVE-02 | majeur | Connexion Google Drive possible sans la double authentification admin (contournement du MFA) | Exiger requestContext.mfaVerified sur /api/google-drive/oauth/connect et /callback (403 sinon), comme pour la route de téléchargement des documents. Journaliser la connexion Drive dans security_events et notifier le propriétaire par email. | Code |
| ADM-MFA-01 | majeur | MFA admin : le code du dernier email est refusé dès qu'un défi plus ancien est ouvert ; après 5 erreurs, tout nouveau code est bloqué 10 min ; l'envoi de codes n'est pas limité | Invalider les défis ouverts de l'openId avant d'en émettre un nouveau, ou sélectionner le plus récent (ORDER BY created_at DESC) en excluant attempts >= 5. Limiter adminSecurity.begin (ex. 5 envois / 15 min) et verify par openId+IP. Ajouter un test de non-régression « deux envois → le dernier code fonctionne ». | Code |
| ADM-REC-01 | majeur | Candidatures : changer le statut d'un dossier efface silencieusement la note interne du recruteur | Côté serveur, ne mettre à jour admin_notes que si adminNotes est fourni, ou séparer le changement de statut et la note. Ajouter le test « changer le statut conserve la note ». | Code |
| ADM-APT-01 | mineur | « Terminer » est proposé sans confirmation sur un rendez-vous futur payé : il supprime le rappel patient et le bouton Rembourser, sans retour arrière dans l'UI | N'afficher « Terminer » qu'une fois l'heure du RDV passée, ou demander confirmation. Ajouter « Remettre en confirmé » et « Absent » dans l'UI, et aligner l'affichage de Rembourser sur la règle serveur. | Code |
| ADM-AVAIL-01 | mineur | Disponibilités : aucune validation serveur, et blocage d'une date sans alerte sur les RDV payés de ce jour | Valider côté serveur les heures (HH:MM réel, début < fin), les dates (réelles, non passées) et l'unicité des dates bloquées. Au blocage d'une date, lister les RDV confirmés et proposer annulation, remboursement et email. Demander confirmation avant de supprimer un créneau. | Code |
| ADM-BRIEF-02 | mineur | Missions : impossible de retirer un candidat de la shortlist, de clôturer une mission ou de la marquer « contrat signé » depuis l'UI | Ajouter « Retirer de la shortlist », « Mission confirmée » et « Clôturée » dans l'UI, et renseigner shortlist_sent_at. | Code |
| ADM-DRIVE-01 | mineur | Autorisation Google Drive révoquée : l'admin affiche toujours « Google Drive connecté » et un toast de succès | Afficher lastError dans l'en-tête (« Reconnexion Google Drive requise ») et faire du toast un avertissement quand le job n'est pas terminé. | Code |
| ADM-GDPR-01 | mineur | Onglet RGPD minimal : pas d'échéance d'un mois, pas de refus motivé ni de note, statuts en anglais, « Traité » ne déclenche aucune action | Afficher la date limite (réception + 1 mois), traduire les statuts, permettre une note et un refus motivé. Documenter la procédure manuelle : où chercher l'email dans chaque base et chez chaque prestataire. | Vous |
| ADM-MAIL-01 | mineur | Campagnes de recrutement : pas d'en-tête List-Unsubscribe, pas de version texte, envoi séquentiel sans idempotence dans une seule requête | Ajouter List-Unsubscribe et List-Unsubscribe-Post (One-Click) avec un endpoint POST, une version texte et une Idempotency-Key par destinataire. Envoyer via batch ou via une file traitée par le cron. | Code |
| ADM-MAIL-02 | mineur | Campagne entièrement en échec signalée par un toast de succès, sans relance des seuls destinataires en échec | Afficher un avertissement quand failed > 0 et ajouter une relance limitée aux destinataires en échec. | Code |
| ADM-MFA-02 | mineur | La session MFA admin (8 h) n'est jamais révoquée, ni à la déconnexion ni par une action d'administration | À la déconnexion, renseigner revoked_at sur la session MFA courante et effacer le cookie. Ajouter dans l'onglet Sécurité un bouton « Révoquer toutes les sessions MFA ». | Code |
| ADM-MOB-01 | mineur | Le bouton flottant WhatsApp et la pastille « Préférences cookies » du site public recouvrent le contenu de l'admin sur mobile | Masquer WhatsAppButton sur /admin et /candidate/*, ou réserver une marge basse dans le tableau de bord. | Code |
| ADM-MQ-01 | mineur | Questions santé : « Valider et envoyer » reste actif après l'envoi et renvoie la réponse au patient à chaque clic | Refuser un second envoi si response_sent_at est renseigné (sauf « renvoyer » explicitement confirmé) et passer une Idempotency-Key à Resend. Dans l'UI, désactiver le bouton après l'envoi et séparer « Mettre à jour la publication » de l'envoi d'email. | Code |
| ADM-MQ-02 | mineur | Réponse médicale du Dr Ben Lallahom envoyée sous l'identité « Hippocampus Consulting <recrutement@…> » avec réponse vers une adresse Gmail | Utiliser un expéditeur dédié au service médical, avec un Reply-To vers une boîte professionnelle adaptée aux données de santé (ou « ne pas répondre » avec renvoi vers le formulaire), et l'indiquer dans la politique de confidentialité. | Vous |
| ADM-REC-02 | mineur | « Relancer l'analyse » affiche un toast de succès alors que l'analyse IA a échoué | Renvoyer le statut final du job et afficher un avertissement en cas d'échec. Traduire l'erreur technique en message lisible dans la fiche. | Code |
| ADM-UI-02 | mineur | Listes admin plafonnées sans pagination (Messages, RGPD, Questions santé, Documents : 50 ; Sécurité : 75) | Ajouter une pagination « Charger plus », ou un filtre « non traités » par défaut sur Messages, RGPD et Questions santé. | Code |
| ADM-CSV-01 | info | Export CSV : la protection anti-formule préfixe aussi les numéros de téléphone (« '+336… ») | Exporter les téléphones sous une forme sans « + » initial (ex. 0033…), en gardant la neutralisation pour les autres colonnes. | Code |
| ADM-ERASE-01 | info *(doublon de CAND-02)* | « Effacer RGPD » ne supprime ni le CV (Vercel Blob), ni sa copie Google Drive, ni les données extraites du CV : l'effacement annoncé est incomplet | Dans admin.recruitment.erase, dans une transaction : - supprimer l'objet Blob (del) ; - supprimer le fichier Drive (files.delete) quand un export existe ; - supprimer les lignes dérivées : certifications, langues, expériences, jobs, destinataires de campagne, événements, relances ; - ne garder qu'une preuve pseudonymisée. Faire de même dans le job de rétention. En attendant, documenter une procédure manuelle… | Code |
| ADM-MFA-03 | info | Le second facteur admin est un code envoyé à l'email du compte Clerk : il n'est indépendant que si la connexion Clerk n'utilise pas ce même email | Imposer dans Clerk, pour le compte propriétaire, un mot de passe fort plus TOTP ou passkey, et protéger la boîte mail administrateur par une double authentification forte. | Vous |
| ADM-UI-01 | info | Fonctions sans interface : création de témoignage et gestion du blog absentes de l'admin | Décider si ces fonctions sont voulues au lancement : les réactiver dans l'UI, ou supprimer le code mort et les procédures inutilisées. | Vous |

### Site public — 31 constats, 42 vérifications réussies

| ID | Sévérité | Constat | Recommandation | Resp. |
|---|---|---|---|---|
| PUB-CONTENT-01 | majeur | Accueil, section « À propos » : visuel provisoire « PORTRAIT OFFICIEL À AJOUTER » à la place de la photo du médecin | Remplacer par le portrait officiel (le webp local existant, ou une version plus grande au ratio 3:4) en gardant l'alt. À défaut, retirer la mention « à ajouter » du SVG et mettre alt="". | Vous |
| PUB-FORM-01 | majeur | Questions santé : ni notification au propriétaire ni accusé de réception au patient à l'envoi d'une question | Appeler notifyOwner à chaque nouvelle question (sans donnée de santé dans l'objet, avec un lien vers l'admin). Envoyer au patient un accusé de réception avec sa référence et un délai de réponse indicatif. Éventuellement, ajouter les questions en attente au cron quotidien. | Code |
| PUB-UI-01 | majeur | Mobile : le logo/bouton d'accueil disparaît de l'en-tête sur les téléphones les plus courants (≤ 393 px) | Donner une largeur minimale au logo (shrink-0 / min-w-10 sur le bouton et l'image, colonne grid-cols-[auto_minmax(0,1fr)]) et regrouper sur mobile les boutons thème/lisibilité/OLED dans le menu burger, où ils sont déjà en partie, pour libérer la place. | Code |
| PUB-A11Y-01 | mineur | axe-core : 2 violations « serious » isolées (contraste de la date des témoignages, aria-label sur un span décoratif de /booking) | TestimonialsPage.tsx:226 : remplacer text-gray-500 par text-muted-foreground (ou une teinte à 4.5:1 minimum sur le fond de carte). BookingPage.tsx:578 : retirer aria-label et mettre aria-hidden="true" sur la pastille décorative. | Code |
| PUB-A11Y-02 | mineur | Structure : /testimonials et /booking sans <main> (lien d'évitement inopérant), footer avec un h4 orphelin et une 2e <nav> sans libellé | Envelopper le contenu de TestimonialsPage et de BookingPage dans <main id="main-content" tabIndex={-1}> et ajouter Navigation et Footer à /testimonials. Mettre aria-label="Pied de page" sur la <nav> du footer et passer ses titres en h2 stylés. Remplacer les <aside> de /questions-anesthesie par des <section> ou des <div role="note">. | Code |
| PUB-A11Y-03 | mineur | Thème clair : couleur primaire #0086c0 trop peu contrastée pour les petits textes (3.4 à 4.1:1), 111 occurrences sur 18 pages | En thème clair, foncer le token primaire utilisé pour le texte (ex. #006b9a, environ 5.3:1 sur #f6f9fc) ou créer un token text-primary-strong pour les libellés en petites capitales. | Code |
| PUB-A11Y-04 | mineur | Fenêtre « Préférences cookies » (aria-modal) : le focus n'y entre pas à l'ouverture et la tabulation en sort | Utiliser le composant Dialog de shadcn/Radix déjà présent (focus initial et piège de focus), ou placer le focus initial sur la première case et faire boucler Tab et Shift+Tab dans la fenêtre. | Code |
| PUB-BUILD-01 | mineur | Le build de production embarque des attributs data-loc (chemin et ligne du code source) sur chaque élément | Ne charger jsxLocPlugin() que hors production, comme vitePluginManusRuntime, puis vérifier l'absence de data-loc dans dist/public. | Code |
| PUB-CONTACT-01 | mineur | Coordonnées incohérentes : 3 adresses email et 2 profils LinkedIn différents pour le même interlocuteur | Le propriétaire choisit une adresse de contact public et un profil LinkedIn officiels, centralisés dans site-config.ts et réutilisés dans LegalPage, index.html (JSON-LD), ventures-*.ts et invoice.ts. Vérifier que contact@drahmedbenlallahom.com reçoit bien les emails, puisqu'elle figure sur les factures. Préférer une adresse du domaine à l'adresse Gmail dans les mentions légales. | Vous |
| PUB-CONTENT-02 | mineur | /venture/sawa4you : la CEO (Wafa Dahmeni) apparaît avec la silhouette générique (photo encore référencée sous /manus-storage) et Sawa4You n'a pas de logo | Ajouter /assets/team/wafa-dahmeni.webp (avec l'accord de la personne) et le logo Sawa4You dans client/public/assets, puis mettre à jour ventures-fr.ts et ventures-en.ts. | Vous |
| PUB-CONTENT-03 | mineur | Accueil : durée d'expérience contradictoire (« plus d'une décennie d'expérience clinique … en France » et compteur « 9+ Années de Pratique Clinique ») | Le propriétaire fixe le chiffre exact et aligne le texte (FR/EN/DE/ZH) et le compteur. | Vous |
| PUB-COOKIE-01 | mineur | Bannière cookies : « En savoir plus » vise une ancre #cookies inexistante, et la politique dit de refuser les cookies « en configurant votre navigateur » | Ajouter id="cookies" sur le titre de la section 7 (FR/EN/DE/ZH) et remplacer la phrase par « Vous pouvez modifier votre choix à tout moment via le bouton "Préférences cookies" en bas de page ». | Code |
| PUB-COOKIE-02 | mineur | Requêtes tierces avant tout consentement : Google Fonts (IP du visiteur envoyée à Google) et Clerk JS chargés sur toutes les pages publiques | Auto-héberger DM Sans et Playfair Display (@fontsource) et retirer les preconnect/preload Google. Ne monter ClerkProvider que sous la route /admin (chargement différé). Vérifier en production quels cookies Clerk pose aux visiteurs anonymes et les documenter dans la politique cookies. | Code |
| PUB-COOKIE-04 | mineur | Catégorie « Cookies de préférence » sans effet : langue, thème, OLED et lisibilité sont enregistrés avant le choix et quel qu'il soit | Soit retirer la catégorie « préférence » de la bannière et la décrire comme fonctionnelle et exemptée dans la politique cookies, soit conditionner l'écriture de ces clés à preferences:true (et ne rien écrire tant que l'utilisateur n'a rien changé). | Code |
| PUB-FORM-02 | mineur | Formulaires contact/RGPD : rejet anti-bot renvoyé en HTTP 500 avec un message générique ; référence RGPD non communiquée ; Reply-To des notifications = le propriétaire | Dans contact et gdpr, envelopper verifyCandidateTurnstile comme dans medicalQuestionsRouter : BAD_REQUEST, message « vérification de sécurité à renouveler » et reset du widget. Afficher le trackingId RGPD et envoyer un accusé de réception. Dans notifyOwner, mettre replyTo = email du visiteur pour contact et RGPD. | Code |
| PUB-I18N-01 | mineur | Traductions EN/DE/ZH incomplètes : textes restés en français ou en anglais sur plusieurs pages | Faire passer ces chaînes par les fichiers content-*.ts (ou un objet copy par langue). Traduire les spécialités (libellé affiché traduit, valeur envoyée inchangée). Ajouter ventures-de.ts et ventures-zh.ts, ou au minimum traduire services et highlights. Franciser les sur-titres de l'accueil si ce n'est pas un choix de marque. | Code |
| PUB-NAV-01 | mineur | Pages orphelines : le formulaire RGPD (/gdpr) et /why-hippocampus ne sont liés depuis aucune page, et la politique de confidentialité renvoie au formulaire de contact | Ajouter « Exercer mes droits RGPD » (/gdpr) dans la colonne Mentions légales du footer et au §6 de la politique. Lier /why-hippocampus depuis /employers (ex. « Pourquoi nous choisir »). Ajouter /venture/pratique-clinique au sitemap.xml. | Code |
| PUB-SEARCH-01 | mineur *(revu : majeur → mineur)* | Recherche du site : « anesthésie » ne renvoie aucun résultat (index limité à 10 titres de pages) | Ajouter au moins les entrées manquantes (questions-anesthesie, resources, press, testimonials, ventures, recruitment/standard) et des mots-clés métier (anesthésie, réanimation, opération, jeûne, tarif, infirmier, IADE…) dans les 4 langues. À terme, générer l'index au build depuis les contenus (FAQ, pages, questions publiées). Ajouter un test qui vérifie que « anesthésie » renvoie /questions-anesthesie et /booking. | Code |
| PUB-SEO-01 | mineur | Titres et descriptions SEO : deux sources de vérité divergentes (pré-rendu et SEOHead client) sur 20 des 27 routes | Générer le pré-rendu (scripts/prerender-route-seo.ts) et les props de SEOHead depuis un seul fichier de métadonnées par route (titre, description, canonical), et ajouter un test qui compare les deux. | Code |
| PUB-SEO-02 | mineur | La SearchAction du JSON-LD WebSite pointe vers /?q=, que l'accueil ignore (la recherche est sur /search?q=) | Remplacer l'urlTemplate par https://drahmedbenlallahom.com/search?q={search_term_string}, ou retirer la SearchAction tant que la recherche reste limitée. | Code |
| PUB-SEO-03 | mineur | Aperçus de partage sans image : og:image et twitter:image pointent vers un SVG sur toutes les pages | Créer une image de partage raster 1200x630 (PNG ou JPG, avec le logo et le nom, ou un portrait) dans client/public/assets, et l'utiliser pour og:image, twitter:image et l'image du JSON-LD Person, dans scripts/prerender-route-seo.ts et SEOHead. | Code |
| PUB-UI-02 | mineur | Thème clair : pied de page illisible (liens à 1.02:1) et nom de marque invisible dans l'en-tête sur /why-hippocampus | Faire suivre le thème à WhyHippocampusPage (remplacer les couleurs codées en dur par les tokens bg-background/text-foreground), ou à défaut forcer la classe dark sur toute la page, Navigation et Footer compris. Ajouter /why-hippocampus au contrôle visuel en thème clair. | Code |
| PUB-UI-03 | mineur | Thème clair : le visuel « globe » sombre du héros /recruitment est posé sur le texte (introduction peu lisible) | Adapter le visuel au thème clair (opacité réduite ou version claire) ou le placer derrière une zone sans texte, puis vérifier le contraste réel du texte. | Code |
| PUB-UI-04 | mineur | /maintenance sur mobile : le titre « MAINTENANCE » déborde et est tronqué par la carte | Dans ServiceStatusPage, utiliser une taille de police responsive (text-5xl sm:text-7xl), break-words ou clamp(). | Code |
| PUB-UI-05 | mineur | /recruitment/standard : la première lettre du sur-titre « Hippocampus Consulting · Mobilité médicale » est rognée | Ajouter une marge intérieure au conteneur (p-6) ou retirer overflow-hidden et rounded-3xl du bloc texte dans RecruitmentPage.tsx. | Code |
| PUB-UI-06 | mineur | Mobile : deux boutons flottants permanents (« Préférences cookies » 167x34 px et WhatsApp 56x56 px) masquent le bas de l'écran | Réduire la pastille cookies à une icône sur mobile, ou la remplacer par un lien « Gérer les cookies » dans le footer (pratique courante et conforme). Ajouter un padding-bottom de sécurité aux pages sur mobile. | Code |
| PUB-CONTENT-04 | info | Témoignages : le badge « ✓ Vérifié » et la publication d'avis de patients sur le site d'un médecin sont à faire valider juridiquement | Décrire la procédure de modération et de vérification des avis sur /testimonials, ou retirer le badge. Faire valider par un conseil (avocat, Ordre) la publication d'avis de patients et, si besoin, réserver la page aux partenaires professionnels. | Vous |
| PUB-CONTENT-05 | info | /error affirme « Nous avons été informés du problème » alors qu'aucune remontée d'erreur n'existe et qu'aucun parcours ne mène à cette page | Reformuler (« Une erreur est survenue, réessayez… ») ou brancher une vraie remontée d'erreurs avant de l'annoncer. Le jour d'une maintenance, utiliser /maintenance via une règle Vercel. | Code |
| PUB-COOKIE-03 | info | Si un outil d'analyse (Umami) est configuré en production, la CSP le bloquera | Si une mesure d'audience est voulue, héberger le script sur la même origine, ou ajouter son hôte à script-src et connect-src dans vercel.json et server/_core/index.ts. Sinon, retirer la catégorie « performance » de la bannière. | Vous |
| PUB-LEGAL-01 | info *(doublon de BOOK-CGV)* | Prestation payante sans conditions de vente accessibles : la politique d'annulation (FAQ, /booking) n'existe pas dans les « Conditions Générales » | Rédiger des CGV pour la consultation : prix TTC, paiement Stripe, annulation et remboursement à 24 h, rétractation ou motif d'exclusion, médiateur de la consommation, réclamations. Les publier dans un onglet dédié et les lier depuis /booking avec une case « J'accepte les CGV » avant le paiement. Garder FAQ et CGV alignées. | Vous |
| PUB-LINKS-01 | info | Liens externes à vérifier par le propriétaire (impossibles à ouvrir depuis le bac à sable) | Ouvrir chaque lien dans un vrai navigateur avant le lancement (ou ajouter un contrôle de liens en CI) et tester le bouton WhatsApp sur un téléphone. | Vous |

### Performance, SEO & exploitation — 26 constats, 27 vérifications réussies

| ID | Sévérité | Constat | Recommandation | Resp. |
|---|---|---|---|---|
| OPS-01 | majeur | Variables d'environnement : la liste « requis » est incomplète et n'est jamais vérifiée sur Vercel (check-list de lancement) | Check-list Vercel (environnement Production) avant le lancement. Secrets serveur : DATABASE_URL (Neon prod), JWT_SECRET (>= 32 caractères), STRIPE_SECRET_KEY (sk_live_), STRIPE_WEBHOOK_SECRET (whsec_ de l'endpoint LIVE), CLERK_SECRET_KEY (sk_live_), CLERK_OWNER_USER_ID (id du compte admin dans l'instance Clerk PROD), RESEND_API_KEY, RESEND_WEBHOOK_SECRET, TURNSTILE_SECRET_KEY, BLOB_READ_WRITE_TOKEN,… | Vous |
| OPS-02 | majeur | L'analyse des documents candidats et l'assistant de réponse médicale dépendent encore de Manus Forge, présenté comme « héritage à retirer » | Avant le lancement, soit garder BUILT_IN_FORGE_API_URL/KEY dans Vercel et déclarer Manus comme sous-traitant (DPA, transfert hors UE), soit migrer invokeLLM vers Vercel AI Gateway (déjà utilisé pour les CV via le SDK ai). Corriger le message d'erreur ; supprimer les handlers POST /api/scheduled/*, l'hôte manus.space de TRUSTED_HOSTS et server/_core/{sdk,oauth}.ts ; mettre .env.example en cohérence. | Vous |
| OPS-03 | majeur | Cron recruitment-processing sans budget de temps : 5 analyses de CV en série dépassent la limite de 60 s, et les exports Drive et relances d'email n'ont plus le temps de passer | Appliquer le même schéma que les autres workers : boucle drainInBatches avec budgetMs ~35 s (plus d'analyse démarrée au-delà), en passant d'abord les relances d'email et les exports Drive (rapides), puis les analyses. Lancer l'analyse du CV juste après le dépôt (waitUntil de @vercel/functions) et garder le cron comme simple filet ; passer le cron en horaire si le plan Vercel le permet (OPS-04). | Code |
| OPS-04 | majeur | Plan Vercel : usage commercial, crons quotidiens à l'heure près et conséquences métier à arbitrer avant le lancement | Vérifier le plan du projet Vercel. Pour une activité payante, passer en Pro (usage commercial autorisé, crons à la minute, journaux plus longs, Log Drains), puis rendre horaires appointment-fulfillment, reminder (la fenêtre de 22-26 h est déjà codée pour un cron horaire) et recruitment-processing. Après déploiement, contrôler la présence des 7 crons dans Settings > Cron Jobs et leur premier passage dans les journaux. | Vous |
| OPS-05 | majeur | Aucune supervision : pas de suivi d'erreurs, pas de surveillance de disponibilité, alertes uniquement par email via Resend | Avant le lancement : (1) un service de suivi d'erreurs (Sentry ou équivalent, serveur + navigateur, sans données de santé dans les événements) ; (2) une sonde de disponibilité externe sur / et sur un GET /api/health qui teste la base (SELECT 1) ; (3) une alerte sur les échecs de cron et de webhook (Log Drain Vercel ou monitoring de crons) ; (4) un second canal d'alerte indépendant de Resend (SMS, Slack ou… | Vous |
| OPS-06 | majeur | Configuration « live » des services tiers à faire et à vérifier par le propriétaire (Stripe, Clerk, Google Drive, Turnstile, Resend, DNS, Neon) | Check-list propriétaire. STRIPE : passer en clés live ; créer l'endpoint https://drahmedbenlallahom.com/api/stripe/webhook (domaine exact, sans redirection www) abonné à checkout.session.completed et checkout.session.expired ; copier son whsec_ dans STRIPE_WEBHOOK_SECRET ; faire un paiement réel de 1 € puis un remboursement ; régler le libellé de relevé bancaire ; choisir entre reçus Stripe et facture maison ;… | Vous |
| OPS-08 | majeur | Registre des traitements (sous-traitants) obsolète par rapport à la pile réellement en production | Mettre à jour le registre (article 30 RGPD) et la politique de confidentialité avec la liste réelle des sous-traitants, les pays de traitement et les garanties (DPA, clauses types, DPF), et vérifier le DPA de chacun avant le lancement ; à faire valider par le conseil juridique. | Vous |
| OPS-09 | majeur | Limites d'upload incompatibles avec Vercel : documents candidats jusqu'à 10 Mo et CV jusqu'à 5 Mo, alors qu'une fonction Vercel refuse les corps > 4,5 Mo | Soit abaisser les limites à 4 Mo (serveur + interface + contrôle de taille dans le navigateur avant l'envoi), soit passer à l'envoi direct du navigateur vers Vercel Blob (@vercel/blob/client, handleUpload avec jeton signé, puis validation et chiffrement côté serveur) et servir les téléchargements par URL signée courte. Tester sur une preview Vercel avec un fichier de 5 Mo et un de 9 Mo. | Code |
| PERF-01 | majeur | Clerk (authentification admin) chargé sur toutes les pages publiques : 110 à ~300 Ko brotli de JS tiers en plus et TBT mobile multiplié par ~2,4 | Ne monter ClerkProvider que sur la route /admin : déplacer <ClerkProvider> de main.tsx dans un composant AdminRoot chargé en lazy (route /admin uniquement), et faire en sorte que les pages publiques n'importent ni @clerk/react ni useAuth (vérifier aussi les hooks partagés). Gain attendu : ~86 Ko min de @clerk/react + @clerk/shared retirés du chunk d'entrée, plus aucun script ni appel FAPI Clerk pour les patients… | Code |
| CACHE-01 | mineur | Fichiers JS/CSS hachés sans cache navigateur immuable sur Vercel (revalidation à chaque visite) | Séparer les sorties : dans vite.config.ts, build.assetsDir = "static" (ou rollupOptions.output.{entryFileNames,chunkFileNames,assetFileNames} vers static/[name]-[hash][extname]), puis ajouter dans vercel.json une règle headers { source: "/static/(.*)", Cache-Control: "public, max-age=31536000, immutable" }. Laisser /assets (fichiers non hachés) avec le défaut ou un max-age court. Vérifier ensuite les en-têtes sur… | Code |
| OPS-07 | mineur | Emails patients (confirmation, facture, rappel, remboursement) envoyés par « Hippocampus Consulting <recrutement@…> » sans adresse de réponse | Utiliser un expéditeur dédié aux consultations (ex. « Dr Ahmed Ben Lallahom <consultation@drahmedbenlallahom.com> ») avec un Reply-To vers une boîte surveillée pour les emails patients ; garder recrutement@ pour le recrutement ; vérifier que chaque adresse d'expédition reçoit bien le courrier. | Vous |
| OPS-10 | mineur | Région des fonctions Vercel non fixée : risque d'exécution aux États-Unis, loin de la base Neon (latence multipliée par les requêtes séquentielles, résidence des données) | Dans Vercel > Settings > Functions, choisir la région la plus proche de la base Neon (fra1 si Neon est en aws-eu-central-1, cdg1 sinon) ou l'écrire dans vercel.json ("regions": ["fra1"]) ; vérifier la région Neon ; indiquer la localisation dans le registre (OPS-08). | Vous |
| OPS-11 | mineur | Logo des emails en SVG : non affiché dans Gmail et Outlook (confirmation, facture, codes, emails candidats) | Exporter le logo en PNG (128x128 pour un affichage à 64 px, fond opaque, < 20 Ko), le publier dans client/public/assets/ et changer HIPPOCAMPUS_LOGO_URL ; vérifier le rendu dans Gmail, Outlook et Apple Mail avec un envoi réel ou un outil de prévisualisation (Litmus, Email on Acid). | Code |
| PERF-02 | mineur | Mobile : premier affichage = écran « Chargement de votre espace », puis contenu ~1,5 s plus tard (cascade entrée -> chunk de page lazy), LCP de 3,5 à 4,1 s | Dans scripts/prerender-route-seo.ts, injecter pour chaque route des <link rel="modulepreload"> vers le chunk de la page et ses dépendances (lisibles dans le manifest Vite, build.manifest = true), pour supprimer un aller-retour. À moyen terme, pré-rendre le contenu HTML des pages publiques (SSG/hydratation) pour que le texte soit visible sans JS. Regrouper les icônes lucide partagées dans un seul chunk… | Code |
| PERF-03 | mineur | Chunk d'entrée de 520 Ko (156 Ko gzip, avertissement Vite > 500 Ko), dont 52 à 58 % inutilisés au chargement des pages publiques | Après PERF-01 (sortie de Clerk), charger à la demande les dictionnaires en/de/zh et ventures-en (import() dans LanguageContext selon la langue choisie) ; ajouter `pnpm check:performance` (ou au moins le script de budget) à la CI pour empêcher une nouvelle dérive ; envisager de charger sonner/Toaster à la demande. | Code |
| PERF-04 | mineur | Cloudflare Turnstile chargé dès l'ouverture de l'accueil (formulaire de contact en bas de page) | Ne monter le widget Turnstile que quand la section contact entre dans le viewport (IntersectionObserver) ou au premier focus sur un champ du formulaire. Vérifier que la politique de confidentialité mentionne Cloudflare Turnstile. | Code |
| PERF-05 | mineur | Polices Google Fonts : feuille CSS tierce bloquante + préchargement d'URL de fichiers versionnées en dur | Auto-héberger les polices (@fontsource-variable/dm-sans et @fontsource/playfair-display, sous-ensemble latin, font-display: swap) servies depuis /assets avec cache immuable, ne précharger que la graisse utilisée au-dessus de la ligne de flottaison, et retirer fonts.googleapis.com et fonts.gstatic.com de la CSP. | Code |
| PERF-06 | mineur | Démarrage à froid de la fonction API : ~1,6 à 1,9 s rien que pour charger api/index.js | Charger à la demande (await import()) pdfkit dans server/invoice.ts, @vercel/blob dans les routes d'upload et stripe dans le client Stripe ; supprimer le SDK Manus et axios (voir OPS-02) ; vérifier que Fluid compute est activé sur le projet Vercel (instances réutilisées, moins de démarrages à froid) ; mesurer ensuite le temps de la première requête sur une preview (onglet Observability de Vercel). | Code |
| SEO-01 | mineur | Image de partage (og:image / twitter:image) = logo SVG sur toutes les pages : aucun visuel dans les aperçus LinkedIn, Facebook, WhatsApp et X | Produire une image PNG ou JPEG de 1200x630 (< 1 Mo, texte lisible en petit) par grande rubrique (consultation, recrutement, entreprises), la déclarer dans routeSeo.ts et SEOHead avec og:image:width=1200, og:image:height=630, og:image:alt et og:image:type ; contrôler ensuite avec le LinkedIn Post Inspector et le débogueur de partage Facebook après déploiement. | Code |
| SEO-02 | mineur | Le <head> change après hydratation sur 19 des 25 routes pré-rendues : titres (et souvent descriptions) différents du pré-rendu | Faire lire à SEOHead les métadonnées de server/routeSeo.ts (déplacer la table dans shared/ et l'importer côté client), et ne laisser aux pages que les cas dynamiques. Ajouter un test qui compare, pour chaque route pré-rendue, le titre, la description et la canonique du pré-rendu avec ceux passés à SEOHead. Harmoniser les canoniques (avec ou sans barre finale). | Code |
| SEO-03 | mineur | sitemap.xml maintenu à la main : /venture/pratique-clinique manquant, dates figées en août | Générer sitemap.xml dans scripts/prerender-route-seo.ts à partir de getPrerenderRoutes(), en excluant les routes noindex et les alias (canonicalPath différent), avec lastmod = date du build. Si cette génération n'est pas prête avant le lancement, ajouter tout de suite /venture/pratique-clinique à la main. Soumettre ensuite le sitemap dans la Google Search Console. | Code |
| SEO-04 | mineur | Données structurées JSON-LD incohérentes : image SVG, profil LinkedIn et email différents du site, SearchAction vers une URL non gérée | Corriger sameAs avec l'URL LinkedIn réelle (celle de site-config.ts), aligner l'email, mettre une image PNG/JPEG/WebP (photo pour Person, logo PNG >= 112 px pour Organization), retirer SearchAction (ou la faire pointer vers /search?q=), compléter ou retirer LocalBusiness, puis valider avec le Rich Results Test de Google après déploiement. | Vous |
| SEO-05 | mineur | Icônes : favicon et apple-touch-icon uniquement en SVG, sans favicon.ico ni manifeste ; ces URL renvoient du HTML en 200 | Ajouter dans client/public : favicon.ico (16/32/48), apple-touch-icon.png 180x180 (fond opaque), icon-192.png, icon-512.png et site.webmanifest ; garder le SVG comme <link rel=icon> principal et déclarer les autres formats dans client/index.html. | Code |
| SEO-06 | mineur | URL inconnues en 200 (soft 404) via la réécriture Vercel, et gabarit /_spa-template public sans titre ni robots | Sur une preview Vercel, vérifier le code HTTP d'une URL inconnue. Pour obtenir de vrais 404 : remplacer la réécriture générique par des réécritures explicites des routes dynamiques (/candidate/:path*, /admin, /booking/confirmation) vers /_spa-fallback, et laisser Vercel servir un 404.html (pré-rendu « Page introuvable ») pour le reste. Sortir _spa-template.html de dist/public (ou ajouter X-Robots-Tag noindex sur… | Code |
| SEO-08 | mineur | robots.txt interdit /api/ : les questions-réponses publiées et les témoignages, chargés par l'API, sont invisibles pour les moteurs | Retirer « Disallow: /api/ » de robots.txt (l'en-tête X-Robots-Tag: noindex déjà posé sur /api/* suffit à empêcher l'indexation des réponses JSON), ou au minimum autoriser /api/trpc/medicalQuestions.published et /api/trpc/testimonials.list. À terme, pré-rendre les questions publiées dans le HTML au build (ou créer une URL par question) avec un balisage FAQPage, et contrôler le rendu avec l'outil d'inspection d'URL… | Code |
| SEO-07 | info | Contenus anglais, allemand et chinois non indexables : une seule URL par page, langue choisie côté client, aucun hreflang | Décision métier : si le trafic international compte, publier des URL par langue (/en/…, /de/…) pré-rendues, avec des hreflang réciproques et un x-default ; sinon, assumer un site français et l'écrire dans le plan SEO. | Vous |

## Annexe B — Vérifications réussies (couverture)


<details><summary><b>Réservation & paiement</b> — 46 vérifications</summary>

- [API] availability.getSlots renvoie les 7 plages actives 08:00-23:30 (Europe/Paris) du seed.
- [API] Tarif calculé côté serveur aux bornes : 07:30/07:59 -> 150 €, 08:00/17:30/17:59 -> 100 €, 18:00/23:00/00:00 -> 150 €, en heure de Paris.
- [API] Changement d'heure du 25/10/2026 correct : 17:30 -> 100 €, 18:00 -> 150 € ; en UTC explicite, 16:30Z (17:30 CET) -> 100 € et 17:00Z (18:00 CET) -> 150 €.
- [API] getBookedSlots(J+7) renvoie uniquement le créneau payé APTHARNESS0001 (08:00Z = 10:00 Paris).
- [API] create refuse les dates passées (400 "La date de consultation doit être future") et la date bloquée J+10 (409 "Cette date est indisponible").
- [API] create refuse 07:30, 23:30 et 10:15 (409 "Ce créneau ne correspond pas aux disponibilités configurées") ainsi qu'un créneau déjà payé (409 "Ce créneau chevauche une réservation existante").
- [API] Validation Zod : email invalide, nom ou téléphone vide, détails de plus de 5000 caractères -> 400.
- [API] Parcours jour (J+4 10:00 Paris) : appointment_date 08:00Z, prix 100.00, is_night_rate 0, hold de 30 min. Session Stripe : amount_total et unit_amount 10000, devise eur, libellé « Consultation de conseil santé – 30 minutes », URLs sur PUBLIC_APP_ORIGIN.
- [API] Parcours nuit (J+4 19:00) : final_price 150.00 et Stripe amount_total 15000, égal au prix affiché.
- [WEBHOOK] checkout.session.completed signé -> 200 en 48-138 ms ; rendez-vous completed/confirmed, payment_intent enregistré, jobs confirmation et facture terminés en 1 tentative, sms_sent=0 (aucun faux positif).
- [EMAIL] Confirmation au patient à l'heure de Paris correcte (10:00 / 19:00), avec montant, numéro de suivi et demande échappée en HTML.
- [EMAIL] Notification au propriétaire correcte (heure de Paris, montant, coordonnées).
- [EMAIL] Facture PDF jointe (%PDF-, 1 page), copie stockée en Blob en accès privé.
- [FACTURE] Montants corrects : jour 100.00 € ; nuit 100.00 + majoration 50.00 = 150.00 € ; numéro INV-<trackingId> unique par rendez-vous.
- [WEBHOOK] Double livraison, rejeu du même evt_ et nouvel évènement pour la même session : réponse duplicate, aucun email en double.
- [WEBHOOK] 5 évènements livrés en parallèle pour le même paiement : 1 confirmé et 4 duplicate, exactement 4 emails.
- [WEBHOOK] Montant différent (5000 au lieu de 10000) -> 400, rendez-vous toujours held, aucun email ; payment_status "unpaid" -> non confirmé.
- [WEBHOOK] Signature invalide, trackingId inconnu ou metadata absente -> 400 "Invalid webhook" ; type d'évènement non géré -> 200 sans effet.
- [WEBHOOK] Session payée différente de celle enregistrée -> rendez-vous non confirmé et alerte au propriétaire avec montant, session et PaymentIntent.
- [WEBHOOK] Paiement arrivé après la libération du créneau : pas de reconfirmation, alerte au propriétaire, et une nouvelle livraison ne produit pas de 2e alerte.
- [API] cancelPending : la session Stripe est expirée AVANT la libération du créneau, rendez-vous cancelled, créneau re-réservable ; 2e appel idempotent ; session inconnue -> 400 ; session payée non annulée.
- [API] Double réservation séquentielle refusée (409) ; 8 requêtes concurrentes -> exactement 1 succès et une seule ligne held.
- [API] Webhook checkout.session.expired : créneau libéré.
- [CRON] Hold expiré invisible dans getBookedSlots ; appointment-hold-cleanup -> released 1.
- [API] Plafond de 2 holds par email, casse ignorée : la 3e tentative reçoit 429 avec le message exact ; après une annulation, une nouvelle réservation est acceptée.
- [CRON] Rappel : seuls les rendez-vous payés et confirmés à 7,2 h, 11,2 h et 22,2 h sont rappelés. Exclus : 31,2 h, 0,5 h, hold non payé, payé puis annulé. La 2e exécution envoie 0 rappel.
- [CRON] Rappel avec Resend en panne : la réservation du rappel est relâchée, puis le rappel part à l'exécution suivante ; l'email indique « 12 octobre 2026 à 08:00 (heure de Paris) », ce qui est correct.
- [WEBHOOK] Resend en panne pendant le webhook : réponse 200, paiement confirmé, jobs en retry ; le cron appointment-fulfillment reprend ensuite les envois une seule fois.
- [CRON] Rendez-vous devenu passé avant l'envoi : pas de confirmation, facture envoyée et alerte au propriétaire ; en échec permanent, 3 tentatives puis failed et 2 alertes.
- [API] Limite par IP : 7e tentative -> 429 « Trop de tentatives de réservation ont été effectuées. Veuillez réessayer dans une heure ou nous contacter directement. » ; une autre IP n'est pas touchée ; évènement de sécurité journalisé.
- [API] Limite par email : 6e tentative -> 429 avec le même message (casse ignorée, IP différentes).
- [API] Stripe en panne pendant create : 500, le hold est annulé immédiatement et le créneau redevient réservable ; cancelPending pendant la panne conserve le hold.
- [API] createCheckoutSession réutilise la session ouverte ; montant ou email différent -> 400.
- [API] Remboursement admin (MFA réelle) de APTHARNESS0001 : re_test de 10000 cents EUR sur le bon PaymentIntent, statut refunded/cancelled, créneau libéré, email « Remboursement confirmé » ; 2e appel -> 409 ; non admin ou admin sans MFA -> 403.
- [ADMIN] admin.stats.revenue = somme des rendez-vous payés, remboursés exclus.
- [CRON] reminder, appointment-fulfillment et appointment-hold-cleanup sans Bearer ou avec un mauvais Bearer -> 403 cron-only.
- [NAVIGATEUR] /booking via l'edge : aucune erreur JS, aucune violation CSP, aucune requête externe ; le bouton de paiement reste désactivé tant que le créneau est invalide ; champs requis et format email validés par le navigateur.
- [NAVIGATEUR] 15:00 -> « Créneau disponible », « jeudi 15 octobre 2026 à 15:00 », Total 100 € ; 19:00 -> 150 € ; même montant (100.00 EUR) sur la page de paiement.
- [NAVIGATEUR] Date bloquée, créneau payé, 07:30, 15:15 et 31/02/2027 : bon message à chaque fois et bouton désactivé.
- [NAVIGATEUR] Parcours complet formulaire -> Stripe -> Payer -> page de succès ; base confirmée (13:00Z = 15:00 Paris) et 4 emails.
- [NAVIGATEUR] Annulation depuis Stripe -> page « non finalisée », cancelPending appelé automatiquement, session expirée, créneau libéré.
- [NAVIGATEUR] Tarifs et politique d'annulation de 24 h affichés avant le bouton de paiement.
- [NAVIGATEUR] Mobile 412 px : pas de défilement horizontal, aucune erreur.
- [NAVIGATEUR] Messages exacts affichés pour le plafond de 2 holds (3e soumission) et pour la limite IP (7e soumission).
- [EDGE] /booking pré-rendu, indexé, avec canonical ; /booking/confirmation en noindex.
- [\HARNESS] Aucune tentative de sortie réseau (egress_blocked) dans mock-calls.jsonl de l'instance booking.

</details>

<details><summary><b>Juridique & conformité</b> — 26 vérifications</summary>

- [code] /legal (FR/EN/DE/ZH) : l'hébergeur indiqué est Vercel Inc. et non plus Manus (LegalPage.tsx l.131, 428, 698, 968)
- [code] /legal : l'éditeur est identifié (Hippocampus Consulting SARL, capital 1 000 €, RCS 999 259 252 Paris, siège 6 rue d'Armaillé 75017, directeur de la publication Ahmed Ben Lallahom)
- [exécuté] Stripe Checkout : libellé désormais en français « Consultation de conseil santé – 30 minutes » (ancien point P2-2 corrigé), montant 15000 centimes pour un créneau de nuit à 20:00 heure de Paris, prix calculé côté serveur
- [exécuté] Paiement simulé : confirmation patient, notification propriétaire et facture PDF envoyées immédiatement après le webhook (mails #4-#7, instance legal)
- [code] /booking : encart urgence présent (« En cas d’urgence médicale ou de danger immédiat, appelez immédiatement les secours… »), ainsi que dans la FAQ (112)
- [code] Les données de carte sont traitées uniquement par Stripe Checkout (redirection, aucun champ carte sur le site)
- [exécuté] La facture PDF est déposée en Blob avec access 'private' (state/legal/blob/invoices/…, storage.ts PRIVATE_BLOB_ACCESS)
- [exécuté] Bandeau cookies : « Essentiels uniquement » est au premier niveau, accessible en un clic, à côté de « Accepter tous les cookies » (refuser est aussi simple qu'accepter) ; la croix ferme le bandeau sans enregistrer de consentement
- [code] Umami n'est chargé que si le consentement « performance » vaut true ET si VITE_ANALYTICS_ENDPOINT/WEBSITE_ID sont définis ; aucun traceur d'analyse observé avant consentement dans le harnais
- [exécuté] Aucun cookie first-party déposé pour un visiteur anonyme sur /, /booking ou /legal dans le harnais (Clerk simulé ; le comportement réel de clerk-js n'est pas reproduit)
- [code] Emailing recrutement : l'audience exige marketing_consent=1, exclut les désinscrits et les adresses supprimées, et chaque envoi contient un lien de désinscription (routers.ts l.1357, 1417, 1463) ; conforme à L34-5 CPCE pour des particuliers
- [code] Recrutement : aucun paiement demandé aux candidats (Stripe absent des parcours candidat), conforme à L5321-3 C. trav.
- [code] Barème IA recrutement strictement professionnel (spécialité /30, expérience /25, compétences /20, langues /15, titres /10), interdiction explicite de l'âge, du sexe, de l'origine, de la nationalité, de la religion, de la santé, du handicap, de la situation familiale et de la photo dans le prompt ; OCR « ignore les photos et toute caractéristique protégée » ; rapprochement employeur sans critère protégé
- [code] Consentement candidat : il mentionne l'analyse automatisée d'aide à la présélection et la revue humaine obligatoire, dans les 4 langues ; la politique le rappelle (« Recrutement et IA »)
- [code] Analyse IA des CV via Vercel AI Gateway avec disallowPromptTraining: true (recruitmentAnalysis.ts l.261, 1236)
- [exécuté] Questions médicales : aucune notification email contenant la question n'est envoyée au propriétaire à la soumission (QMED-HFM9DT3N-TP0LU) ; la reformulation IA reçoit un brouillon dont les coordonnées sont masquées (redactContactMarkers)
- [code] Questions médicales : avertissement urgence et case « ne répond pas aux urgences » obligatoire ; publication publique filtrée sur publicationConsent=1 et status=published
- [exécuté] Documents candidats chiffrés avant stockage (Blob .enc, access private) ; téléversement soumis à Turnstile et à une session candidat
- [code] Droits RGPD : la politique liste accès, rectification, effacement, limitation, portabilité, opposition et droit de ne pas faire l'objet d'une décision automatisée, ainsi que la réclamation CNIL ; formulaire /gdpr fonctionnel avec réponse annoncée sous 30 jours
- [code] DPO : non obligatoire a priori (médecin isolé, pas de traitement à grande échelle, considérant 91 RGPD) ; un contact de responsable est fourni
- [code] Information de prix avant paiement (100 € / 150 €, majoration de nuit 18 h-8 h) sur /booking et dans la FAQ
- [code] Pages juridiques disponibles en français (et en EN/DE/ZH) ; aucune mention publique de Manus comme hébergeur ou prestataire sur /legal
- [code] Retrait du consentement cookies : un bouton flottant « Préférences cookies » reste accessible après le choix ; le retrait de « performance » retire la balise Umami
- [exécuté] Liens juridiques du pied de page (/legal, ?tab=privacy, ?tab=terms) présents sur /, /recruitment/standard, /questions-anesthesie, /employers et /gdpr (legal-links.json)
- [exécuté] Cron recruitment-retention : authentifié, il marque les dossiers échus et notifie le propriétaire (conforme au code, mais non destructif : voir LEGAL-13)
- [code] Analyse IA : aucune décision automatique ; le score n'est affiché qu'avec au moins 80 % de preuves vérifiées, sinon le dossier passe en revue manuelle (recruitmentAnalysis.ts l.1021, l.1132)

</details>

<details><summary><b>Sécurité</b> — 31 vérifications</summary>

- [AUTHZ] Matrice tRPC dynamique sur les 100 procédures (security/scripts/authz-matrix.mjs, authz-matrix.json/txt) : les 67 procédures admin.*, medicalQuestions.admin.*, testimonials.create, system.notifyOwner et adminSecurity.events renvoient 403 pour un anonyme, un utilisateur Clerk non admin, un candidat et un admin Clerk SANS MFA ; seul l'admin avec MFA passe.
- [AUTHZ] adminSecurity.status/begin/verify : 401 pour un anonyme ou un candidat, 403 pour un utilisateur non admin.
- [AUTHZ] candidatePortal.sessions/documents/revokeSession/documentDownload : 401 pour toute session non candidate (y compris un admin Clerk) ; un candidat n'accède qu'à ses propres données.
- [IDOR] Candidat A contre ressources du candidat B : téléchargement du document de B -> 404, documentDownload(B) -> 404, revokeSession(sessions de B) -> 404 et les sessions de B restent actives.
- [AUTHZ] GET /api/admin/candidate-documents/:id/download : 403 pour un candidat, un utilisateur non admin ou un admin sans MFA ; 200 pour l'admin avec MFA.
- [DOWNLOAD] Téléchargements candidat et admin : Content-Type validé, Content-Disposition attachment avec nom assaini, Cache-Control no-store, nosniff ; contenu déchiffré identique au fichier déposé (AES-256-GCM au repos).
- [WEBHOOK] Stripe : sans signature, mauvais secret, horodatage de 10 min ou corps modifié -> 400 et le rendez-vous reste pending/held ; seule une signature valide confirme le paiement.
- [WEBHOOK] Resend /api/webhooks/resend : signature Svix invalide, horodatage ancien ou en-têtes svix absents -> 400 sans écriture en base ; signature valide -> 200 ; même svix-id rejoué -> {duplicate:true} sans double insertion ; secret absent -> 503 (lecture du code).
- [CRON] Les 7 GET /api/scheduled/* : sans en-tête, avec Bearer faux, avec le secret sans préfixe Bearer ou avec « bearer » en minuscules -> 403 ; avec le bon secret -> 200. La comparaison se fait en temps constant (SHA-256 + timingSafeEqual) et l'accès est refusé si CRON_SECRET est vide.
- [CRON] Les POST legacy /api/scheduled/* ne déclenchent aucun traitement sans session Manus ; la route Manus /api/oauth/callback n'est pas montée.
- [CSP] Balayage Chromium de 20 pages publiques via l'edge, de /candidate/portal (avec session) et de /admin (avec MFA) : 0 violation CSP, 0 erreur console, 0 erreur de page ; le capteur a été validé par une injection volontaire bloquée.
- [EN-TÊTES] Express et vercel.json envoient la même CSP (frame-ancestors 'self', object-src 'none', base-uri 'self'), HSTS 2 ans avec preload, nosniff, Referrer-Policy et Permissions-Policy ; /api/* reçoit no-store et noindex.
- [HTML] index.html ne contient aucun script inline exécutable.
- [BUNDLE] dist/public : aucune des 15 valeurs secrètes du serveur, aucun motif sk_/rk_/whsec_/re_/postgres:///vercel_blob_rw_/GOCSPX-/clé privée ; seules la clé publiable Clerk et la site key Turnstile sont présentes ; envPrefix est limité à VITE_ et NEXT_PUBLIC_.
- [COOKIES] candidate_portal_session : HttpOnly, SameSite=Lax, Secure derrière HTTPS (X-Forwarded-Proto), 7 jours. admin_mfa_session : HttpOnly, Secure, SameSite=Lax, 8 h. Cookie d'état OAuth Drive : __Host-, HttpOnly, Secure. Jetons de 256 bits, stockés seulement sous forme hachée.
- [REDIRECTION] appointments.create avec Host/Origin/X-Forwarded-Host = evil.example : success_url et cancel_url restent sur PUBLIC_APP_ORIGIN ; les liens email sont construits depuis PUBLIC_APP_ORIGIN ; aucune redirection ouverte trouvée.
- [CSRF] tRPC refuse text/plain et application/x-www-form-urlencoded (415) et les GET sur une mutation (405) ; aucun en-tête CORS n'est renvoyé.
- [ENUMERATION-MESSAGES] login, register et requestPasswordReset renvoient des messages et des corps identiques, que l'email existe ou non.
- [RATE-LIMIT] candidatePortal.login : la 11e tentative en 15 min sur le même email+IP -> 429 ; varier X-Forwarded-For à travers l'edge (comportement Vercel) ne contourne pas la limite.
- [RATE-LIMIT-PUBLIC] À travers l'edge : contact.submit même email -> 5 x 200 puis 429 ; appointments.create avec 7 emails depuis une IP -> 6 x 200 puis 429 ; même email depuis 3 IP -> 200, 200, 429 (plafond de 2 créneaux retenus par email).
- [MOT DE PASSE] scrypt N=2^15, r=8, p=3, sel de 16 octets, poivre HMAC obligatoire, comparaison timingSafeEqual (conforme OWASP) ; 15 à 128 caractères ; contrôle HIBP ; jetons de vérification et de réinitialisation de 256 bits valables 30 min ; resetPassword révoque toutes les sessions.
- [IDOR-PUBLIC] Aucune procédure publique ne renvoie de données personnelles à partir d'un numéro de suivi. createCheckoutSession exige trackingId + email + nom + montant ; cancelPending exige l'identifiant secret de session Stripe ; jeton de désinscription aléatoire -> 404 ; invitation forgée -> 400.
- [FUITES-PUBLIQUES] testimonials.list, medicalQuestions.published (publié ET consentement), blog et getBookedSlots n'exposent aucune donnée personnelle.
- [IDENTIFIANTS] Tous les numéros de suivi viennent de node:crypto : 48 à 80 bits, non énumérables.
- [UPLOAD-CV] /api/recruitment/apply : HTML renommé .pdf, PDF avec JavaScript/OpenAction, signature ne correspondant pas à l'extension, type text/html, extension .exe et fichier > 5 Mo -> tous 400 ; noms avec traversée de chemin ou CRLF assainis ; stockage en Blob privé, téléchargement par URL présignée de 5 min sur un autre domaine.
- [UPLOAD-COFFRE] /api/candidate/documents : SVG refusé ; HTML, PNG ou PDF déguisés -> 400 signature ; nom avec guillemet + CRLF + Set-Cookie renvoyé assaini dans Content-Disposition, sans injection d'en-tête.
- [EXPRESS] Matrice des routes Express : upload anonyme -> 401, téléchargement admin anonyme -> 403, OAuth Drive anonyme ou non admin -> 403, /manus-storage -> 502 sans fuite, client-briefs : schéma invalide ou pot de miel -> 400, JSON mal formé -> 400, corps > 1 Mo -> 413.
- [FUITES-ERREURS] Aucune trace de pile n'est renvoyée au client.
- [SSRF] Tous les fetch serveur visent des hôtes fixes ou des URL Blob présignées construites à partir de clés générées par le serveur : pas de SSRF trouvé ; aucune tentative de sortie réseau n'a été journalisée par le harnais.
- [MFA-ADMIN] adminProcedure exige le rôle (défini par CLERK_OWNER_USER_ID, jamais par la base) ET une session MFA serveur valide ; code à 6 chiffres haché, valable 10 min, 5 essais, comparaison en temps constant. Seule exception : les routes OAuth Drive (déjà connue).
- [DEPENDANCES] pnpm audit --prod : 0 critique, 0 élevé.

</details>

<details><summary><b>Recrutement & espace candidat</b> — 54 vérifications</summary>

- [API exécuté] POST /api/recruitment/apply : candidature valide PDF -> 201 + numéro de suivi CV…, ligne cv_applications (quarantined, retention_until = +2 ans), CV stocké en Blob privé, email de confirmation candidat + notification propriétaire capturés.
- [API exécuté] Candidature valide avec CV DOCX (ZIP + [Content_Types].xml) -> 201.
- [API exécuté] CV .exe renommé .pdf (signature MZ, type application/pdf) -> 400 cv_validation_signature_invalid ; PNG renommé .pdf -> 400 signature_invalid ; PNG image/png -> 400 "Format de CV non accepté" ; setup.exe application/x-msdownload -> 400.
- [API exécuté] CV de 5 Mo + 10 octets -> 400 "Le CV ne doit pas dépasser 5 Mo." ; fichier vide (0 octet) et PDF de 15 octets -> 400 cv_validation_size_invalid ; sans CV -> 400 "Le CV est requis."
- [API exécuté] PDF avec /OpenAction /JavaScript -> 400 cv_validation_pdf_active_content ; DOCX avec word/vbaProject.bin (macro) -> 400 cv_validation_docx_active_content ; PDF nommé .docx -> 400 cv_validation_type_mismatch.
- [API exécuté] Consentement RGPD absent ou "0" -> 400 ; honeypot website rempli -> 400 "La candidature n’a pas pu être traitée." ; email invalide, aucun pays ciblé, pays du diplôme vide -> 400 ; 19 pays ciblés -> 400 "jusqu’à 18 pays".
- [API exécuté] Turnstile : jeton refusé (fail…), jeton absent, et siteverify en panne (flag turnstile=down) -> 400 dans les 3 cas, aucune ligne créée (fail-closed).
- [API exécuté] Aucune ligne cv_applications ni objet Blob créé pour les 20 envois rejetés (vérifié en base et dans state/candidate/blob).
- [API exécuté] Injection HTML dans prénom/nom (<img onerror>, <script>) : correctement échappée dans l’email candidat et dans la notification propriétaire ; nom de fichier ../../../etc/passwd.pdf assaini en passwd.pdf (pas de traversée de chemin).
- [API exécuté] Lien d’invitation de l’email de confirmation pointe vers PUBLIC_APP_ORIGIN (http://localhost:4131/candidate/access?invite=…) ; aucun secret dans l’email (jeton d’invitation signé HMAC, sans email ni mot de passe).
- [API exécuté] Doublon : même CV + même email (insensible à la casse) + même spécialité -> 200 {duplicate:true, trackingId identique}, aucune nouvelle ligne ni nouveau fichier ; même CV pour une autre spécialité -> nouvelle candidature 201 (comportement documenté).
- [API exécuté] Limite de débit candidature : 10 envois / 24 h par couple IP+email ; le 11e et le 12e -> 400 "Trop de tentatives… Patientez une heure" + événement security_events public_recruitment_apply_protection (blocked).
- [Cron exécuté] GET /api/scheduled/recruitment-processing sans bearer ou avec un bearer faux -> 403 {error:cron-only} ; avec Bearer CRON_SECRET -> 200, 5 analyses traitées par lot (texte extrait du PDF et du DOCX stocké, statut needs_review, aucun score quand les preuves ne correspondent pas au CV).
- [Cron/admin exécuté] Analyse IA avec réponse conforme (flag ai=fixture) via admin.recruitment.reanalyze : score 82 stocké, 10/10 citations vérifiées, revue humaine toujours requise (needs_review).
- [Cron exécuté] Passerelle IA en échec de facturation (flag ai=billing, HTTP 402) : repli propre en revue manuelle ("L’analyse IA complète est temporairement indisponible"), pas d’erreur 500 ni de job bloqué.
- [Cron exécuté] GET /api/scheduled/recruitment-retention avec bearer -> 200 {notified:0} ; GET /api/scheduled/candidate-document-processing -> 200, 3 documents du coffre analysés (stub IA), analysis_status completed, synthèse et indice de confiance stockés.
- [API exécuté] POST /api/client-briefs (formulaire employeur) : brief valide -> 200 + BRIEF… + notification propriétaire ; honeypot -> 400 ; email invalide, organisation vide, notes > 3000 caractères -> 400.
- [API exécuté] Nouvelle limite de débit brief employeur : 5/h par IP (6e et 7e -> 429 "Trop de demandes…") et 10/jour par email même en changeant d’IP (11e et 12e -> 429).
- [API exécuté] Invitation portail : resolveInvitation avec le jeton de l’email -> email/prénom/nom de la candidature ; jeton altéré ou charge utile forgée (applicationId=1 avec la signature d’un autre jeton) -> 400 "invitation invalide ou expirée".
- [API exécuté] Inscription avec invitation mais autre email -> 400 "Cette invitation ne correspond pas à cette adresse email" ; mot de passe < 15 caractères -> 400 ; mot de passe présent dans la liste HIBP -> 400 "déjà compromis" ; conditions non acceptées -> 400 ; Turnstile refusé -> 400.
- [API exécuté] HIBP indisponible (flag hibp=down) avec un mot de passe non mis en cache -> 503 "contrôle… temporairement indisponible", aucun compte créé (fail-closed).
- [API exécuté] Inscription valide -> email "Confirmez votre adresse email" avec lien /candidate/verify vers PUBLIC_APP_ORIGIN ; connexion avant vérification -> 401 générique ; vérification avec jeton faux -> 400 ; jeton correct -> session créée (cookie candidate_portal_session HttpOnly, SameSite=Lax, 7 jours) et compte lié à la candidature (linked_application_id) ; réutilisation du même jeton -> 400.
- [API exécuté] Ré-inscription sur un email déjà vérifié -> même message générique, aucun email envoyé (pas d’énumération par le formulaire d’inscription).
- [API exécuté] Verrouillage du compte candidat : 5 mauvais mots de passe -> locked_until = +15 min ; ensuite le bon mot de passe est refusé avec le même message générique, même depuis une autre IP.
- [API exécuté] Limite de débit connexion candidat (requêtes séquentielles) : 10 tentatives / 15 min par email+IP, 11e et 12e -> 429.
- [API exécuté] Renvoi du lien d’activation : compte non vérifié -> 4 emails puis 429 au 5e (limite 4/h) ; compte déjà vérifié -> réponse générique et aucun email.
- [API exécuté] Mot de passe oublié : email inconnu -> même message générique et aucun email ; Turnstile refusé -> 400 ; email connu -> email "Réinitialisez votre mot de passe" avec lien /candidate/reset-password vers PUBLIC_APP_ORIGIN.
- [API exécuté] Réinitialisation : mot de passe court ou compromis (HIBP) -> 400 ; jeton utilisé avec un autre email -> 400 ; jeton valide -> succès, nouvelle session, toutes les anciennes sessions révoquées (cookie antérieur -> me = null), verrouillage remis à zéro ; réutilisation du jeton -> 400 ; ancien mot de passe refusé, nouveau accepté.
- [API exécuté] Déconnexion : session révoquée côté serveur (le cookie rejoué après logout donne me = null et documents -> 401), cookie effacé ; liste des sessions actives avec indicateur de session courante.
- [API exécuté] Sessions candidat : révoquer la session de l’appareil B depuis A -> B déconnecté (me = null) ; « Révoquer toutes » -> A et B déconnectés.
- [API exécuté] Dépôt de documents candidat : PDF, PNG et DOCX acceptés (201) ; .exe renommé .pdf, PNG renommé .pdf, HTML renommé .png -> 400 signature_invalid ; .exe octet-stream et SVG -> 400 "Format de document non accepté" ; PDF avec JavaScript -> 400 pdf_active_content ; > 10 Mo -> 400 ; fichier vide -> 400 size_invalid ; sans fichier, catégorie inconnue, catégorie "other" sans libellé -> 400 ; Turnstile refusé -> 400 ; sans session -> 401.
- [Exécuté] Chiffrement au repos des documents du coffre : les 3 objets Blob ne commencent pas par la signature du format (%PDF, PNG, PK), entropie 7,8–8,0 bits/octet, déchiffrement AES-256-GCM avec la clé CANDIDATE_DOCUMENT_ENCRYPTION_KEY + IV/tag stockés en base -> fichier d’origine identique ; Blob en accès private, content-type application/octet-stream.
- [API exécuté] Téléchargement de son propre document (GET /api/candidate/documents/:id/download) -> 200, octets identiques à l’original, Content-Disposition attachment, Cache-Control no-store, private.
- [API exécuté] IDOR documents : un autre candidat connecté (portal.a) qui demande le document n°1 du candidat 1 -> 404 "Document introuvable" via GET /api/candidate/documents/1/download et via tRPC candidatePortal.documentDownload ; sa liste de documents est vide ; identifiants invalides (0, -1, abc, 1.5, très grand) -> 400 ; révoquer la session d’un autre candidat -> 404.
- [API exécuté] Route admin GET /api/admin/candidate-documents/1/download : anonyme, cookie candidat, utilisateur Clerk non admin -> 403 "Accès administrateur requis" ; admin Clerk sans MFA serveur -> 403 "Double authentification requise" ; admin + MFA -> 200, document déchiffré (%PDF), téléchargement journalisé (actor_type admin, metadata mfa:true). tRPC admin.candidateDocuments.download : user -> 403, admin sans MFA -> 403.
- [Exécuté] Journal d’audit candidate_document_audit_logs : dépôt et chaque téléchargement (candidat et admin) tracés.
- [Exécuté, via edge] Réponse de téléchargement candidat : 200 application/pdf, Content-Disposition attachment, Cache-Control no-store, X-Content-Type-Options nosniff, CSP et HSTS présents ; /candidate/portal servi avec X-Robots-Tag noindex, nofollow.
- [API exécuté] Campagne recrutement (admin+MFA) : seule la candidature avec consentement marketing est éligible ; email reçu avec lien /recruitment/unsubscribe?token=<UUID 128 bits> vers PUBLIC_APP_ORIGIN ; contenu HTML échappé.
- [API exécuté] Désinscription : jeton inconnu ou altéré -> 404 "Lien de désinscription invalide ou expiré" ; jeton trop court -> 400 ; jeton valide -> marketing_consent=0 + date de désinscription ; rejouer le lien -> alreadyUnsubscribed:true ; le candidat sort de l’audience et un nouvel envoi ciblé est refusé (400).
- [Navigateur exécuté] /recruitment/unsubscribe : jeton valide -> page de confirmation avec bouton (pas de désinscription automatique au simple chargement, ce qui protège des scanners de liens), clic -> « Préférence enregistrée » et marketing_consent=0 en base ; jeton inconnu -> « Lien indisponible » ; jeton trop court ou absent -> « Lien indisponible » sans appel serveur.
- [API exécuté] Invitation portail par l’admin (admin.recruitment.candidate.sendPortalInvitation) : utilisateur non admin -> 403, admin sans MFA -> 403 ; admin+MFA -> email « Créez votre espace candidat » avec lien /candidate/access?invite=… vers PUBLIC_APP_ORIGIN, clé d’idempotence par tentative ; compte déjà actif pour cet email -> 409.
- [Navigateur exécuté, via émulateur edge] /recruitment, /recruitment/standard, /recruitment/vvip-offshore, /vvip-offshore, /employers, /why-hippocampus, /candidate/access, /candidate/portal, /recruitment/unsubscribe en desktop (1366 px) et mobile (Pixel 7) : HTTP 200, titres propres à chaque page, aucune erreur console, aucune erreur JS, aucune violation CSP, aucun débordement horizontal ; pages candidat et désinscription en noindex ; /candidate/portal sans session redirige vers /candidate/access.
- [Navigateur + code] Aucune page recrutement (FR et EN : hub, standard, VVIP/offshore, employeurs, pourquoi Hippocampus, espace candidat), aucun email candidat ni aucun code serveur ne demande de paiement au candidat : le parcours VVIP/offshore décrit des missions (Moyen-Orient VVIP, plateformes pétrolières, sites miniers) et des exigences (5 ans d’urgence, ATLS/ACLS/HUET…) sans tarif ; Stripe n’est utilisé que pour les consultations patients (conforme à l’interdiction de faire payer les candidats, art. L5321-3).
- [Navigateur exécuté, edge] /recruitment/standard : envoi vide -> champs obligatoires marqués aria-invalid + message ; sélection de spécialité (65 options), recherche du pays du diplôme (Tunisie), pays ciblés, langues, message ; CV .exe renommé .pdf -> message serveur "Le contenu du CV ne correspond pas…" affiché ; CV PDF valide -> écran « Candidature reçue » avec numéro de suivi, ligne en base conforme (champs, consentements, nom de fichier assaini), email candidat + notification propriétaire ; aucune erreur JS ni violation CSP.
- [Navigateur exécuté, edge] /recruitment/vvip-offshore : envoi vide et PNG -> message "Veuillez joindre un CV valide…" ; CV DOCX valide -> « Candidature VVIP enregistrée » + numéro de suivi, spécialité préfixée [VVIP / Offshore], email candidat + notification propriétaire ; aucune erreur JS ni violation CSP.
- [Navigateur exécuté] Turnstile en échec côté serveur (mode fail) -> message « La vérification de sécurité doit être renouvelée avant l’envoi. » ; widget en erreur (mode error) -> bouton d’envoi désactivé + message « La vérification de sécurité n’a pas pu être chargée… » + bouton Réessayer.
- [API exécuté] Contre-pression : avec 200 analyses en attente, POST /api/recruitment/apply -> 503 "volume élevé" (comportement voulu, voir CAND-05 pour la conséquence) ; après purge -> 201.
- [API exécuté] Candidature via l’émulateur edge (navigateur sur http://localhost:4131, /api proxifié vers la fonction) : multipart + Turnstile acceptés, comme en direct.
- [Navigateur exécuté, edge] /employers : envoi vide bloqué par la validation native (5 champs requis) ; brief complet -> écran « Brief de mission enregistré » avec la référence BRIEF…, notification propriétaire envoyée ; aucune erreur JS ni CSP. La limite 5/h par IP s’applique aussi depuis le navigateur (6e envoi -> HTTP 429).
- [Navigateur exécuté] Parcours complet portail : lien d’invitation de l’email -> formulaire pré-rempli (email, prénom, nom) + message « invitation vérifiée » ; mots de passe différents -> message ; consentements manquants -> message ; inscription -> message générique + email d’activation ; clic sur le lien d’activation -> /candidate/portal connecté ; dépôt d’un PDF par l’UI (catégorie Diplôme, Turnstile) -> « Document reçu… » et document listé ; bouton Télécharger -> fichier diplome-paula.pdf (application/pdf, attachment) ; Déconnexion -> /candidate/access et /candidate/portal redirige ensuite vers l’accès ; mauvais mot de passe -> message générique ; aucune erreur JS ni violation CSP.
- [Navigateur exécuté, Pixel 7] Parcours portail complet sur mobile (invitation, inscription, activation, dépôt, liste, déconnexion) fonctionnel, sans erreur JS ni violation CSP.
- [Navigateur exécuté] Mot de passe oublié par l’UI : message générique, email reçu, page /candidate/reset-password (2 champs), nouveau mot de passe -> connecté sur /candidate/portal.
- [Exécuté] Revue des 97 emails capturés pendant les tests : tous les liens d’action pointent vers PUBLIC_APP_ORIGIN (http://localhost:4131) ; seul le logo pointe vers https://drahmedbenlallahom.com ; aucun secret serveur (JWT, Stripe, Resend, pepper, clé de chiffrement, Blob, CRON_SECRET, Google, IA, Turnstile), aucun mot de passe et aucune référence de stockage Blob dans les sujets, HTML ou textes ; les jetons présents sont uniquement ceux des liens prévus (invitation, activation, réinitialisation, désinscription).
- [Exécuté] Expiration réelle du lien d’invitation de l’email de confirmation : 30 min après l’envoi, resolveInvitation -> 400 (comportement codé, voir CAND-11 pour l’impact).

</details>

<details><summary><b>Back-office admin</b> — 60 vérifications</summary>

- [ACL-01] Matrice d'accès (access-matrix.mjs) : 24 queries + 41 mutations admin tRPC (admin.*, testimonials.create, system.notifyOwner, medicalQuestions.admin.*, adminSecurity.events) + 3 routes Express (/api/admin/candidate-documents/:id/download, /api/google-drive/oauth/connect\|callback) : 68/68 refusées en anonyme (403, 401 pour adminSecurity.events).
- [ACL-02] Utilisateur Clerk connecté non admin (user, user:attacker_matrix) : 68/68 refusés (403).
- [ACL-03] Admin Clerk sans MFA (admin, admin-unverified) : 65/65 procédures tRPC refusées (403 « Validation de sécurité administrateur requise »), téléchargement de document admin refusé (403) ; seule exception /api/google-drive/oauth/connect (voir ADM-DRIVE-02).
- [ACL-04] Aucun effet de bord en base ni email envoyé après la matrice d'accès.
- [MFA-01] Admin dont l'email Clerk n'est pas vérifié : adminSecurity.begin refusé (400), aucun code émis.
- [MFA-02] Flux nominal : begin → email « Code de sécurité » capturé (6 chiffres, aucun lien) → verify → cookie admin_mfa_session HttpOnly; SameSite=Lax; Max-Age=28800 (+ Secure derrière https) → admin.stats accessible.
- [MFA-03] Mauvais code refusé avec message générique (400).
- [MFA-04] Rejeu d'un code déjà consommé depuis une autre session : refusé.
- [MFA-05] Anti force brute : après 5 essais faux, le bon code est refusé (attempts=5), échecs journalisés en security_events (high).
- [MFA-06] Code expiré (forcé en base) refusé ; un nouveau code émis ensuite est accepté.
- [MFA-07] Cookie MFA admin rejoué avec une identité Clerk non admin : refusé (403).
- [UI-GATE-01] /admin anonyme via edge : écran « Connexion administrateur requise », aucune donnée chargée, X-Robots-Tag noindex,nofollow + meta noindex.
- [UI-GATE-02] /admin en non-admin : « Accès refusé », aucune requête admin réussie.
- [UI-GATE-03] /admin admin sans MFA : écran « Validation de sécurité », envoi de code, mauvais code → toast d'erreur, bon code → tableau de bord.
- [XSS-01] Charges XSS (<img onerror>, "><svg onload>, <script>, liens javascript:) soumises par contact, RGPD, réservation payée, question santé, candidature (nom de fichier piégé), brief employeur, document candidat, témoignage admin.
- [XSS-02] 13 onglets admin + candidatures dépliées + fiches 360° + détail question santé : 0 dialogue, 0 élément onerror/onload/img[src=x], 0 pageError, 0 violation CSP.
- [XSS-03] Nom de fichier CV assaini à l'enregistrement ; notifications propriétaire échappées (escapeHtml).
- [APT-01] Réservations : liste, filtres statut cohérents avec la base, agenda en Europe/Paris.
- [APT-02] Remboursement via l'UI (confirm) → refunded/cancelled, créneau libéré, 1 remboursement Stripe-fake, email patient, revenus mis à jour.
- [APT-03] Double remboursement concurrent : 1 seul remboursement Stripe (idempotence), 2e appel 409, 1 seul email.
- [APT-04] Remboursement à moins de 24 h refusé (409, message clair), aucune écriture.
- [APT-05] Cron reminder : rappels J-1 envoyés aux RDV confirmés de la fenêtre 1–30 h.
- [AVAIL-01] Créneaux via l'UI → base et API publique à jour ; réservation hors créneau refusée (409), dans le créneau acceptée ; /booking affiche l'indisponibilité.
- [AVAIL-02] Date bloquée via l'UI (motif XSS inerte) → réservation refusée (409), /booking « Date indisponible » ; déblocage → réservation de nouveau possible.
- [TESTI-01] Témoignages : approuver + mettre en avant → visible sur l'accueil ; rejeter → retiré ; supprimer (confirm) → supprimé en base.
- [TESTI-02] Témoignage avec charges XSS (testimonials.create) affiché inerte sur l'accueil public.
- [MQ-01] Question sans accord de publication : case « Publier » désactivée ; l'API refuse publish=true (400) sans envoyer d'email.
- [MQ-02] Réponse privée validée via l'UI → email capturé pour le demandeur, charges échappées, statut answered, audit response_sent.
- [MQ-03] Reformulation IA : suggestion appliquée avec toast « relisez-la » ; panne IA (ai=error) → 500 avec message générique.
- [MQ-04] Réponse + publication avec charges XSS : /questions-anesthesie (edge) affiche le texte inerte, 0 dialogue, 0 lien javascript:, aucune donnée privée exposée ; prénom XSS échappé dans l'email.
- [MQ-05] Retrait de publication via l'UI (confirm) → answered, champs publics vidés, réponse privée conservée, disparition immédiate de la page publique, audit « unpublished ».
- [REC-01] Candidatures : liste (3), filtre statut cohérent, candidature piégée affichée inerte.
- [REC-02] Changement de statut → base mise à jour + audit status_update + toast.
- [REC-03] Bouton « CV » → URL Blob signée (≈ 5 min), nouvel onglet, audit « download » ; URL signée → PDF 200, signature altérée → 403.
- [REC-04] Fiche 360° : identité, statut, chronologie, note, pièces demandées, relances suggérées.
- [REC-05] « Relancer l'analyse » avec le fixture IA → score 82 vérifié ; « Mettre à jour / reprendre l'IA » → 1 analyse traitée.
- [REC-06] Emails individuels « Proposer un échange » (fr) et « Demander un complément » (en, texte libre piégé) : capturés, échappés, mention RGPD.
- [REC-07] « Renvoyer l'invitation » espace candidat → email avec lien sur l'origine publique.
- [REC-08] Profil de matching créé (nom piégé inerte) et filtre par profil opérationnel.
- [VIV-01] Vivier : seuls les candidats consentants ; le candidat sans consentement est exclu (UI, API et export pool ciblé = 0 ligne).
- [CSV-01] Export CSV réel (BOM, ;) : =HYPERLINK, +cmd\|…, -2+3, @SUM neutralisés par apostrophe (0 cellule dangereuse), guillemets doublés, export journalisé.
- [MAIL-01] Mailing depuis le Vivier : audience recalculée côté serveur (2), confirmation explicite, envoi 2/2, contenus piégés échappés, lien de désinscription personnalisé dans chaque email, campagne et destinataires « sent », 4 relances suggérées sans envoi auto, historique inerte.
- [MAIL-02] Webhook Resend email.bounced signé → destinataire bounced, candidat supprimé (suppressed) et exclu de l'audience suivante.
- [MAIL-03] Désinscription publique (edge) uniquement après clic → consentement retiré, candidat retiré du vivier ; jeton invalide → 404 ; campagne sans audience → 400.
- [MAIL-04] Campagne avec Resend en panne : campagne et destinataire « failed », erreur journalisée, pas d'exception serveur.
- [BRIEF-01] Missions : 2 briefs listés, champs piégés inertes.
- [BRIEF-02] « Qualifier » → reviewing ; « Shortlist envoyée » → shortlist_sent.
- [BRIEF-03] Matching (Claire 50/100 avec détail), « Shortlister » → association shortlisted, « Exporter la shortlist » → CSV avec le seul profil shortlisté, export journalisé.
- [DOC-01] Documents candidats : document chiffré listé (libellé/nom piégés inertes), « Ouvrir » → PDF déchiffré en attachment, Cache-Control no-store, audit download {mfa:true} ; même route sans MFA → 403.
- [DOC-02] Revue « Valider » avec note → reviewed, reviewed_by = admin, audit « reviewed », toast.
- [CT-01] Messages : liste, bouton « Lu » → read=1, toast.
- [GDPR-01] RGPD : « En cours » → in_progress, « Traité » → completed avec response_date.
- [SEC-01] Onglet Sécurité : 75 derniers événements, compteur des événements élevés, aucune IP ni email affichés.
- [OV-01] Vue d'ensemble : compteurs et revenus (450.00 €) identiques au calcul en base ; panneau recrutement cohérent.
- [DRIVE-01] Connexion Drive (admin MFA, OAuth simulé) → connected=true, 3 CV exportés par le cron, « Google Drive connecté » et lien « Ouvrir le CV dans Drive » (noopener noreferrer).
- [DRIVE-02] Panne Drive (drive=error) puis « Relancer la copie » → job retry avec erreur journalisée ; après rétablissement, relance → completed et lastError effacé.
- [ERASE-01] « Effacer RGPD + preuve » : confirmation, ligne cv_applications supprimée, audit « erase » avec empreinte SHA-256 de la clé (sans clé brute), nouvelle URL de CV → 404.
- [MOB-01] Admin à 375 px (viewport 375×812, via edge) : 13 onglets via le sélecteur mobile, aucun débordement horizontal (scrollWidth = 375 partout, y compris éléments dépliés), 0 pageError, 0 violation CSP.
- [HDR-01] /admin : CSP frame-ancestors 'self', form-action 'self', object-src 'none', Referrer-Policy stricte, X-Robots-Tag noindex via edge ; API admin via edge en Cache-Control no-store.
- [TZ-01] Navigateur en fuseau America/Toronto : réservations affichées en heure de Paris, agenda « Fuseau Europe/Paris ».

</details>

<details><summary><b>Site public</b> — 42 vérifications</summary>

- [HTTP edge] 26 routes publiques servies via l'émulateur edge (vercel.json) : HTTP 200, <title>, meta description, robots et canonical présents dans le HTML pré-rendu pour /, les 6 /venture/<slug>, /legal, /gdpr, /testimonials, /booking, /recruitment, /recruitment/standard, /recruitment/vvip-offshore, /vvip-offshore, /employers, /why-hippocampus, /faq, /search, /resources, /press, /questions-anesthesie, /error, /maintenance (exécuté : curl, public/http/*)
- [HTTP edge] /vvip-offshore (alias) a un canonical vers /recruitment/vvip-offshore ; /search, /error et /maintenance sont en noindex (exécuté)
- [HTTP Express] URL inconnues (/does-not-exist, /404, /venture/unknown-slug) : 404 + noindex côté Express (exécuté ; le 200 renvoyé par l'edge figure déjà dans les constats initiaux)
- [Desktop 1440x900 sombre] 27 routes rendues via l'edge : 0 pageerror, 0 requête HTTP >= 400, 0 image cassée (naturalWidth 0) ou en attente après défilement complet, y compris les photos d'équipe et logos locaux des 6 /venture/* (exécuté, runs/desk-dark.json)
- [Desktop 1440x900 sombre] aucun débordement horizontal (scrollWidth <= innerWidth) sur les 27 routes (exécuté)
- [Console] aucune erreur console applicative ni violation CSP. La seule erreur vue en desktop (connect-src vers fonts.googleapis.com, « Couldn't load preload assets ») vient du préchargement CSSOM d'axe-core injecté pour l'audit et disparaît sans axe (exécuté : dbg-xhr.mjs, initiateur = feuille de style chargée par le parseur)
- [Contenu FR] aucun texte lorem/ipsum/TODO/FIXME/undefined/NaN/null/[object Object]/{{ }} ni clé de traduction brute visible sur les 27 routes ; idem en EN/DE/ZH et en thème clair (exécuté, regex sur innerText)
- [Contacts] téléphone affiché identique partout (+33 9 72 15 24 13, tel:+33972152413) et email executive.office@drahmedbenlallahom.com identique dans le footer et la section contact des 20 pages qui les affichent (exécuté)
- [axe-core desktop sombre] 0 violation « critical » sur 27 routes (exécuté)
- [Mobile 375x812 sombre] 27 routes : 0 erreur console, 0 pageerror, 0 violation CSP, 0 requête >= 400, 0 image cassée, aucun débordement horizontal de page (exécuté, runs/mob-dark.json)
- [Desktop 1440x900 clair] 27 routes : 0 pageerror, 0 image cassée, aucun débordement horizontal (exécuté, runs/desk-light.json)
- [Mobile 375x812 clair] 27 routes : 0 erreur, 0 image cassée, aucun débordement horizontal (exécuté, runs/mob-light.json)
- [Mobile 375 lisibilité renforcée + OLED] 27 routes : 0 erreur, 0 image cassée, aucun débordement horizontal de page (exécuté, runs/mob-hr-oled.json)
- [Liens internes] 31 cibles internes (toutes les href rendues + /booking, /gdpr, /why-hippocampus, /candidate/access, /booking/confirmation, /recruitment/unsubscribe) : 200 sur l'edge et sur Express, aucune n'affiche la page introuvable ; les ancres /#contact, /#education, /#experience, /#services existent et la section défile à l'écran (exécuté, runs/linkcheck.json)
- [Liens externes] 16 liens externes relevés (9 LinkedIn, wa.me, laskacorp.com, octopustalent.io, sawayou.com, vercel.com/legal, who.int, has-sante.fr, ecdc.europa.eu) : aucun lien vide, vers example.com, twitter.com nu ou placeholder (exécuté ; non ouverts faute de réseau)
- [Images /venture/*] photos d'équipe et logos locaux (PR #65) tous chargés (naturalWidth > 0), en desktop et mobile, en thème sombre et clair (exécuté)
- [Langues] 4 langues proposées (FR, EN, DE, ZH) : 27 routes rendues dans chaque langue en desktop (EN/DE/ZH) et en mobile 375 (DE/ZH), titres traduits, 0 erreur console ou pageerror, 0 image cassée, aucun débordement horizontal, y compris en allemand et en chinois sur mobile (exécuté)
- [Sélecteur de langue] menu à 4 entrées ; chaque choix recharge la page dans la langue et met à jour <html lang>, le libellé FR/EN/DE/ZH, le titre et le h1 ; le choix est mémorisé sur les autres pages (exécuté, /faq puis /press)
- [Sélecteur de langue au clavier] Entrée ouvre le menu et focalise la 1re langue, Flèche bas et Fin naviguent, Échap ferme et rend le focus au bouton (exécuté)
- [Menu burger] visible à 375 px et à 1440 px (la navigation horizontale n'apparaît qu'à partir de 1536 px) ; 11 entrées, menu entièrement visible, aria-expanded=true, Échap ferme et rend le focus ; « Recrutement » mène à /recruitment ; « Contact » depuis une autre page mène à /#contact avec la section à l'écran (exécuté)
- [Navigation desktop >= 1536 px] 7 entrées : les ancres de l'accueil défilent jusqu'à leur section ; /recruitment, /employers et /questions-anesthesie OK ; le CTA « Me Contacter » depuis /faq mène à /#contact ; le logo mène à /#hero (exécuté)
- [Thème / OLED / lisibilité] le bouton OLED ajoute oled-dark et un fond quasi noir ; la lisibilité renforcée ajoute high-readability et agrandit le texte (30 → 31,9 px) ; les choix persistent après rechargement ; la bascule clair fonctionne et masque le bouton OLED en thème clair (exécuté)
- [Cookies] 1re visite : bannière role=dialog « Gestion des cookies », aucun consentement stocké, document.cookie vide ; 3 choix au même niveau (Essentiels uniquement, Personnaliser, Accepter tous, 44 px de haut chacun) + Fermer (exécuté, mobile 375)
- [Cookies] « Essentiels uniquement » : consentement {performance:false, preferences:false} stocké, bannière masquée, bouton « Préférences cookies » affiché ; choix conservé après rechargement et sur /faq (exécuté)
- [Cookies] fermeture par la croix sans choix : rien n'est stocké et la bannière revient au rechargement, donc pas de consentement implicite (exécuté)
- [Cookies] fenêtre Préférences : Essentiels cochée et désactivée, Performance et Préférence décochées par défaut ; Échap ferme et rend le focus au bouton (exécuté)
- [Analytics] build dédié avec VITE_ANALYTICS_ENDPOINT défini : aucun script ni requête d'analyse avant le choix, ni après « Essentiels uniquement » (rechargement compris) ; script ajouté seulement après « Accepter tous » ou « Personnaliser » + Performance ; retrait du consentement → balise script retirée (exécuté, runs/cookies.json)
- [Clavier] le lien d'évitement est le 1er élément tabulable et il est visible au focus sur les 7 pages testées ; il déplace le focus sur <main> sur /, /faq, /legal, /questions-anesthesie et /venture/octopus-talent ; indicateur de focus visible vérifié en capture (carte entreprise, boutons d'en-tête, filtres de témoignages) (exécuté)
- [WhatsApp] bouton flottant sur toutes les pages : wa.me/33972152413 (même numéro que le téléphone affiché), message prérempli traduit, target=_blank rel=noopener noreferrer, aria-label, 56x56 px ; à 375 px, ni lui ni « Préférences cookies » ne recouvrent les boutons d'envoi des formulaires (/, /booking, /recruitment/standard, /questions-anesthesie, /gdpr) (exécuté)
- [Recherche] champ en autofocus, recherche à la frappe, ?q= repris ; « consultation » → /booking, « recrutement » → /recruitment, /employers, /why-hippocampus, « RGPD » → /gdpr, « offshore » → /recruitment/vvip-offshore ; insensible aux accents ; message clair quand il n'y a aucun résultat (exécuté, runs/search.json)
- [FAQ] 6 questions en accordéon : aria-expanded passe de false à true au clic et à Entrée, réponses non vides ; tarifs (100 €, 150 € de 18 h à 8 h, 30 min) et numéro d'urgence 112 cohérents avec /booking (exécuté, runs/faq.json)
- [Formulaire contact] (accueil, mobile 375) champs requis bloqués nativement à vide, consentement RGPD obligatoire ; envoi avec Turnstile simulé → écran « Message envoyé ! », toast, ligne contact_messages (gdpr_consent=1) et email au propriétaire ; HTML injecté (<img onerror>, <b>) échappé dans l'email, accents et emoji conservés (exécuté, mail #4)
- [Formulaire contact] Turnstile rejeté côté serveur : ni enregistrement ni email, formulaire et saisie conservés ; widget Turnstile en erreur dans le navigateur : alerte, bouton Envoyer désactivé et bouton Réessayer (exécuté)
- [Anti-abus contact] 5 envois acceptés, puis 429 « Veuillez patienter avant de soumettre une nouvelle demande. » au 6e pour la même IP et le même email (exécuté, tRPC contact.submit)
- [Formulaire RGPD] (/gdpr, mobile) 5 types de demande ; envoi → « Demande reçue ! … dans les 30 jours », ligne gdpr_requests (deletion, pending), email au propriétaire avec HTML échappé (exécuté, mail #6)
- [Formulaire questions santé] (/questions-anesthesie, mobile) envoi à vide → message d'erreur et 8 champs aria-invalid ; envoi complet → référence QMED-… affichée, ligne medical_questions status=submitted avec les consentements ; la question-réponse publiée du seed est affichée, la question en attente ne l'est pas (exécuté)
- [Témoignages] /testimonials et la section de l'accueil n'affichent que les avis approuvés de la langue courante ; l'avis en attente n'apparaît pas ; filtres 5 étoiles / 4 et plus fonctionnels ; état vide traduit en DE (exécuté)
- [axe mobile 375 sombre] 15 pages principales : 0 violation critical et 1 seule serious (contraste de la date sur /testimonials, déjà listé) (exécuté)
- [axe desktop OLED + lisibilité renforcée] 15 pages principales : 0 critical, les mêmes 2 serious isolées qu'en mode standard ; 0 débordement, 0 image cassée, 0 pageerror (exécuté)
- [SEO, non-régression] viewport sans maximum-scale, donc zoom autorisé (P1-4 toujours corrigé) ; 108 blocs JSON-LD valides sur 27 pages, worksFor = /venture/hippocampus-consulting, plus de sameAs Twitter vide ni de twitter:site (P1-5 toujours corrigé) (exécuté)
- [Pages /error, /maintenance, 404] « Retour à l'accueil » → / ; « Page précédente » de la 404 → page d'origine (/faq) ; boutons « Réessayer » et « Actualiser la page » présents (exécuté)
- [Champs de formulaire] aucun placeholder d'exemple suspect (example.com, faux email, lorem) sur 9 pages en FR et EN (exécuté)

</details>

<details><summary><b>Performance, SEO & exploitation</b> — 27 vérifications</summary>

- tsc --noEmit (copie de l'app, 095cdba, tsBuildInfo hors node_modules) : 0 erreur, exit 0, 24 s
- Vitest test:ci (env factice de la CI) : 211 fichiers, 584 tests réussis, 2 ignorés (resend.test.ts et turnstileSecret.test.ts, qui utilisent des clés externes réelles), 0 échec, exit 0, 44 s
- server/googleDriveExport.test.ts (exclu de test:ci) exécuté hors ligne : 5/5 réussis ; l'exclure de la CI n'est pas nécessaire
- Perf mobile (375 px, CPU x4, Slow 4G) et desktop mesurées sur /, /booking, /recruitment/standard et /venture/hippocampus-consulting : CLS = 0 sur toutes les pages et tous les passages (3x2x4), aucune erreur console, aucune requête externe imprévue
- Composition du bundle : AdminDashboard (232 Ko), recharts, mermaid/streamdown/katex et framer-motion absents des pages publiques mesurées (aucun chunk admin chargé sur les 4 pages ; recharts, mermaid, streamdown et framer-motion absents de tout le build client)
- Desktop (40 ms RTT, 10 Mbit/s) : LCP 0,78-0,99 s, FCP 0,40-0,51 s, TBT <= 28 ms sur les 4 pages (seuils Google « bons »)
- Budget de performance du dépôt (scripts/check-performance-budgets.mjs) sur le build 095cdba : respecté (entrée 152,6 KiB gzip <= 160 ; admin 48,0 <= 60 ; routes publiques <= 20,0 <= 30), mais avec une marge de 7,4 KiB seulement, et la CI n'exécute pas ce script
- Assets statiques (images) : 20 fichiers, ~180 Ko au total, tous référencés par le bundle ; photos d'équipe en WebP 320x320 (7-14 Ko) affichées à 92 px (DPR 2 = 184 px) : dimensionnement correct, aucun gros asset inutilisé
- SEO : 27 fichiers HTML pré-rendus dans dist/public ; titres, descriptions et canoniques uniques par route (seul doublon : l'alias /vvip-offshore, dont la canonique pointe correctement vers /recruitment/vvip-offshore) ; og:title, og:description, og:url et twitter:* présents ; robots « index, follow » sur les 21 routes publiques, « noindex » sur /search, /error, /maintenance, /recruitment/unsubscribe et /_spa-fallback
- SEO : JSON-LD syntaxiquement valide (JSON.parse) dans les 27 fichiers (4 blocs : Person, Organization, LocalBusiness, WebSite) ; worksFor.url corrigé vers /venture/hippocampus-consulting ; sameAs Twitter vide retiré
- SEO : sitemap.xml est du XML valide (xmllint) ; ses 19 URL répondent 200 « static » via l'émulateur edge ; aucune URL noindex ou non pré-rendue dans le sitemap ; robots.txt référence le sitemap et exclut /admin, /candidate/, /api/, /booking/confirmation et /recruitment/unsubscribe
- SEO : cleanUrls vérifié sur l'émulateur edge (/booking.html et /index.html -> 308 vers l'URL propre) ; X-Robots-Tag noindex sur /admin, /candidate/* et /api/* ; Cache-Control no-store sur /api/*
- SEO : hydratation de 25 routes publiques via l'edge sans erreur console, sans erreur de page, sans violation CSP et sans réponse HTTP >= 400
- Crons : les 7 jobs GET /api/scheduled/* répondent 200 avec le Bearer CRON_SECRET (de 4 ms à 1 s avec l'IA simulée) ; 403 cron-only sans en-tête ou avec un mauvais jeton
- Résilience : avec l'hôte Clerk injoignable (connexion refusée ou sans réponse), /, /booking et /recruitment/standard s'affichent normalement (h1 et contenu complets) ; seule /admin reste vide (comportement attendu)
- Build Vercel : le api/index.js commité (figé depuis la PR #14, 392 716 o) est bien régénéré avant l'empaquetage de la fonction, vérifié dans le CLI vercel 63.1.2 (sortBuilders exécute @vercel/static-build avant @vercel/node) ; pnpm run build complet dans la copie : exit 0 en 10 s, 27 HTML pré-rendus, api/index.js de 531 731 o
- CSP de vercel.json : autorise l'instance Clerk de production (https://clerk.drahmedbenlallahom.com en script/connect/frame), Cloudflare Turnstile et Stripe ; aucune violation CSP relevée sur les 25 routes hydratées ni sur les 4 pages mesurées
- Appels API des pages publiques légers : testimonials.list 456 o (82 ms desktop), availability.getBlockedDates + getSlots 1 176 o (52 ms)
- Turnstile : le serveur vérifie le hostname renvoyé par siteverify (server/candidateTurnstile.ts, liste blanche drahmedbenlallahom.com et www.)
- Charge SQL mesurée (shim Neon) : 2 requêtes pour l'API de /booking, 1 pour l'accueil, 11 pour appointments.create, 14 pour le webhook de paiement avec envoi, 8 pour admin.stats ; paiement simulé de bout en bout OK (webhook signé, confirmation + facture)
- Empaquetage de la fonction Vercel : trace @vercel/nft 1.10.0 (version utilisée par @vercel/node 23) de api/index.js : 2 573 fichiers, 83,4 Mo (< 250 Mo) ; inclut les polices AFM de pdfkit (facture PDF), pdf.worker.mjs de pdf-parse/pdfjs-dist, mammoth, word-extractor et le binaire @napi-rs/canvas linux-x64 ; seule dépendance non résolue : @react-email/render, inutilisée (emails en HTML)
- pnpm audit --prod (095cdba) : 0 critique, 0 haute, 5 modérées (qs via express 4, multer 2.3.0, mysql2 via drizzle-orm, sprintf-js via mammoth) ; ce sont les restes déjà connus du point P2-5 de l'audit du 7/10, sans régression
- Point d'entrée Vercel réel (api/index.js, VERCEL=1) servi derrière l'émulateur edge à la place de dist/index.js : 13/13 étapes du smoke réussies (santé, témoignages, créneaux, Q&R, réservation tRPC, webhook Stripe signé -> confirmation + facture, cron avec/sans Bearer, connexion admin + MFA, réservation complète dans le navigateur jusqu'au paiement simulé et à la page de confirmation, tableau de bord admin), aucune requête sortante non simulée
- Point d'entrée Vercel réel : les 7 crons GET /api/scheduled/* -> 200 avec le Bearer ; candidatePortal.me avec la session candidate -> profil OK
- Bundle client dist/public : aucune source map publiée et aucun secret (motifs sk_live/sk_test, whsec_, clés Resend, URL postgres, jeton Blob, clés privées) ; seules les variables publiques NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY et VITE_TURNSTILE_SITE_KEY sont intégrées
- Stripe Checkout limité aux cartes (payment_method_types: ["card"] dans les 2 appels checkout.sessions.create) : pas de paiement asynchrone (SEPA, virement), donc l'abonnement aux seuls événements checkout.session.completed et checkout.session.expired suffit
- Emails : un seul expéditeur dans le code, « Hippocampus Consulting <recrutement@drahmedbenlallahom.com> » (server/_core/notification.ts:17, notifications.ts:30) ; Reply-To hippocampusconsultingfrance@gmail.com (recrutement) ou OWNER_NOTIFICATION_EMAIL ; adresses affichées : executive.office@ (site) et contact@ (JSON-LD) ; un seul domaine d'envoi à authentifier chez Resend

</details>

## Annexe C — Non testé dans le bac à sable (à vérifier en production)


**Réservation & paiement**

- Stripe réel non joignable : page Checkout réelle, 3DS, moyens de paiement, validation réelle de expires_at à la limite des 30 min, objets charge.* et refund.*, remboursement depuis le tableau de bord Stripe.
- Envoi réel des emails (délivrabilité, SPF/DKIM, rendu dans les clients mail) : seul le contenu HTML et PDF capturé a été vérifié.
- Runtime Vercel (api/index.js, TZ réel des fonctions supposé UTC, limites des fonctions) et déclenchement réel des crons : ils ont été appelés à la main.
- Schéma Neon de production non vérifiable (par ex. appointments.hold_expires_at n'existe que dans les migrations legacy, voir constat global SCHEMA DRIFT) : toute colonne absente casserait la réservation.
- Expiration réelle des 30 min : simulée en modifiant hold_expires_at en base, sans horloge simulée.
- Paiement réellement effectué après l'heure de début : non exécuté (paiement à 2 min du début) ; déduit de expires_at, qui dépasse l'heure de début.
- Parcours en anglais, allemand et chinois dans le navigateur : non testés ; les emails sont toujours en français d'après le code.
- Interface admin de l'agenda et des remboursements (autre espace) : seule l'API a été testée.
- Accessibilité détaillée, performances et charge.
- Délai réel entre paiement et webhook côté Stripe, et retries automatiques de Stripe après une réponse 400 ou 500.

**Juridique & conformité**

- Site de production (drahmedbenlallahom.com) et services tiers réels inaccessibles depuis le bac à sable : contenu réellement servi, cookies réellement déposés par clerk-js et Turnstile, en-têtes Vercel. Tout a été observé sur le harnais local (instance « legal », ports 4106/4107, arrêtée en fin de test, état conservé).
- Base Neon de production : impossible de vérifier si des témoignages des anciens scripts (seed-testimonials.mjs) y sont publiés, ou si des casiers judiciaires ou justificatifs de vaccination y sont déjà stockés.
- Variables d'environnement de production : OWNER_NOTIFICATION_EMAIL (valeur par défaut gmail), BUILT_IN_FORGE_API_KEY/URL (envoi réel des documents à Manus Forge ou échec), VITE_ANALYTICS_* (Umami actif ou non), non vérifiables.
- Statut juridique et professionnel, à fournir par le propriétaire : Kbis/SIREN, n° de TVA, inscription à l'Ordre et RPPS, autorisation de plein exercice (PAE), autorisation de cumul hospitalier, assurance RCP, adhésion à un médiateur, statut de micro-entreprise. Aucun de ces éléments n'est vérifiable depuis le code.
- Certification HDS de Vercel, Neon et Resend : indiquée selon nos connaissances, sans consultation de la liste ANS (pas d'accès externe) ; à vérifier.
- Contrats de sous-traitance (DPA) et garanties de transfert avec Vercel, Neon, Clerk, Resend, Stripe, Google, Manus, OpenAI et Anthropic : documents absents du dépôt.
- Compte Stripe réel : titulaire, libellé de relevé, reçus Stripe, affichage des conditions sur la vraie page Checkout. Le faux Checkout du harnais ne le reproduit pas.
- Rendu et délivrabilité réels des emails ; boîte recrutement@drahmedbenlallahom.com (existe-t-elle et reçoit-elle les réponses ?).
- Email de rappel (cron reminder, fenêtre 1-30 h) et email de remboursement admin : relus dans le code, non exécutés dans cet espace.
- Conditions de conservation et d'entraînement des fournisseurs IA réels (Manus Forge, Vercel AI Gateway en zero data retention) : non vérifiables.
- Textes de loi dans leur version en vigueur : Légifrance inaccessible. Numérotation LCEN après la loi SREN et calendrier de l'AI Act (report envisagé par l'omnibus numérique) signalés « à vérifier » ; les autres références sont citées de mémoire et doivent être confirmées par l'avocat.
- Versions EN/DE/ZH des pages juridiques : contrôlées par recherche des éléments clés, sans relecture intégrale des traductions.
- Provenance des portraits (photo retouchée ou générée par IA) et type du compte Google utilisé pour Drive et Gmail (grand public ou Workspace) : non déterminables.

**Sécurité**

- Production Vercel : impossible à joindre. Les points suivants sont déduits de la documentation et du code, pas observés : l'écrasement réel de X-Forwarded-For par Vercel, le comportement d'une fonction qui dépasse sa limite mémoire (SEC-09), la limite de 64 Mo de Neon HTTP et la limite de réponse de 4,5 Mo.
- Clerk réel (JWT, azp, handshake, attributs SameSite du cookie __session) : remplacé par un faux ; la protection CSRF du cookie Clerk est supposée d'après la documentation Clerk.
- Cohérence de la CSP avec les vrais scripts tiers (clerk-js, Stripe.js, iframe Turnstile) : ils étaient remplacés par des bouchons locaux. Le chargement d'Umami (VITE_ANALYTICS_ENDPOINT) n'a pas été construit : un hôte d'analytique externe serait bloqué par script-src s'il était configuré.
- Le volet PDF de SEC-09 a été mesuré sur la bibliothèque d'extraction seule, pas de bout en bout via le cron. Le chemin du coffre candidat (candidate-document-processing) n'a été vérifié que par lecture du code.
- Le déni de service via qs (SEC-10) n'a pas été exploité (aucune preuve de concept exécutée).
- Force brute de la MFA admin : non exécutée (verrouillerait l'instance ; le défaut LIMIT 1 est déjà connu).
- Consentement OAuth Google réel et redirect_uri de production : non testables.
- Données de production (motifs de dates bloquées déjà saisis, comptes candidats éventuellement pré-détournés) : inaccessibles.
- TLS/HSTS réels et en-têtes ajoutés par Vercel : l'émulateur edge fonctionne en HTTP.
- Le gestionnaire Vercel api/index.js n'est pas exécuté par le harnais (dist/index.js à la place).
- Antivirus réel des fichiers : absent par conception, seulement une validation structurelle.

**Recrutement & espace candidat**

- Limite Vercel de 4,5 Mo sur le corps des requêtes/réponses (CV de 4,5–5 Mo, documents de 4,5–10 Mo) : l’émulateur edge ne l’applique pas ; constat déduit de la configuration et de la documentation (CAND-06), à vérifier sur une preview Vercel.
- Délivrabilité réelle des emails (SPF/DKIM/DMARC du domaine recrutement@drahmedbenlallahom.com, rendu Gmail/Outlook) : Resend est simulé, seul le HTML capturé a été inspecté.
- Comportement réel de Resend face à une clé d’idempotence réutilisée avec un contenu différent (cas « candidature en doublon ») : le faux Resend rejoue le premier envoi ; Resend réel peut renvoyer 409.
- Qualité réelle de l’analyse IA des CV et des documents (LLM simulé : réponses déterministes) ; OCR des images non évalué.
- Export Google Drive réel (consentement OAuth, droits du dossier, suppression) : API Google simulée.
- Turnstile réel (défis interactifs, faux positifs sur mobile/VPN) : widget et siteverify simulés.
- Usurpation d’IP via X-Forwarded-For en production : les limites candidat lisent la première valeur de X-Forwarded-For ; Vercel indique écraser cet en-tête, non vérifiable ici.
- Schéma de production Neon : les tests tournent sur schema.ts appliqué à PostgreSQL 16 ; colonnes candidat (candidate_accounts.status, candidate_documents.*) non comparées à la production.
- Planification réelle des crons Vercel (exécution quotidienne, plan Hobby/Pro) : crons appelés à la main.
- Antivirus : aucun scanner n’existe dans l’application (malware_scan_status = unavailable) ; seules les validations structurelles ont été testées.
- Expiration naturelle de la session candidate de 7 jours (pas d’horloge simulée) ; l’expiration du lien d’invitation de 30 min a été observée sur un vrai lien et simulée avec un jeton signé par le secret de test.
- Note d’environnement : instance « candidate » lancée sur les ports 4130 (Express) / 4131 (edge, --origin-edge) au lieu de 4103, car l’instance « booking » d’un autre testeur utilisait déjà 4103 comme port edge ; base, état et emails restent isolés (base « candidate »). Instance arrêtée en fin de test (down.sh, données conservées pour post-mortem). Scripts : launch-audit/candidate/*.mjs ; captures : launch-audit/screens/candidate/.

**Back-office admin**

- Clerk réel non testé (faux Clerk du harnais) : JWT, handshake, gestion et expiration des sessions, déconnexion Clerk, et configuration des facteurs de connexion du compte propriétaire (voir ADM-MFA-03).
- Expiration naturelle de la session MFA de 8 h non attendue. Seule l'expiration du défi (code) a été testée, en forçant la date en base.
- Stripe, Resend, Google et l'IA sont simulés. Ne sont donc pas testés : vrais remboursements, délivrabilité et rendu des emails dans les clients mail, limite de débit Resend sur une campagne de 200 destinataires (risque déduit dans ADM-MAIL-01), écran de consentement Google, droits réels sur le dossier Drive (impact exact de ADM-DRIVE-02), qualité réelle des analyses IA.
- Comportement Vercel non reproduit : maxDuration 60 s sur l'envoi de campagnes, cache CDN, fonction api/index.js. L'émulateur edge est une approximation.
- Schéma Neon de production non vérifiable : tous les tests tournent sur schema.ts généré vers PostgreSQL 16.
- Procédures sans interface, couvertes seulement par la matrice d'accès (refus anonyme, non-admin et sans MFA) et pas fonctionnellement : admin.blog.* (onglet absent), admin.recruitment.offerTemplates.*, followUps.update, candidate.markResponse, profiles.delete, confirmationEmail.retry.
- Boutons « Refuser », « Archiver » et « Relancer l'IA » de l'onglet Documents candidats non cliqués : seul « Valider » a été exercé.
- Admin en anglais, allemand et chinois non parcouru : seule l'interface française a été testée.
- Mobile testé avec Chromium en viewport 375×812, sans émulation tactile ni appareil réel (iOS Safari non testé).
- Run medical2.mjs interrompu à la toute fin (mauvais nom de colonne dans ma requête d'audit) : les actions ont eu lieu et les résultats ont été reconstitués et revérifiés avec medical3.mjs (base, emails et page publique). Pas d'impact sur les constats.

**Site public**

- Production (drahmedbenlallahom.com) et vrais services tiers injoignables : tous les constats dynamiques viennent du harnais local (edge émulé, Express, services simulés). CDN Vercel réel, compression et cache non vérifiés. Le 200 de l'edge sur les URL inconnues (soft 404) figure déjà dans les constats initiaux et n'est pas répété ici.
- Liens externes (LinkedIn, wa.me, laskacorp.com, sawayou.com, octopustalent.io, who.int, has-sante.fr, ecdc.europa.eu, vercel.com) : relevés mais pas ouverts, faute de réseau. Le bouton WhatsApp n'a pas été essayé sur un vrai téléphone.
- Vrai widget Cloudflare Turnstile (défi interactif, réutilisation d'un jeton déjà consommé) : le faux accepte tout jeton qui ne commence pas par « fail ». Le comportement après un premier envoi échoué en production est seulement déduit du code.
- Vrai Clerk : les cookies posés aux visiteurs anonymes en production ne sont pas observables (clerk-js simulé).
- Polices Google bloquées par le harnais : le rendu réel de DM Sans et Playfair Display n'apparaît pas dans les captures (polices système).
- Emails : ni délivrabilité ni rendu dans de vrais clients de messagerie (Resend simulé). Seul le HTML capturé a été inspecté.
- Navigateurs autres que Chromium 141 non testés (Safari iOS/WebKit, Firefox). Le 375x812 est un viewport Chromium avec un UA iPhone.
- Lecteurs d'écran réels (NVDA, VoiceOver) non testés : uniquement axe-core et parcours clavier.
- Contenu réel de production (témoignages, questions publiées) non consulté : seules les données de test du seed étaient présentes.
- Performance (Core Web Vitals, poids des bundles sur réseau mobile) non mesurée.
- Variables d'environnement de production inconnues (VITE_ANALYTICS_*, vraies clés Turnstile et Clerk) : la mesure d'audience n'a été testée qu'avec un build local dédié (public/build-analytics, servi temporairement sur le port 4123 puis arrêté).

**Performance, SEO & exploitation**

- TTFB et performances réelles du CDN Vercel (cache edge, TLS, HTTP/3, compression réelle, région) : la production est injoignable ; mesures faites via l'émulateur edge et un proxy local HTTP/2 + brotli (qualité 9). Le TTFB local de 12-21 ms n'est pas représentatif ; sous émulation réseau, la Navigation Timing donne un TTFB faux (17 ms) et le temps CDP du document (591 ms) reflète la latence émulée
- Coût réel des polices Google Fonts, de l'iframe Cloudflare Turnstile et des appels FAPI Clerk : hôtes externes bloqués (bouchons) ; seul le JS Clerk réel (paquets npm 6.39.0 / ui 1.40.0 servis localement) a été mesuré
- Correspondance des URL de polices préchargées (dmsans/v15, playfairdisplay/v37) avec la CSS Google actuelle : non vérifiable sans accès à fonts.googleapis.com
- INP, interactions réelles et Core Web Vitals terrain (CrUX) : seuls des chargements à froid en laboratoire ont été mesurés, sans défilement ni interaction (CLS mesuré pendant le chargement uniquement)
- En-têtes Cache-Control réellement servis par Vercel pour /assets/* et le HTML : déduits du preset @vercel/frameworks 3.35.0 et de la documentation Vercel, non observés
- Code HTTP renvoyé par Vercel pour une URL inconnue (200 via la réécriture ou 404) : comportement de l'émulateur edge, à confirmer sur une preview
- Limite de 4,5 Mo du corps des requêtes et réponses des fonctions Vercel : non émulée par le harnais (seule l'acceptation par l'application de fichiers de 4,9 et 6 Mo a été observée)
- maxDuration 60 s : non émulé ; le dépassement est démontré par la durée mesurée (61,2 s) avec une latence IA injectée de 12 s, pas par une coupure réelle
- Runtime @vercel/node réel (helpers req/res, corps de requête mis en tampon, lecture du corps brut pour la signature du webhook Stripe) : api/index.js a été exécuté avec VERCEL=1 derrière un simple http.createServer, sans les helpers de Vercel ; un paiement test sur une preview reste nécessaire
- Temps de démarrage à froid sur l'infrastructure Vercel (CPU, Fluid compute) et démarrage à froid de Neon : seul le temps d'import local du bundle a été mesuré
- Plan Vercel, région des fonctions, crons visibles dans Settings > Cron Jobs, journaux et Log Drains : pas d'accès au compte Vercel
- Variables d'environnement réellement définies en production : pas d'accès (check-list fournie dans OPS-01 à la place)
- DNS (SPF, DKIM, DMARC, CNAME Clerk), domaine vérifié chez Resend, existence de la boîte recrutement@ : non vérifiables (aucune requête DNS ou HTTP vers l'extérieur)
- Configuration Stripe live (endpoint webhook, événements abonnés, reçus, libellé, Stripe Tax), instance Clerk de production, écran de consentement Google OAuth, hôtes Turnstile : comptes tiers inaccessibles
- Sauvegardes et PITR Neon, plan Neon, démarrages à froid et correspondance du schéma de production avec schema.ts : base de production inaccessible
- Validateurs externes (Google Rich Results Test, LinkedIn Post Inspector, débogueur de partage Facebook) : réseau fermé ; JSON-LD vérifié seulement syntaxiquement
- Rendu par Googlebot et inspection d'URL dans la Search Console : simulés en bloquant /api/* dans Chromium (comme le ferait un robot qui respecte robots.txt), pas avec le vrai robot
- Rendu réel des emails dans Gmail, Outlook et Apple Mail (logo SVG) : pas de vrai client de messagerie ; constat fondé sur le HTML capturé et le comportement connu de ces clients
- Tests exclus de la CI : server/testimonials.test.ts (exige une base MySQL via mysql2) et server/googleDriveOAuthCredentials.test.ts (appelle le vrai oauth2.googleapis.com) non exécutés, par règle et faute de MySQL ; googleDriveExport.test.ts exécuté (5/5)
- Tests marqués « skip » dans la suite : resend.test.ts (clé Resend réelle) et turnstileSecret.test.ts (Siteverify réel) non exécutés car ils contactent des services réels
