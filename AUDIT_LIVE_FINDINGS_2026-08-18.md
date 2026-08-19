# Constats visuels vérifiables — Audit public

Les constatations ci-dessous proviennent des captures du serveur de prévisualisation réalisées le 18 août 2026 sur les parcours publics.

| Priorité | Parcours | Constat vérifié | Impact | Correction proposée |
|---|---|---|---|---|
| P0 | `/why-hippocampus` | La route affiche la page 404 au lieu de la présentation employeurs. | Perte directe d’un parcours de conversion B2B. | Restaurer et enregistrer la route avec son composant, puis ajouter un test de route. |
| P1 | `/recruitment` | La carte VVIP mentionne encore « résidences de prestige ». | Incohérence avec la demande de suppression de ce positionnement. | Remplacer par une formulation neutre portant sur environnements critiques, industriels et offshore. |
| P1 | `/recruitment/standard` | Les langues professionnelles affichées restent sous forme de texte et non de cases à cocher sur la version examinée. | Écart avec le besoin de sélection structurée des langues. | Vérifier le composant réellement routé, le redéployer puis couvrir le contrôle par test. |
| P1 | `/booking` | Le contrôle date/heure affiche le format système `mm/dd/yyyy` alors que le site est en français. | Risque de confusion et d’erreur de réservation. | Remplacer par un sélecteur localisé FR ou un libellé de format explicite. |
| P2 | `/candidate/access` | Le parcours de connexion est lisible et le message sur l’accès privé est clair. | Aucun défaut bloquant visible. | Compléter le test après inscription : activation email, Turnstile et coffre. |

> Cette note couvre seulement les constats directement visibles. Les tests métier, sécurité, APIs, tâches planifiées et emails sont vérifiés séparément dans l’audit global.

## Vérifications techniques complémentaires

| Priorité | Domaine | Constat vérifié | Preuve | Recommandation |
|---|---|---|---|---|
| P0 | Parcours Employeurs | La route `/why-hippocampus` est absente de `App.tsx`, malgré l’existence de la page annoncée. | Le routeur passe de `/employers` directement à `/admin`; la capture rend 404. | Réenregistrer la route et ajouter un contrôle automatisé de toutes les routes publiques. |
| P1 | En-têtes HTTP | La production sert HSTS et `X-Content-Type-Options`, mais pas de CSP, `frame-ancestors`, `Referrer-Policy` ni `Permissions-Policy` visibles. | Réponse `HEAD` du domaine public. | Ajouter des en-têtes de défense en profondeur, après inventaire des origines nécessaires à Stripe, Resend, Turnstile et aux assets. |
| P1 | Sitemap | Le sitemap ne référence ni les pages de recrutement détaillées, ni Employeurs, ni la méthode Hippocampus. | Contrôle direct de `/sitemap.xml`. | Ajouter les pages publiques indexables au sitemap, après correction de la route de méthode. |
| P1 | SEO des sous-pages | Les métadonnées sont principalement pilotées côté React; les réponses HTML initiales des sous-pages restent celles de l’accueil dans un rendu SPA. | Le HTML servi contient les balises de la page d’accueil; `SEOHead` opère côté navigateur. | Pré-rendre les balises stratégiques côté serveur ou générer des entrées HTML par route pour les crawlers sociaux. |
| P1 | Données opérationnelles | Quatre jobs CV historiques sont en échec avec `Cannot read properties of undefined (reading '0')`; aucun job CV ou document n’est actuellement actif ou bloqué. | Agrégats de la file de jobs en base. | Conserver les gardes déjà ajoutées, afficher une action de reprise et documenter les anciens échecs. |
| P1 | Couverture des tests | La suite compte 105 tests réussis et 1 ignoré, mais aucun test intégré dédié au parcours d’activation candidat ni au dépôt chiffré/Turnstile complet. | Inventaire des fichiers `*.test.ts`. | Ajouter un test de parcours candidat avec mocks Turnstile et stockage, ainsi que des tests de régression de routes. |
| P2 | Performance | Les pages publiques se servent correctement mais les premiers temps de réponse sont de l’ordre de 2 à 6 secondes; `/recruitment/standard` a dépassé 12 secondes pendant la sonde. | Mesure HTTP depuis le domaine public. | Mesurer depuis plusieurs régions, optimiser les bundles et vérifier l’effet de démarrage à froid avant de fixer un objectif de performance. |
| Conforme | Contrôles d’accès | Les endpoints de dépôt candidat et téléchargement administratif refusent l’accès sans session; le webhook Stripe sans signature retourne 400. | Sondes HTTP non authentifiées. | Maintenir ces tests de sécurité en CI. |
| Conforme | Automatisation | Les files CV et documents ne présentent aucun job actuellement en attente, exécution ou reprise. | Requête d’état opérationnel. | Poursuivre la surveillance quotidienne et la revue des jobs en échec historiques. |

