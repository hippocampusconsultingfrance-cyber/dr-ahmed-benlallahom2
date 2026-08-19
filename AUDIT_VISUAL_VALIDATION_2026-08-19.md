# Validation visuelle — 19 août 2026

## Périmètre contrôlé

Les parcours publics critiques ont été vérifiés sur la prévisualisation active en vue complète, sur bureau (1280 × 720) puis mobile (375 × 812) : accueil, réservation, demande RGPD, hub recrutement, brief employeur, accès candidat, FAQ et méthode employeurs.

## Constats confirmés

Les huit pages se chargent sans écran vide ni erreur de rendu. Les titres, formulaires, cartes, appels à l’action, alertes d’urgence, pied de page et navigation conservent une hiérarchie lisible dans les deux formats testés. Aucun débordement horizontal visible n’a été observé sur les parcours contrôlés. L’accès candidat valide est `/candidate/access` ; l’URL raccourcie `/candidate-access` n’est pas une route du produit et conduit volontairement à la page 404.

Le même contrôle a été répété au format tablette (768 × 1024). Les formulaires de réservation, RGPD et brief employeur restent lisibles et conservent des actions atteignables ; le hub recrutement, la FAQ, la méthode employeurs et l’accès candidat adaptent leur contenu sans chevauchement visible.

La réservation conserve des champs accessibles, des informations tarifaires jour/nuit et un avertissement d’urgence. Les formulaires RGPD et employeurs présentent des libellés et contrôles visuellement distincts. Les pages recrutement, FAQ et méthode employeurs adaptent leurs cartes en pile sur mobile sans chevauchement visible.

## Limites de ce contrôle

Cette vérification porte sur le rendu et le chargement. Les tests de clavier, lecteur d’écran, contrastes instrumentés, zoom à 200 % et les quatre traductions restent des contrôles complémentaires à exécuter séparément.

## Vérification sur le domaine publié

Le 19 août 2026, la page `https://drahmedbenlallahom.com/booking` a été contrôlée après la publication. Après le chargement différé normal, le formulaire de réservation est visible avec ses libellés associés pour le nom, l’email et le téléphone ; la tarification jour/nuit, l’avertissement d’urgence et les informations de paiement sont également présents. Aucun écran d’erreur ni absence de contenu n’a été constaté.

## Alternatives textuelles des images

Un contrôle du code recense les balises image des composants et pages concernés. Chaque image porte désormais une politique explicite : texte alternatif contextuel pour les visuels informatifs (portrait, logo, illustration de service, contenu de venture) ou alternative vide uniquement pour l’illustration strictement décorative du formulaire RGPD. Un test de non-régression empêche l’ajout d’une balise image sans attribut `alt`.

## Navigation clavier et libellés accessibles

Le sélecteur de langue conserve le focus, prend en charge les flèches, Accueil et Fin, puis se ferme par Échap ; le menu mobile se ferme également par Échap et restitue le focus à son déclencheur. Les libellés accessibles de la navigation — accueil, menu principal, recherche, changement de langue, thèmes et menu mobile — sont maintenant définis en français, anglais, allemand et chinois, avec test de couverture des quatre langues.

Les composants interactifs restants ont été cartographiés. Le carrousel de témoignages prend en charge les flèches, Accueil et Fin ; les dialogues de confirmation et administratifs s’appuient sur les composants de dialogue accessibles de la bibliothèque d’interface ; la réservation emploie des champs de date et d’heure visibles, compatibles clavier, plutôt qu’un calendrier graphique custom. La fenêtre interne de préférences cookies dispose désormais d’une fermeture par Échap et restitue le focus à son déclencheur. Des tests dédiés couvrent la navigation, le carrousel et ce dernier comportement.

