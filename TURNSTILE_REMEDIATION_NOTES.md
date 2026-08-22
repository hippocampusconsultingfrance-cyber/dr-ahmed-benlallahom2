# Diagnostic Turnstile — 22 août 2026

Sur `https://drahmedbenlallahom.com/questions-anesthesie`, le script officiel Turnstile est chargé et `window.turnstile` est disponible. Le conteneur reçoit un champ caché `cf-turnstile-response`, preuve que le rendu explicite est appelé, mais aucune iframe Cloudflare ne demeure dans le DOM et aucun jeton n’est présent. Cette observation confirme que le défaut se situe après l’initialisation du script ; les domaines autorisés lus dans Cloudflare sont `drahmedbenlallahom.com` et `www.drahmedbenlallahom.com`.

La requête navigateur vers la plateforme Cloudflare cible bien la clé publique `0x4AAAAAAEUEqBVD0lsUhZ2T`, identique au widget configuré dans le compte Cloudflare. Le diagnostic doit donc privilégier le cycle de rendu ou la réponse de challenge plutôt qu’une divergence de clé compilée.

Le composant ne rend pas de message d’erreur utilisateur après cette disparition d’iframe. La correction applicative doit donc bloquer le bouton tant qu’aucun jeton n’est reçu et produire un état d’échec immédiatement compréhensible. Une tentative de mise à jour de la liste des domaines via le connecteur Cloudflare a échoué avec une erreur d’authentification `10000`; aucune modification Cloudflare n’a été appliquée par cette tentative.

Le navigateur de contrôle n’est pas connecté au tableau de bord Cloudflare. La mise à jour de la liste des domaines ne peut donc pas être finalisée depuis ce navigateur sans authentification du propriétaire. Les domaines personnalisés de production étaient déjà autorisés ; l’ajout du domaine Manus direct reste la prochaine action de configuration à effectuer une fois l’accès Cloudflare rétabli.
