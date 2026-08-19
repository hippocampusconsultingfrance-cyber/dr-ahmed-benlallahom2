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