| Composant | Interaction clavier couverte | Preuve de non-régression |
|---|---|---|
| Menu de langue | Flèches, Accueil, Fin et Échap, avec conservation du focus. | `navigationKeyboard.test.ts` et `navigationAccessibilityCopy.test.ts`. |
| Carrousel de témoignages | Flèches gauche/droite, Accueil et Fin sur une zone focalisable. | `TestimonialsSection.test.ts`. |
| Dialogues administratifs | Le dialogue partagé intercepte Échap hors composition IME et expose une action de fermeture focalisable. | `dialogKeyboard.test.ts` vérifie le comportement hors/en composition IME, la primitive, la gestion d’Échap et la fermeture. |
| Confirmations sensibles | Les confirmations conservent un bouton Annuler dédié, atteignable au clavier ; elles ne se ferment pas implicitement pendant une décision à confirmer. | `dialogKeyboard.test.ts` vérifie le composant de confirmation et son usage Mailing. |
| Préférences cookies | Échap ferme la fenêtre et rend le focus à l’élément qui l’a ouverte. | `CookieConsent.fixedControls.test.ts`. |
| Réservation | Les champs date et heure restent des contrôles visibles et atteignables au clavier ; les états de disponibilité sont explicites. | `BookingPage.test.ts`. |

## Garde-fou de longueur multilingue

Les libellés publics compacts de navigation et de réservation sont contrôlés dans les quatre langues actives. Le garde-fou compte désormais les caractères Unicode par point de code, ce qui évite un traitement incohérent des libellés chinois. Les contrôles automatisés couvrent les liens de navigation, les CTA critiques et les libellés allemands et chinois à risque. La vérification visuelle complète des contenus très longs sur appareil réel reste documentée séparément.

## Contraste des thèmes

Les paires textuelles centrales des thèmes sombre et clair sont soumises à un seuil automatisé de contraste AA de 4,5:1 : texte principal, texte secondaire gris, texte sur primaire cyan et texte sur accent doré. Le primaire du thème clair a été légèrement assombri afin d’atteindre ce seuil avec son texte clair. Le calcul s’effectue à partir des tokens OKLCH, ce qui protège les futures modifications de palette contre une régression de lisibilité.

## Lisibilité renforcée

Le contrôle de lisibilité renforcée applique une taille de police racine de 106,25 %, une hauteur de ligne augmentée et des couleurs secondaires adaptées, tout en conservant des conteneurs flexibles pouvant rétrécir sans débordement. Son état est exposé aux technologies d’assistance, appliqué à la racine du document et mémorisé localement. Un test comportemental protège l’activation, la désactivation et la persistance de ce réglage.

## Messages de validation publics

Les formulaires Contact, RGPD, brief employeur, accès candidat et candidature VVIP disposent de retours localisés dans les quatre langues. La candidature VVIP a été corrigée afin qu’un message renvoyé par le serveur ne soit jamais affiché directement au visiteur : le détail est conservé dans la console de diagnostic et l’interface affiche uniquement son message localisé générique. Un test de non-régression protège ce comportement.

Les parcours Contact, RGPD et Réservation sont également couverts par une vérification explicite de leurs retours d’état en français, anglais, allemand et chinois : succès, erreur, consentement requis et attente lorsque le parcours l’emploie. Cette couverture vérifie que chaque message public reste présent et non vide dans les quatre langues, sans exposer les détails techniques d’un échec.

## Feedbacks visuels des parcours critiques

Le code des parcours Contact, demande RGPD, réservation et confirmation de paiement a été contrôlé. Contact et RGPD remplacent le formulaire par un panneau de confirmation lisible et annoncent aussi la réussite par un message d’état ; la réservation passe par une confirmation dédiée après le retour du paiement ; la page de confirmation distingue explicitement les états de réussite, d’annulation et d’état inconnu. Les contrôles associés ne déclenchent aucune soumission réelle et ne transmettent aucune donnée de test. Une non-régression vérifie la présence de ces contrats d’interface.

| Parcours | État de succès contrôlé | État d’erreur ou d’interruption contrôlé |
|---|---|---|
| Contact | Après succès, le formulaire devient un panneau `success-panel` avec titre, explication et action permettant un nouvel envoi. | L’échec de transmission et l’absence de consentement sont présentés par des messages localisés distincts. |
| Demande RGPD | Après succès, le formulaire devient un panneau « demande reçue » avec un retour à la saisie possible. | L’échec de transmission appelle un message localisé sans afficher le détail technique retourné par le serveur. |
| Réservation | Les états de disponibilité « sélectionner », « vérification », « indisponible » et « disponible » sont explicitement distingués avant paiement. | Les erreurs de création de réservation ou de paiement affichent le message public localisé, sans concaténer le détail technique. |
| Paiement et confirmation | Le retour `success` ouvre un état de confirmation spécifique, exclu de l’indexation. | Les retours `canceled`, absent ou inattendu produisent respectivement un état d’annulation ou un état neutre explicite, sans les présenter comme un paiement confirmé. |

