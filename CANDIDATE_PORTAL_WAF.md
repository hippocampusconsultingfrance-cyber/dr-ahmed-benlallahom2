# Règle WAF/IP recommandée — Portail candidat

Le portail applique déjà des limites persistantes par action, compte et empreinte IP. Cette règle Cloudflare complète ces contrôles au niveau réseau sans analyser le contenu des documents.

## Règle à créer dans Cloudflare

Dans **Security → WAF → Custom rules**, créer la règle suivante :

| Paramètre | Valeur |
|---|---|
| Nom | `Hippocampus – protection accès candidat` |
| Expression | `(http.request.uri.path starts_with "/api/candidate/") or (http.request.uri.path eq "/candidate/access")` |
| Action | `Managed Challenge` |
| Ciblage recommandé | Seulement après un seuil de requêtes inhabituel par IP, via la règle de rate limiting Cloudflare |

Créer ensuite une règle de **Rate limiting** : 20 requêtes sur 10 minutes par IP vers `/api/candidate/*`, action `Managed Challenge`, durée de mitigation 10 minutes.

Ne pas appliquer cette règle aux appels Heartbeat `/api/scheduled/*`, qui sont authentifiés séparément et nécessaires au traitement documentaire.

> La protection Turnstile côté formulaire et la limitation persistante côté serveur restent actives même si la règle WAF est temporairement désactivée.