## Contrôle de suivi — 18 août 2026

| Parcours | Résultat observé | Limite de la vérification |
|---|---|---|
| `https://drahmedbenlallahom.com/candidate/access` | Après le chargement initial, l’écran de connexion candidat s’affiche correctement : identité Hippocampus, champs email et mot de passe, accès création/réinitialisation et information sur la revue humaine. | L’inscription, le Turnstile, l’activation email, le dépôt chiffré et le téléchargement nécessitent une recette contrôlée avec une adresse de test et ne sont pas exécutés sur des données réelles. |
| File post-paiement | Le job `appointment-fulfillment` est actif toutes les cinq minutes (`YDLvE8jdPEDQftt9AWzUwR`) et son premier passage contrôlé a retourné HTTP 200 le 18 août 2026 à 17:17 UTC, sans travail en attente. | Une transaction Stripe de test doit encore être réalisée manuellement selon `RECETTE_MANUELLE_STRIPE_EMAIL.md`. |
| Accès direct au coffre sans session | La route `/candidate/portal` affiche brièvement l’état de chargement puis redirige bien vers `/candidate/access` quand aucune session valide n’est présente. | Le contrôle de session s’effectue côté client après l’initialisation : le contenu de coffre ne doit pas être considéré comme autorisé tant que cette vérification n’est pas terminée. |

## Recette contrôlée du coffre candidat — 18 août 2026

| Étape | Résultat | Contrôle associé |
|---|---|---|
| Création et activation | Compte candidat de recette créé après validation Cloudflare Turnstile ; lien d’activation reçu et espace candidat ouvert. | Consentements explicites, mot de passe, activation d’email et session candidate. |
| Dépôt sécurisé | Un PDF fictif sans donnée personnelle a été déposé depuis l’espace candidat. | Mise en quarantaine, chiffrement applicatif et stockage privé. |
| Traitement asynchrone | Le worker a exécuté la file documentaire ; le fichier a été accepté, analysé, puis marqué `needs_review`. | Aucun choix automatisé : le statut final impose une revue humaine. |
| Téléchargement | Le téléchargement autorisé par la session candidate a été effectué et le PDF est lisible. | Déchiffrement côté serveur et URL de téléchargement contrôlée. |

> Le document de recette ne contient aucune donnée réelle. Son statut d’analyse confirme que l’IA sert exclusivement d’aide à la revue humaine.

## Vérification SEO de production — 18 août 2026

| Élément | Résultat publié | Contrôle effectué |
|---|---|---|
| Métadonnées des pages commerciales | Les réponses HTML initiales de `/recruitment/vvip-offshore`, `/employers` et `/why-hippocampus` servent désormais des titres, descriptions, canoniques et balises sociales propres à chaque route. | Lecture directe du HTML sur `drahmedbenlallahom.com` après publication. |
| Parcours privés | `/candidate/portal` retourne HTTP 200 avec `noindex, follow` et des métadonnées d’espace sécurisé. | Lecture directe de la réponse HTML publique, sans session candidate. |
| Routes inconnues | Une route inexistante retourne désormais HTTP 404 avec `noindex, follow`. | Sonde HTTP directe de `/route-inconnue`. |
| Sitemap | Les routes recrutement détaillées, Employeurs et méthode Hippocampus sont présentes dans le sitemap dynamique. | Contrôle de `/sitemap.xml` après publication. |