Cette vérification est statique et automatisée ; elle ne soumet aucun formulaire public et ne crée aucune transaction Stripe. Le paiement de bout en bout reste un contrôle manuel distinct sur le domaine publié et avec une carte de test.

## Contrôle mobile complémentaire des parcours critiques

Une revue complémentaire à la largeur de 375 px confirme que les premières étapes des pages Réservation, RGPD, Recrutement et Employeurs restent lisibles et sans chevauchement visible. Les appels à l’action de navigation et le sélecteur de langue restent atteignables. Le bandeau de consentement est volontairement affiché dans cette session sans choix enregistré : il recouvre le bas de l’écran comme prévu, mais ne masque pas le titre, le contexte ni le début du formulaire. Sa coexistence avec la navigation mobile est déjà couverte par un test dédié.

Le contrôle flottant WhatsApp est volontairement masqué pendant l’affichage du bandeau cookies, qui reste prioritaire pour la conformité et la lisibilité. Sur mobile, le bandeau est borné en hauteur, peut défiler si nécessaire et conserve des actions de taille suffisante. Cette règle de non-chevauchement est protégée par test.

## Page Pourquoi Hippocampus

La page éditoriale publique `/why-hippocampus` présente la méthode employeurs, les zones couvertes, les garanties de confidentialité et conformité, ainsi que les parcours explicites vers le brief de mission et le recrutement. Une vérification visuelle pleine page sur bureau confirme une hiérarchie lisible, des cartes régulières et des appels à l’action distingués. La route, les quatre variantes linguistiques, les garanties, les CTA et les métadonnées de service sont protégés par une non-régression dédiée.

## États vides des espaces actifs

Les témoignages partenaires, les briefs Employeurs, l’espace Mailing et les tableaux administratifs conservent des états vides explicites, localisés ou contextualisés selon le parcours. Le composant partagé des tableaux de bord fournit une icône décorative, un titre et une explication accessibles. Les disponibilités de réservation restent couvertes par leur test de statut existant. La section Blog demeure volontairement désactivée à la demande du propriétaire ; elle n’est donc pas traitée comme un parcours actif nécessitant un état vide.

| Parcours actif | État vide ou d’absence vérifié | Couverture associée |
|---|---|---|
| Témoignages partenaires | Carte vide illustrée, icône décorative masquée aux technologies d’assistance et libellé localisé. | `TestimonialsSection.test.ts` |
| Réservation | Quatre états de disponibilité avec un repère visuel distinct : saisie, vérification, indisponible et disponible. | `BookingPage.test.ts` |
| Briefs Employeurs | Absence de brief, de correspondance ou de candidat disponible. | `ActiveEmptyStates.test.ts` |
| Mailing recrutement | Audience sélectionnée vide et historique de campagne vide. | `ActiveEmptyStates.test.ts` |
| Vivier candidats | Résultat de filtre sans candidat avec icône et message localisé. | `ActiveEmptyStates.test.ts` |
| Revue documentaire candidat | Aucun document correspondant au filtre actif. | `ActiveEmptyStates.test.ts` |
| Tableau administratif partagé | Icône, titre et explication accessibles. | `AdminStatePanel.test.tsx` |
| Blog | Hors périmètre : section et routes désactivées à la demande du propriétaire. | Suivi de désactivation existant. |

Les onglets racine restants du tableau de bord ont aussi été recensés. Les Réservations, Messages et Demandes RGPD utilisent le panneau illustré partagé ; les Témoignages, Créneaux hebdomadaires et Dates bloquées ont été alignés sur ce même composant. La Sécurité garde son état sans événement illustré et le pilotage Recrutement affiche des indicateurs à zéro explicites plutôt qu’une zone vide. La boîte Candidate 360 est un détail contextuel, non un onglet de collecte ; ses absences de notes, relances, demandes ou chronologie sont présentées à l’intérieur de sections déjà libellées.

