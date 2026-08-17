# Exploitation du pipeline de recrutement intelligent

## Cycle de traitement

Un CV est d’abord soumis à une validation technique : extension, type MIME, signature binaire, taille et cohérence du conteneur DOCX. Il est conservé en **quarantaine privée** tant que cette validation et la récupération par le worker ne sont pas terminées. Le worker planifié traite les jobs d’analyse toutes les cinq minutes, par petits lots et avec au plus trois tentatives.

| État d’analyse | Sens opérationnel | Action administrateur |
|---|---|---|
| `queued` | Job enregistré, en attente de worker | Attendre le cycle ou relancer après diagnostic |
| `extracting` | Fichier contrôlé et texte en cours d’extraction | Aucune action nécessaire |
| `analyzing` | Analyse structurée en cours | Aucune action nécessaire |
| `completed` | Analyse disponible | Revue humaine du profil |
| `needs_review` | Analyse disponible mais éléments incomplets ou ambigus | Vérifier les preuves du CV |
| `failed` | Trois tentatives ou échec de validation | Consulter l’erreur et demander un nouveau document si nécessaire |

## Garanties de traçabilité

Chaque analyse conserve son modèle, sa version de prompt, son statut, son nombre de tentatives, sa méthode d’extraction, le checksum de fichier et les structures normalisées disponibles. L’analyse sert uniquement d’aide à la revue humaine ; elle ne produit pas de décision automatisée de recrutement.

À l’expiration de la rétention, le dossier passe en archive et sa référence de téléchargement est remplacée par une référence retraitée. Le journal d’audit enregistre l’horodatage du retrait. Le stockage fourni ne propose pas de suppression objet programmée : la référence privée devient donc inaccessible pour l’application et tout téléchargement est bloqué.

## Supervision

Le job `recruitment-processing-every-5-minutes` traite les analyses différées. En cas de dossier en erreur, vérifier d’abord le champ `analysisLastError`, la validité du fichier, puis utiliser l’action de réanalyse après correction. Le job de rétention quotidien archive les dossiers arrivés à échéance.