> La mise à jour améliore la visibilité des métadonnées pour les robots et aperçus sociaux sans rendre les données privées côté serveur. Le contenu des pages demeure rendu par l’application React, conformément à l’architecture actuelle.

## Contrôle de délivrabilité transactionnelle — 18 août 2026

| Élément contrôlé | Résultat | Décision opérationnelle |
|---|---|---|
| Domaine Resend | `drahmedbenlallahom.com` est vérifié, avec envoi activé depuis la région `eu-west-1`. | Aucun changement DNS requis. |
| SPF et DKIM | Les en-têtes Gmail de l’email d’activation indiquent `spf=pass` et deux signatures `dkim=pass`, dont une alignée sur `drahmedbenlallahom.com`. | L’authentification de l’expéditeur est conforme. |
| DMARC | Gmail indique `dmarc=pass`, avec une politique de surveillance `p=none`. | Conserver cette politique pendant l’observation ; ne pas passer à `quarantine` ou `reject` avant confirmation durable des envois légitimes. |
| Statut Resend | Les emails récents d’activation, de MFA et de candidatures sont marqués `delivered`. | Le classement en Spam observé est attribuable à la réputation naissante, non à un échec d’authentification. |
| Modèle candidat | Les emails d’activation et de réinitialisation rappellent désormais de vérifier les indésirables et d’ajouter l’expéditeur aux contacts. | Test unitaire ajouté au modèle transactionnel. |

> Les informations d’authentification ont été vérifiées à partir des en-têtes Gmail fournis par le propriétaire. Aucun lien d’activation n’est repris ni conservé dans cette note.

## Optimisation du chargement initial — 18 août 2026

| Mesure | Avant | Après publication | Vérification |
|---|---:|---:|---|
| HTML initial de la page d’accueil | Environ 374 Ko | Environ 6,9 Ko | Lecture directe de `drahmedbenlallahom.com` après propagation. |
| Runtime de prévisualisation dans le HTML public | Présent | Absent | Aucun marqueur `window.__MANUS_HOST_DEV__` ni collecteur de débogage dans la réponse publique. |
| Bundle JavaScript principal | Environ 672 Ko au build initial | Environ 458 Ko au build public | Sortie du build de production. |
| Prévisualisation de développement | Devait rester disponible | Fonctionnelle après redémarrage | Capture de l’accueil sur le serveur local. |

> Les outils de prévisualisation Manus sont désormais chargés uniquement en développement. Les visiteurs reçoivent un HTML public plus léger, sans modifier les routes, les parcours candidats ou la logique métier.

## Vérification du parcours de réservation — 18 août 2026

| Élément contrôlé | Résultat | Vérification |
|---|---|---|
| Date et heure | Le champ français affiche désormais `JJ/MM/AAAA · HH:MM`, indépendamment du format propre au navigateur. | Contrôle visuel desktop et mobile ; test unitaire des quatre langues. |
| Responsive | Le formulaire, le bouton de paiement et les informations tarifaires restent accessibles sur un écran mobile de 375 px. | Capture mobile en pleine page. |
| Parcours non transactionnel | La page `/booking` renvoie HTTP 200 avec le titre, la description SEO et le bundle principal accessibles. | Sonde publique sans soumettre de réservation ni déclencher de paiement. |

> Aucun paiement, aucune réservation et aucune donnée de patient n’ont été créés pendant cette vérification.

## Reprise administrée des analyses documentaires — 19 août 2026