| Onglet administratif racine | Comportement en l’absence de données | Couverture associée |
|---|---|---|
| Réservations | Panneau illustré « Aucune réservation » et agenda sans rendez-vous confirmé. | `ActiveEmptyStates.test.ts`, `appointmentsAgenda.test.ts` |
| Messages | Panneau illustré « Aucun message ». | `ActiveEmptyStates.test.ts` |
| Demandes RGPD | Panneau illustré « Aucune demande RGPD ». | `ActiveEmptyStates.test.ts` |
| Témoignages administratifs | Panneau illustré « Aucun témoignage ». | `ActiveEmptyStates.test.ts` |
| Disponibilités | Panneaux illustrés pour aucun créneau et aucune date bloquée. | `ActiveEmptyStates.test.ts` |
| Candidatures | Carte illustrée lorsqu’aucun dossier ne correspond aux filtres, avec icône décorative. | `ActiveEmptyStates.test.ts` |
| Pilotage recrutement | Compteurs non négatifs et explicites, y compris à zéro. | `ActiveEmptyStates.test.ts`, `recruitmentDashboardMetrics.test.ts` |
| Sécurité | Illustration positive lorsqu’aucun événement n’est journalisé. | `ActiveEmptyStates.test.ts`, `SecurityOperationsTab.localization.test.ts` |

## État d’erreur administratif partagé

Le titre de repli affiché par le panneau d’erreur administratif partagé est désormais défini en français, anglais, allemand et chinois. Les descriptions d’erreur restent fournies par l’onglet appelant et ne sont pas exposées dans les parcours publics. Une non-régression vérifie les quatre variantes du titre.

## Disponibilité de production

Le 19 août 2026, les routes publiques `/`, `/booking`, `/gdpr`, `/faq`, `/search`, `/error`, `/maintenance`, `/recruitment`, `/employers` et `/why-hippocampus` ont toutes répondu en HTTP 200 sur le domaine principal. L’accès `www.drahmedbenlallahom.com` redirige correctement vers `drahmedbenlallahom.com` et sert ensuite la page d’accueil en HTTP 200. Aucun écart de disponibilité n’a été observé sur cet échantillon.

## En-têtes de sécurité de production

Le domaine principal expose une politique de transport strict (HSTS), une politique de sécurité de contenu restrictive avec sources explicitement autorisées pour Stripe et Turnstile, une protection anti-intégration via `frame-ancestors 'self'`, `X-Content-Type-Options: nosniff`, une politique de référent stricte et une politique de permissions qui désactive caméra, microphone et géolocalisation. La politique de permissions autorise uniquement le paiement depuis la même origine, ce qui est cohérent avec le parcours Stripe intégré. Aucun écart exploitable n’a été observé sur les en-têtes inspectés.

## Ressources SEO et parcours sensibles

Le fichier `robots.txt` publié référence le sitemap officiel, autorise les contenus publics et exclut explicitement l’administration, les parcours candidats, les API, les confirmations de réservation, les routes Blog désactivées et la désinscription de recrutement. Le sitemap ne recense que des contenus publics éditoriaux et fonctionnels ; il ne contient ni route d’administration, ni portail candidat, ni parcours de désinscription. Aucun correctif n’a été requis lors de ce contrôle.

## Largeur réduite équivalente à un zoom élevé

Les pages d’accueil, réservation, RGPD, recrutement, brief employeur, accès candidat, FAQ et méthode employeurs ont été revues à 640 px de largeur, une contrainte comparable à un affichage zoomé sur un écran de bureau. Les titres, contrôles de formulaire, cartes, appels à l’action et pieds de page restent lisibles sans débordement horizontal visible. Ce contrôle de rendu ne remplace pas une validation manuelle au zoom natif de 200 % avec un navigateur et un lecteur d’écran.

## Journaux d’exécution

