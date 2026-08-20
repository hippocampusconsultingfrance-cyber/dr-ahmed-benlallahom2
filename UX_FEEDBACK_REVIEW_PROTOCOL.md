# Procédure de revue UX fondée sur les retours réels

> **Brouillon opérationnel à faire relire avant toute collecte à grande échelle.** Cette procédure vise l’amélioration de l’interface et ne doit pas être utilisée pour recueillir une donnée de santé, une information financière, un dossier candidat ou toute donnée sensible non nécessaire.

## Objectif et périmètre

La revue UX se fonde sur des retours volontaires de visiteurs, candidats, employeurs ou utilisateurs administratifs autorisés. Elle cible uniquement la compréhension, la navigation, la lisibilité et les frictions d’interface. Les retours ne servent ni à évaluer une personne ni à prendre une décision médicale, professionnelle ou automatisée.

| Étape | Règle de minimisation | Preuve de revue |
|---|---|---|
| Invitation | Proposer le retour après un parcours non sensible ou dans une sollicitation séparée ; ne pas précocher l’accord. | Texte d’invitation et version de l’interface. |
| Consentement | Expliquer le but UX, le caractère facultatif, le canal de contact et la durée de conservation retenue. | Trace d’accord explicite ou suppression du retour non consenti. |
| Questions | Limiter à compréhension, facilité, action bloquante, appareil/navigateur et suggestion libre non sensible. | Questionnaire ou guide d’entretien daté. |
| Anonymisation | Retirer nom, e-mail, téléphone, référence de réservation, CV, contenu médical et toute information identifiante avant synthèse. | Synthèse non nominative. |
| Priorisation | Évaluer fréquence, impact sur une tâche et risque d’accessibilité, sans attribuer de score à un individu. | Tableau d’actions et décision. |

## Guide d’entretien court

La séance peut se limiter à quinze minutes. Demander d’abord au participant de réaliser un parcours sans assistance, puis de verbaliser ce qui est compris ou bloqué. Les questions recommandées sont les suivantes : « Quel objectif poursuiviez-vous ? », « Quel élément était difficile à comprendre ? », « À quel moment avez-vous hésité ? », « Quelle amélioration concrète proposeriez-vous ? ». Il faut éviter toute question sur l’état de santé, les motivations personnelles, les documents candidats, le paiement ou les données de tiers.

## Cycle de revue trimestriel

Chaque trimestre, consolider les retours anonymisés, vérifier les problèmes reproduits au moins deux fois, puis classer les corrections en trois niveaux : blocant, important ou amélioration. Une décision doit être prise pour chaque point retenu : corriger, tester davantage, documenter l’absence de changement ou écarter avec justification. Les conclusions sont ajoutées au journal d’audit sans identifiant personnel.

| Signal | Décision attendue |
|---|---|
| Un visiteur ne peut pas achever une action essentielle | Vérification immédiate du parcours et correction prioritaire si le défaut est reproduit. |
| Plusieurs retours convergent vers la même incompréhension | Prototype, test ciblé et mesure après correction. |
| Retour isolé non reproductible | Conserver une synthèse anonyme, surveiller à la revue suivante. |
| Demande impliquant une donnée sensible ou une situation personnelle | Ne pas l’intégrer au corpus UX ; orienter vers le canal de contact ou la procédure appropriée. |

## Traçabilité

La synthèse trimestrielle doit uniquement contenir la période, le nombre de retours consentis, les parcours observés, les constats anonymisés, les décisions, la version concernée et le lien vers les tickets ou tests ajoutés. Les contrôles nécessitant un appareil réel ou un consentement particulier sont rapprochés de `EXTERNAL_VALIDATION_REGISTER.md`.
