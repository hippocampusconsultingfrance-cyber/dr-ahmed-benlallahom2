# Source de vérité des migrations Drizzle

La configuration active de Drizzle est définie dans `drizzle.config.ts` et déclare `out: "./drizzle"`. Les fichiers SQL et le journal présents directement sous ce dossier constituent donc la seule source de vérité pour la génération et la traçabilité des migrations de ce projet.

Le sous-dossier historique `drizzle/migrations/` n’est pas la sortie configurée. Il est conservé uniquement pour l’historique ; aucune nouvelle migration ne doit y être ajoutée et il ne doit pas être utilisé pour déduire l’état de la base déployée.

## Procédure obligatoire

1. Modifier le schéma TypeScript dans `drizzle/schema.ts`.
2. Générer une migration avec `pnpm drizzle-kit generate`.
3. Lire intégralement le SQL produit directement sous `drizzle/` et vérifier son ordre, ses index et sa réversibilité métier.
4. Appliquer le SQL explicitement avec l’outil de migration de la plateforme, puis comparer les tables et colonnes réellement déployées.
5. Ajouter ou mettre à jour les tests couvrant le contrat modifié ; ne jamais employer `pnpm db:push` comme raccourci non revu en production.

Cette règle prévient les divergences silencieuses entre le schéma TypeScript, les fichiers versionnés et la base de production.