Les journaux locaux récents ne présentent ni erreur serveur, ni réponse réseau en 4xx/5xx dans l’échantillon contrôlé. Une ancienne erreur de développement relative au provider de langue est encore visible dans l’historique du navigateur, mais elle correspond à un état déjà corrigé et suivi d’un rendu public valide. La consultation des journaux du conteneur publié n’était pas disponible lors du contrôle, le service de journaux renvoyant `cloudrun service not found`; la disponibilité HTTP et les parcours publics ont donc été utilisés comme contrôle de substitution.

## Tableau de bord administratif sur mobile

À 375 px de largeur, la route administrative présente d’abord sa validation de sécurité par code à six chiffres, sans exposer de donnée candidate ou administrative avant validation. Le formulaire de sécurité est lisible, les deux actions sont atteignables et aucun débordement horizontal n’est visible. Le contrôle des onglets internes du tableau de bord nécessite une authentification administrative et une validation MFA ; il n’a pas été contourné dans le cadre de cette vérification visuelle.

## Liens et contrôles publics

Un contrôle statique des composants et pages visibles n’a trouvé aucun lien public vide, ancre vide ni ouverture de fenêtre factice. Les seules ancres `#` recensées appartiennent à une page de démonstration non routée et non exposée au public. Les liens de navigation principaux, de pied de page et les routes profondes ont déjà fait l’objet d’un contrôle de disponibilité HTTP.

## Alternative de marque localisée

L’alternative textuelle du logo du pied de page est désormais définie en français, anglais, allemand et chinois, avec une couverture automatisée. Le logo placé dans le bouton d’accueil de la navigation est explicitement décoratif : le bouton porte déjà un nom accessible localisé et ne répète donc plus l’information au lecteur d’écran.

## Couverture de validation d’accessibilité

La suite automatisée couvre le lien d’accès direct au contenu, la navigation clavier, les libellés accessibles du menu, les alternatives d’images, les préférences de cookies, les contrôles mobiles du tableau de bord, les longueurs de traduction, l’impression et les états de chargement ou d’erreur. Les vérifications de rendu ont également été réalisées sur mobile, tablette, bureau et largeur réduite.

Les contrôles qui restent intrinsèquement manuels sont la lecture effective avec NVDA, VoiceOver ou TalkBack, les contrastes mesurés selon les réglages individuels de l’écran, le zoom natif de 200 % dans chaque navigateur et la compatibilité Safari/Firefox sur les appareils concernés. Ils ne peuvent pas être établis de façon fiable par une capture statique ou un test unitaire seul.

## Pied de page partagé

Le titre visible de la colonne de contact réutilise désormais le libellé de navigation localisé au lieu d’une chaîne française codée en dur. Cette correction assure la cohérence du pied de page en anglais, allemand et chinois, avec un test de non-régression dédié.

## Conservation des CV

La tâche de rétention active ne détruit ni le fichier ni sa référence de stockage. Lorsqu’une date de conservation est dépassée, elle enregistre un rappel horodaté, crée une trace d’audit non destructive et notifie l’administrateur afin qu’il examine le dossier. La suppression ne peut être envisagée que manuellement, au titre d’une demande RGPD explicite, conformément à la règle de conservation définie pour le site.

## Cycle d’analyse asynchrone des CV

Le traitement des CV s’appuie sur une file persistante avec un statut de job distinct. À l’envoi, l’analyse est placée en attente ; le worker Heartbeat fait évoluer la candidature vers l’extraction puis l’analyse, avant une clôture en `completed`, `needs_review` ou `failed`. Les erreurs de téléchargement, extraction/OCR ou IA sont enregistrées, replanifiées avec un délai exponentiel et plafonnées à trois tentatives ; les erreurs de validation sont arrêtées immédiatement. Les tests couvrent la promotion depuis la quarantaine, les statuts de revue humaine, les délais de reprise et les échecs externes contrôlés.

## Traçabilité reproductible des analyses

Le dossier candidat conserve désormais le texte extrait séparément, le modèle réellement retenu par la chaîne de repli, la version de prompt, la méthode d’extraction, le nombre de pages, le modèle et la confiance OCR ainsi que les avertissements d’extraction. Cette trace permet de comprendre et de rejouer le contexte d’une analyse sans conserver un second fichier CV. La migration ajoutant `extracted_text` est additive et vérifiée sur la base déployée ; un test de contrat protège la persistance de ces éléments.

