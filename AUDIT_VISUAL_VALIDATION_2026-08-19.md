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

## Messages de validation publics

Les formulaires Contact, RGPD, brief employeur, accès candidat et candidature VVIP disposent de retours localisés dans les quatre langues. La candidature VVIP a été corrigée afin qu’un message renvoyé par le serveur ne soit jamais affiché directement au visiteur : le détail est conservé dans la console de diagnostic et l’interface affiche uniquement son message localisé générique. Un test de non-régression protège ce comportement.

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