| Élément | Mesure appliquée | Garantie de contrôle |
|---|---|---|
| Document en échec | Le tableau administratif expose une action « Relancer l’IA » pour les documents dont l’analyse est indisponible ou soumise à revue. | Le fichier existant est conservé ; aucun nouveau dépôt n’est imposé au candidat. |
| Prévention des doublons | La relance est bloquée lorsqu’un document est refusé ou qu’une analyse est déjà en cours. | Évite les files concurrentes et préserve la décision de revue humaine. |
| Traçabilité | Chaque demande de reprise est journalisée avec l’administrateur à l’origine de l’action, puis remise dans la file sécurisée. | Le parcours reste auditable au regard du RGPD. |
| Décision humaine | Une analyse relancée produit une synthèse d’aide ; elle ne valide jamais un document automatiquement. | La revue humaine reste obligatoire avant toute décision. |

> Le CV historique dont le téléchargement d’analyse avait reçu un 403 peut désormais être relancé depuis l’administration, sans suppression ni remplacement du document original.

## Cohérence multilingue VVIP — 19 août 2026

| Élément | Correction appliquée | Contrôle |
|---|---|---|
| Badge de la voie VVIP | Le badge du parcours VVIP est localisé en français, anglais, allemand et chinois. | Test complet et build de production validés. |
| Positionnement métier | Les formulations restent limitées aux plateformes pétrolières, entreprises offshore et grands groupes industriels. | Aucune référence aux résidences de prestige ne subsiste dans le hub recrutement. |

> Cette correction éditoriale ne modifie ni les champs de candidature, ni l’analyse IA, ni la logique de traitement des profils.

## Accessibilité des images publiques — 19 août 2026

| Contrôle | Résultat |
|---|---|
| Images de contenu | Les images publiques de présentation, de services, de consultation, de navigation et de blog disposent d’alternatives descriptives. |
| Visuels décoratifs | Le visuel décoratif du formulaire RGPD conserve volontairement une alternative vide afin de ne pas ajouter de bruit aux lecteurs d’écran. |

> Aucun texte alternatif manquant n’a été relevé dans les composants publics examinés.

## Navigation clavier — 19 août 2026

| Élément | Résultat |
|---|---|
| Accès direct au contenu | Un lien d’évitement « Aller au contenu principal » apparaît au focus clavier sur l’ensemble de l’application. |
| Cible accessible | Le premier élément `main` reçoit automatiquement une cible stable et devient focalisable lorsque le lien est activé. |

> Ce mécanisme réduit le nombre de tabulations nécessaires avant d’atteindre le contenu principal, sans modifier la navigation visible à la souris.

## Accès administrateur recrutement — 19 août 2026

| Contrôle | Résultat |
|---|---|
| Rôle du propriétaire | Le compte `ahmed.benlallahom@gmail.com` possède le rôle `admin`, sans modification des droits d’autres comptes. |
| Protection d’accès | La seconde vérification par code email est demandée avant l’accès aux données sensibles. |
| Sections opérationnelles | Les entrées Candidatures, Documents candidats, Sécurité, Vivier, Mailing et Missions sont visibles après validation MFA. |

> Les raccourcis Candidatures et Missions sont également disponibles depuis la vue d’ensemble administrative.

## Matching mission-candidat explicable — 19 août 2026

| Critère professionnel | Pondération maximale | Restitution |
|---|---:|---|
| Spécialité déclarée | 35 points | Affichée dans le détail du score. |
| Mobilité vers le pays de mission | 15 points | Affichée lorsqu’elle est déclarée. |
| Certifications requises | 20 points | Pondérées selon les certifications correspondantes. |
| Langues, expérience et disponibilité | 30 points | Évaluées uniquement lorsque le brief les précise. |

> Le score est limité aux informations professionnelles déclarées. Il est présenté comme une aide à la revue humaine ; le statut de shortlist reste une action explicite de l’administrateur.

## Modèles de campagnes recrutement — 19 août 2026

Les campagnes disposent désormais de quatre modèles réutilisables en français et en anglais : Europe, Canada, Moyen-Orient et offshore. La sélection d’un modèle préremplit le nom interne, l’objet et le contenu sans envoyer d’email. Les éléments entre crochets restent volontairement à compléter par l’administrateur avant confirmation, et l’audience demeure filtrée côté serveur selon le consentement marketing.