## Briefs Employeurs et associations mission–candidats

Le module comporte une table Drizzle `client_briefs` pour les missions employeurs et une table `client_brief_candidates` pour les associations candidates. Le tableau de bord administratif permet de consulter les briefs, de faire évoluer leur statut, de calculer un matching explicable à partir de la spécialité, des certifications, des langues, de la mobilité, de la disponibilité et du score IA, puis d’associer une candidature avec un statut de revue ou de shortlist. L’accès à ces procédures est réservé à l’administration.

## Concurrence de la file d’analyse CV

Chaque worker réclame désormais un job par une mise à jour conditionnelle des seuls états `queued` ou `retry`. Le traitement externe ne démarre que si la base confirme qu’une ligne a réellement été revendiquée. Une seconde exécution concurrente observe donc zéro ligne modifiée et ignore le job, ce qui évite une double extraction ou une double analyse du même CV. Ce comportement est couvert par un test déterministe.

## Quarantaine et validation documentaire

Les CV entrants sont placés en quarantaine avant toute analyse. La validation vérifie le MIME déclaré, l’extension, la signature binaire, la taille et l’intégrité du conteneur ; elle refuse notamment les PDF chiffrés, actifs ou trop longs ainsi que les DOCX contenant des contenus externes, macros ou objets embarqués. Les fichiers ne sont promus vers le stockage définitif qu’après validation. Un moteur antivirus dédié demeure volontairement non activé sur l’hébergement actuel, conformément à la décision de ne pas basculer vers une offre d’hébergement réservée.

## Couverture des chemins critiques de recrutement

La suite couvre les chemins de succès et d’échec du pipeline : validation de fichier, quarantaine, extraction, repli OCR, échec IA, reprise contrôlée, rétention non destructive, notifications, téléchargement, chiffrement documentaire, accès candidat et restrictions administratives. Les tests dédiés restent séparés par responsabilité afin de signaler rapidement la frontière affectée lorsqu’un fournisseur externe ou une règle métier évolue.

## Données de recrutement normalisées

Les certifications, langues et expériences extraites sont conservées à la fois dans les champs de synthèse du dossier et dans des tables relationnelles dédiées. Le matching de brief consomme les certifications et langues normalisées ; le vivier conserve les structures normalisées et les expose dans l’administration. Les filtres restent compatibles avec les données déjà déposées en utilisant également les champs de déclaration initiaux.

## Filtres du vivier administratif

Le vivier actif applique un consentement marketing positif et propose les critères requis : spécialité, pays ciblé, score IA minimal, disponibilité, mobilité et certification. Les paramètres sont bornés côté serveur et testés, tandis que l’interface les expose dans la zone de filtre. Les candidatures rejetées et archivées sont écartées de cette recherche opérationnelle.

## Tableau de bord administratif mobile

L’administration utilise désormais le sélecteur de sections sur mobile et des actions denses adaptées à la largeur réduite. Les commandes de modération des témoignages reviennent à la ligne et conservent des cibles tactiles d’au moins quarante pixels de hauteur. L’onglet Blog, devenu inactif après le retrait de la section Actualités du site, n’est plus proposé dans la navigation administrative ; le bundle de ce tableau de bord est réduit en conséquence.

## Formulaire VVIP dans les quatre langues

Le formulaire de candidature VVIP utilise désormais des options de spécialité, aides de saisie pour l’expérience et les certifications, ainsi qu’une indication de format de fichier adaptées au français, à l’anglais, à l’allemand et au chinois. L’initialisation du formulaire sélectionne l’option de spécialité correspondant à la langue active. Un test de non-régression vérifie que les contrôles visibles ne reviennent pas à des chaînes françaises codées en dur.

## Navigation accessible des pages légales

Les groupes d’onglets des mentions légales, de la confidentialité et des conditions d’utilisation disposent désormais d’un nom accessible dans la langue affichée : français, anglais, allemand ou chinois. Cette correction améliore le repérage de la navigation interne par les lecteurs d’écran, sans modifier le contenu juridique.

## Formulaire Employeurs dans les quatre langues

