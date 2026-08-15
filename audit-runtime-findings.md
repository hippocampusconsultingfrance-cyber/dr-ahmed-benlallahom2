# Résultats runtime — audit du 15 août 2026

Après redémarrage du serveur, les routes publiques chargées pendant l’audit ont répondu avec des statuts HTTP 200, les appels tRPC de disponibilité et de témoignages ont répondu en 200, et l’analytics a répondu en 200.

Le journal serveur contient une alerte de dépendance non bloquante : `baseline-browser-mapping` est ancien. Il contient également des messages historiques de session absente liés à l’accès admin sans authentification ; ils sont attendus pour un dashboard protégé et ne constituent pas une erreur des pages publiques.

Le journal Vite contient des invalidations Fast Refresh historiques liées à l’export `bookingContent` depuis un composant React. Le serveur redémarre et la compilation passe ensuite ; ce comportement concerne le confort de développement et ne bloque pas la production.

Le journal navigateur conserve un warning historique de clés React dupliquées en chinois (`人员配置`) et le journal réseau conserve un ancien test contact en erreur 500 du 25 juillet 2026. La clé React a été corrigée dans `ExperienceSection.tsx`, et le test contact correspondant aux anciennes insertions Drizzle n’est pas une erreur reproduite dans la session actuelle. Aucun 4xx/5xx récent n’a été observé sur les parcours publics audités.

Les réponses réseau récentes utilisées pour `availability.getBlockedDates`, `availability.getSlots` et `testimonials.list` sont en 200. Les données personnelles et jetons présents dans les journaux doivent rester réservés à l’environnement d’audit et ne doivent pas être exposés dans un rapport public.

## Mise à jour après les dernières corrections

Après les nouveaux parcours desktop et mobile, aucune erreur runtime bloquante actuelle n’a été reproduite dans les journaux serveur, réseau ou console navigateur. Le serveur redémarre correctement et les routes auditées répondent.

Le build signale encore un chunk JavaScript principal d’environ 2,10 Mo minifié, soit environ 554 Ko gzip. Le site reste fonctionnel, mais une séparation par route et un chargement différé des fonctionnalités Blog et administration sont recommandés pour améliorer le premier chargement mobile.

Les messages `Auth Missing session cookie` surviennent uniquement lors d’appels non authentifiés aux procédures d’administration ; ils sont cohérents avec la protection du dashboard et ne constituent pas une fuite de données.

Le warning `baseline-browser-mapping` indique des données d’outil de build anciennes. Il est non bloquant et peut être traité lors d’une maintenance des dépendances.

Les erreurs Vite de pré-transformation et les warnings de clés React relevés dans l’historique ne sont plus reproduits après les corrections CSS et `ExperienceSection`.

## Incident écran blanc en production — diagnostic confirmé

La production `https://drahmedbenlallahom.com` répond avec un document HTML 200 mais le conteneur React reste vide. La prévisualisation locale fonctionne correctement sur `/`, `/booking` et `/legal`.

Le chargement manuel du bundle publié a reproduit l’erreur suivante : `TypeError: Cannot read properties of undefined (reading 'forwardRef')`, dans `assets/radix-CqMEKgsV.js`, lors de l’appel `s.forwardRef`.

La cause confirmée est le découpage manuel Vite des dépendances : `framework-CJaM11TD.js` importait `radix-CqMEKgsV.js`, tandis que Radix importait à son tour React depuis `framework`, créant une boucle de dépendances produisant un export React indéfini en production. La correction consiste à retirer `manualChunks` et à laisser Rollup conserver un graphe cohérent. Le typecheck, les tests et le build local passent après cette correction ; la production doit être revalidée après publication du checkpoint.