## Recette Stripe contrôlée annulée — 19 août 2026

| Étape | Résultat | Contrôle associé |
|---|---|---|
| Créneau et tarification | La saisie accessible date/heure a reconnu un créneau futur au tarif de jour de 100 €. | Le bouton de paiement ne s’active qu’après validation du créneau. |
| Redirection Stripe | Une session Stripe réelle a été créée et a affiché la prestation, le numéro de suivi et le montant de 100 €. | Aucun moyen de paiement n’a été saisi. |
| Annulation contrôlée | Le retour depuis Stripe a été effectué avant paiement. | Aucun débit réel n’a été déclenché. |
| Effets post-paiement | La réservation est restée `pending` au paiement et `cancelled` côté rendez-vous ; aucun job de confirmation ni de facture n’a été créé. | La file post-paiement ne s’exécute qu’après encaissement confirmé. |
| Cohérence de cycle de vie | Les expirations Stripe enregistrent désormais l’horodatage d’annulation tout en libérant le créneau. | Règle couverte par un test unitaire. |

> Cette recette valide la création de session et l’absence d’effet prématuré. Un encaissement réel n’a pas été exécuté.

## Réassurance publique des candidatures — 19 août 2026

| Parcours | Mesure visible | Validation |
|---|---|---|
| `/recruitment/standard` | Un encart multilingue expose la confidentialité du CV, le consentement préalable, la revue humaine obligatoire et un délai indicatif de première revue. | Rendu contrôlé sur desktop et mobile ; test de non-régression ajouté. |
| `/recruitment/vvip-offshore` | Le même niveau de réassurance est présenté avant le formulaire, en tenant compte de la confidentialité renforcée des missions. | Rendu contrôlé sur desktop et mobile ; build de production validé. |
| Positionnement VVIP | Les formulations restantes relatives à des résidences ont été supprimées du formulaire standard et de la page dédiée. Le contenu est limité aux environnements institutionnels, industriels, offshore et pétroliers. | Recherche automatisée de termes interdits dans les deux pages. |

> Les outils d’intelligence artificielle restent présentés comme une aide à l’organisation et à la revue. Aucune décision de recrutement ne peut être prise uniquement par automatisation.

## Filtres professionnels du vivier — 19 août 2026

| Critère | Comportement ajouté | Contrôle |
|---|---|---|
| Disponibilité | Recherche partielle dans la disponibilité déclarée du candidat. | Contrat tRPC borné et test unitaire. |
| Mobilité | Recherche partielle dans la mobilité déclarée et les pays ciblés. | Contrat tRPC borné et build de production validé. |
| Certifications | Recherche partielle dans les certifications déclarées et normalisées. | Contrat tRPC borné et build de production validé. |

> Ces critères s’ajoutent à la spécialité, au pays et au score IA. Le vivier reste limité aux candidats ayant consenti aux communications de recrutement et dont l’adresse n’est ni désinscrite ni supprimée des campagnes.

## Pilotage recrutement — 19 août 2026

Le tableau de bord administratif affiche désormais les volumes de CV, la part du vivier marketing éligible, les états détaillés des analyses IA, le taux de réponse aux prises de contact et l’activité de campagnes. Les indicateurs de délivrabilité séparent les distributions confirmées, différées et en erreur ou suppression. Les ratios restent descriptifs : ils ne déclenchent ni envoi automatique ni décision de recrutement.

## Délivrabilité des campagnes — 19 août 2026

L’historique Mailing présente désormais, pour chaque campagne, les distributions confirmées, les ouvertures remontées, les délais et les échecs ou suppressions. Les événements sont archivés de manière idempotente à partir du webhook Resend ; les compteurs évitent le double comptage lorsqu’un même destinataire génère plusieurs événements. Les ouvertures sont affichées comme un signal indicatif, conformément aux limites signalées par Resend. Les adresses concernées par un bounce, une plainte ou une suppression restent exclues des campagnes ultérieures.