Les exemples de saisie du brief Employeurs sont désormais adaptés à la langue active pour le profil recherché, la zone géographique, le calendrier et les précisions de mission. Cette correction conserve les libellés explicites déjà associés aux champs tout en supprimant les dernières aides françaises visibles dans les parcours anglais, allemand et chinois.

## Contrôle responsive des pages modifiées

Les pages Employeurs, VVIP & Offshore et Mentions légales ont été contrôlées aux largeurs bureau et mobile. Les formulaires passent sur une colonne sans débordement, les appels à l’action restent atteignables et le contenu légal conserve son défilement horizontal dédié pour les onglets. Aucun chevauchement visible n’a été observé dans les parcours vérifiés.

## Disponibilité de production après les correctifs

Après la publication des derniers lots, les routes Employeurs, VVIP & Offshore et Mentions légales répondent toutes en HTTP 200 sur le domaine principal. Le sous-domaine `www` redirige bien vers le domaine canonique avant de servir la page Employeurs. La suite automatisée complète et le build de production ont également été exécutés avec succès.

## Revue administrative des documents candidats

La liste de documents du coffre candidat contenait deux rendus successifs de la même collection, ce qui pouvait doubler chaque carte affichée. Le composant a été remis en forme avec un unique parcours de données, sans modifier les actions de revue, téléchargement ou réanalyse. Un test de non-régression vérifie que chaque document n’est produit qu’une seule fois par le rendu.

La revue administrative est désormais également localisée en français, anglais, allemand et chinois : filtres, catégories, statuts, actions, retours de succès, synthèse IA et notes de revue utilisent la langue active. Les messages d’erreur détaillés restent visibles uniquement pour l’administration authentifiée, afin de faciliter le diagnostic sans exposer ces détails dans les parcours publics.

## Vivier administratif multilingue

L’espace Vivier reprend maintenant la langue active pour ses six filtres métier, les appels à l’action, les scores IA, les libellés de profil, les états de chargement et les retours d’export. Les critères transmis au serveur ne changent pas ; cette amélioration porte uniquement sur l’interface et conserve les garde-fous de consentement ainsi que la journalisation des exports.

## Illustrations originales Services et Réservation

Deux illustrations sans texte ont été intégrées comme éléments décoratifs, donc masquées aux lecteurs d’écran : une composition médicale abstraite pour les Services et un parcours lumineux pour la colonne de consultation. La réservation a été vérifiée en bureau ; l’illustration reste contenue dans sa colonne et ne concurrence pas le formulaire ni les informations de sécurité.

Le contrôle mobile confirme que le formulaire conserve la priorité de lecture et d’action. La carte de consultation, avec son illustration décorative, se place ensuite dans le flux sans débordement ni recouvrement des champs, du bouton de paiement ou de l’avertissement d’urgence.

Les illustrations médicales ajoutées sont abstraites, sans texte et utilisées uniquement comme éléments décoratifs. Leur intégration ne revendique ni guérison, ni résultat thérapeutique, ni performance médicale garantie.

### Inventaire et contrôle des visuels médicaux actifs

| Asset | Emplacement | Constat |
|---|---|---|
| `services-medical-compass_333540df.jpg` | Section Services | Composition abstraite associant stéthoscope, repère graphique et tracé cardiaque, sans texte ni acte de soin ; employée comme décor et masquée aux lecteurs d’écran. |
| `booking-care-path_b41c3403.jpg` | Colonne de consultation de la réservation | Illustration abstraite de parcours, confidentialité et identité vérifiée ; elle ne représente pas un traitement, une guérison ou un résultat médical. |
| Logos et portraits de ventures | Pages Ventures | Éléments d’identité de marque ou portraits présentés avec leur contexte professionnel ; ils ne servent pas à exprimer une promesse thérapeutique. |

Un test de non-régression inventorie les deux illustrations générées, confirme leur usage décoratif et exclut les formulations de promesse thérapeutique dans leurs composants adjacents.

L’inventaire de non-régression couvre également, asset par asset, les trois visuels de parcours, le logo de marque, les quatre logos de ventures et les onze portraits affichés dans les données Ventures. Chaque référence est liée explicitement à son ou ses fichiers source et soumise au même contrôle local de vocabulaire de promesse thérapeutique.
