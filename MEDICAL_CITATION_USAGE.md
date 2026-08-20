# Contrat d’usage — `MedicalCitation`

Le composant `MedicalCitation` rend visible la provenance d’une information générale ainsi que la date à laquelle cette source a été vérifiée. Il impose les propriétés `source` et `updatedAt` ; le lien officiel est facultatif lorsqu’il ne peut pas être publié. Il ne doit jamais être utilisé pour transformer une information générale en recommandation personnalisée, diagnostic, avis individuel ou promesse thérapeutique.

| Propriété | Obligatoire | Règle |
|---|---:|---|
| `source` | Oui | Nom de l’organisme, publication ou référentiel effectivement consulté. |
| `updatedAt` | Oui | Date ISO `YYYY-MM-DD` de dernière vérification. |
| `href` | Non | URL officielle uniquement ; ouverture externe protégée par `noopener noreferrer`. |
| `level` | Non | `information`, `recommendation` ou `regulatory`, sans exagérer la portée de la source. |

> Le contenu adjacent doit préciser ses limites, en particulier lorsqu’il concerne la santé. Une citation ne remplace pas la consultation d’un professionnel ni la prise en charge des urgences.