Référence technique : [Resend — Event Types](https://resend.com/docs/webhooks/event-types) et [Resend — email.opened](https://resend.com/docs/webhooks/emails/opened).

## Fiche candidat 360° — 19 août 2026

Depuis l’onglet **Candidatures**, le bouton « Fiche 360° » ouvre une vue administrative protégée par MFA. Elle réunit la chronologie de la candidature, les actions d’administration, les campagnes et leurs états, les demandes libres de compléments, la note interne et le prochain suivi suggéré. Le texte libre demandé par l’administrateur est désormais archivé dans le journal d’audit du dossier afin de préserver la continuité du suivi, sans créer de décision automatisée.

## Matching mission–candidats paginé — 19 août 2026

La shortlist des briefs Employeurs charge désormais les candidats par pages de 25 directement depuis la base de données, avec un total et des contrôles Précédent/Suivant. Les données normalisées de certifications et de langues, ainsi que mobilité, disponibilité et expérience, sont récupérées uniquement pour la page demandée. Le score visible reste une aide à la priorisation et doit toujours être confirmé par une revue humaine.

## Normalisation des parcours candidats — vérification du 19 août 2026

La base déployée contient bien les tables relationnelles de certifications, langues et expériences candidates. À chaque analyse de CV, les lignes précédentes sont remplacées par les éléments structurés extraits ; les données d’origine et les métadonnées d’analyse restent également conservées. Aucune migration complémentaire n’est nécessaire pour ce lot.

## Information d’urgence du parcours de réservation — 19 août 2026

Une notice visible, traduite en français, anglais, allemand et chinois, rappelle au bas du formulaire que la consultation programmée ne remplace pas une prise en charge urgente. Elle oriente en cas de danger immédiat vers le 112 ou les services d’urgence locaux. Le composant dispose d’un libellé accessible et sa présence est couverte par le test de localisation de la réservation.

## Préférences cookies réversibles — 19 août 2026

Après le premier choix, un contrôle flottant « Préférences cookies » reste accessible sur les pages publiques. Il permet de modifier les cookies de performance et de préférence, tandis que les cookies essentiels restent activés. Les valeurs mémorisées sont relues de manière défensive : une valeur incomplète ou mal formée est écartée et le bandeau de choix est réaffiché.

Le contrôle reste également présent lorsque le visiteur ferme le bandeau initial sans exprimer de choix : il peut alors ouvrir les préférences et enregistrer une décision à tout moment. Ce cas est couvert par un test dédié.

## Lisibilité renforcée et mouvement réduit — 19 août 2026

La navigation propose maintenant un contrôle de lisibilité renforcée, mémorisé localement, qui augmente modérément la taille, l’interlignage, le contraste des textes secondaires et la visibilité des bordures. Le réglage reste disponible dans le menu mobile. Les styles globaux respectent également `prefers-reduced-motion` : animations, transitions décoratives, parallax et effets de chargement sont réduits ou désactivés sans masquer le contenu.

## Chargement conditionnel de l’analytique — 19 août 2026

Le script Umami n’est plus présent statiquement dans le document HTML. Il est ajouté au document uniquement après l’enregistrement d’un consentement de performance explicite, puis retiré si cette préférence est désactivée. Sans consentement, avec une valeur locale invalide ou avec le seul consentement essentiel, le chargeur reste inactif. Les tests unitaires couvrent les trois états et la compilation de production confirme l’absence de référence Umami dans le HTML généré.

## Préférences de langue et de thème — 19 août 2026

Les préférences de langue, thème et lisibilité s’appuient désormais sur des lecteurs normalisés qui rejettent les valeurs inattendues du stockage local. La suite de non-régression vérifie le cycle complet FR → EN → DE → ZH → FR, le repli sur la langue par défaut et l’acceptation exclusive des thèmes clair ou sombre. Cette logique limite les régressions d’interface dues à une donnée locale obsolète ou modifiée.

## Garde-fou de longueur multilingue — 19 août 2026

Les libellés critiques de navigation et l’appel à l’action de réservation sont maintenant contrôlés automatiquement en français, anglais, allemand et chinois. Le test signale toute chaîne qui excède l’enveloppe prévue pour ces contrôles et protège ainsi les zones de navigation les plus contraintes. Il ne remplace pas la vérification visuelle des contenus longs ; celle-ci demeure listée comme revue responsive globale.

## Navigation clavier — 19 août 2026

Le sélecteur de langue dirige le focus vers son premier choix lors de l’ouverture ; les flèches, Accueil et Fin déplacent le focus dans les quatre langues. La touche Échap ferme le sélecteur ou le menu mobile et restitue le focus au contrôle qui l’a ouvert. Les comportements de déplacement et de fermeture sont isolés dans un test unitaire dédié.

## Sobriété de mouvement en économie de données — 19 août 2026

Lorsque le navigateur expose une préférence `saveData`, la page applique la classe `data-saver` et neutralise les animations, transitions, parallax et décalages décoratifs. La préférence est réévaluée lorsque la connexion évolue et n’interfère pas avec les navigateurs qui ne proposent pas cette information. Le comportement est couvert par un test unitaire ; les règles système `prefers-reduced-motion` restent inchangées et complémentaires.

## Bandeau cookies — lisibilité et focus — 19 août 2026

Le bandeau de consentement utilise désormais un fond quasi opaque, une séparation cyan discrète et une ombre renforcée afin de rester lisible sur les visuels sombres et clairs. Le lien de confidentialité et le bouton de fermeture disposent d’un indicateur de focus explicite. La vérification visuelle sur le thème sombre, la suite complète et le build de production sont conformes.

## Thème sombre OLED — 19 août 2026

Un contrôle OLED apparaît lorsque le thème sombre est actif, sur desktop comme dans la navigation mobile. Il enregistre le choix localement et remplace les fonds et surfaces bleu nuit par des noirs plus profonds, tout en préservant les couleurs de texte, les contrastes et l’accent cyan. La préférence est désactivée par défaut et sa lecture défensive est couverte par un test unitaire.

## Tableau de bord mobile — première adaptation — 19 août 2026

Sur mobile, la rangée d’onglets horizontale de l’administration est remplacée par un sélecteur natif compact et accessible. Il expose la section courante, conserve l’ensemble des onglets et évite la navigation horizontale imprécise. Les onglets horizontaux restent disponibles à partir du format tablette ; les marges verticales du contenu sont également réduites sur téléphone.

> Cette première adaptation concerne la navigation. Les cartes, formulaires, listes et actions des onglets administratifs font l’objet d’un lot mobile complémentaire avant de considérer l’ergonomie complète comme finalisée.

Le lot complémentaire empile désormais les actions des Réservations, Messages et demandes RGPD, augmente leur zone tactile sur mobile, replie les formulaires et cartes Blog, puis adapte Créneaux et Dates bloquées. Les tests de non-régression vérifient la présence du sélecteur compact et des classes d’empilement. La recette visuelle des contenus protégés après MFA reste à exécuter dans une session administrateur active.

## Parcours d’erreur et maintenance — 19 août 2026

Les routes publiques `/error` et `/maintenance` affichent des états cohérents avec l’identité ABL / Hippocampus en français, anglais, allemand et chinois. Elles ne révèlent ni pile d’exécution ni détail technique, proposent un retour à l’accueil et une nouvelle tentative, et sont exclues de l’indexation. Le fallback global côté navigateur a été aligné : les traces techniques ne sont plus affichées au visiteur.

## FAQ publique — 19 août 2026

La route `/faq`, accessible depuis le footer, regroupe les informations pratiques sur la consultation, le paiement, l’annulation, les urgences et le parcours Hippocampus Consulting dans les quatre langues. La page utilise un accordéon clavier accessible et rappelle explicitement qu’elle ne fournit ni avis médical personnalisé ni accès aux urgences. Le volet recrutement précise que l’analyse assistée organise les dossiers, tandis que toute décision reste soumise à une revue humaine.
