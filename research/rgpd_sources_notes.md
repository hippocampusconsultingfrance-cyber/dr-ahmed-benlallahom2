# Sources officielles initiales — évaluation RGPD Hippocampus Consulting

Date de collecte : 20 août 2026.

| Sujet | Source officielle | Point pertinent pour l’audit |
|---|---|---|
| Recrutement | [Guide CNIL du recrutement](https://www.cnil.fr/fr/le-guide-du-recrutement) | Limiter les personnes habilitées à accéder aux données des candidats selon leurs attributions. |
| Recrutement PME | [CNIL — recrutement et données personnelles](https://www.cnil.fr/fr/recrutement-et-donnees-personnelles-dans-les-tpepme-cinq-questions-incontournables-se-poser) | Les données candidates doivent être traitées de façon licite, loyale et transparente. |
| Cookies et traceurs | [CNIL — règles cookies](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi) | Le consentement doit être préalable, libre et spécifique pour les traceurs non exemptés. |
| Mentions d’information | [CNIL — exemples de mentions](https://www.cnil.fr/fr/passer-laction/rgpd-exemples-de-mentions-dinformation) | Les formulaires doivent donner une information claire sur les traitements. |

Ces notes sont des éléments de recherche à compléter avec les pages officielles ouvertes et les constats techniques du site. Elles ne constituent pas un avis juridique.

## Exigences officielles additionnelles relevées

| Sujet | Source officielle | Exigence ou point de contrôle |
|---|---|---|
| Mentions légales d’une société | [Entreprendre.Service-Public.fr — F37351](https://entreprendre.service-public.gouv.fr/vosdroits/F37351) | Tout site professionnel doit afficher des mentions facilement accessibles. Pour une société : dénomination, forme, siège, capital, RCS/SIREN, coordonnées, TVA, et informations complètes de l’hébergeur. |
| Information lors de la collecte | [Entreprendre.Service-Public.fr — F37351](https://entreprendre.service-public.gouv.fr/vosdroits/F37351) | Au moment de la collecte, informer sur responsable, finalités, base légale, caractère obligatoire, destinataires, conservation, droits, plainte CNIL et transferts éventuels. |
| Consentement commercial | [Entreprendre.Service-Public.fr — F37351](https://entreprendre.service-public.gouv.fr/vosdroits/F37351) | Consentement explicite requis pour les courriels commerciaux hors exceptions ; désinscription à prévoir. |
| Registre | [CNIL — registre des activités](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement) | Le registre concerne les organismes traitant des données personnelles. Il doit documenter finalités, catégories de personnes/données, destinataires/sous-traitants, transferts, effacement et sécurité. |
| IA et AIPD | [CNIL — IA, réaliser une AIPD si nécessaire](https://www.cnil.fr/fr/realiser-une-analyse-dimpact-si-necessaire) | Une AIPD est obligatoire si le traitement présente un risque élevé ; elle est particulièrement pertinente pour l’IA, doit être établie avant le traitement puis actualisée selon les évolutions. |
| Violations | [CNIL — notifier une violation](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles) | Tout incident doit être documenté ; un incident risqué doit être notifié à la CNIL et, si risque élevé, aux personnes. La CNIL indique une notification initiale dans les 72 heures si possible. |

## Points spécifiques recrutement relevés

La CNIL indique que les données candidates doivent être adéquates, pertinentes et strictement nécessaires à un poste donné. Les candidats doivent être informés de l’objectif, de la base légale, des destinataires, de la conservation, des droits, de l’existence d’une décision automatisée le cas échéant, et de la possibilité de plainte. Un vivier à l’issue négative peut être conservé en principe au maximum deux ans à compter du dernier contact, si le candidat en a été informé. Sources : [Guide CNIL recrutement](https://www.cnil.fr/fr/le-guide-du-recrutement) et [CNIL TPE/PME recrutement](https://www.cnil.fr/fr/recrutement-et-donnees-personnelles-dans-les-tpepme-cinq-questions-incontournables-se-poser).

## Données de santé et coffre documentaire

| Point | Source officielle | Conséquence de conformité |
|---|---|---|
| Données sensibles | [CNIL — données de santé](https://www.cnil.fr/fr/quelles-formalites-pour-les-traitements-de-donnees-de-sante) | Les données de santé sont interdites par principe, hors exception de l’article 9 du RGPD. Une base légale article 6 et une dérogation article 9 doivent être identifiées et documentées. |
| Recrutement | [CNIL — guide du recrutement](https://www.cnil.fr/fr/le-guide-du-recrutement) | Les données collectées doivent être adéquates, pertinentes et strictement nécessaires ; les données sensibles du candidat sont interdites hors exceptions expresses. Le guide souligne également la transparence, l’absence de décision exclusivement automatisée et le besoin éventuel d’AIPD. |
| Hébergement HDS | [ANS — HDS](https://esante.gouv.fr/ens/offre/hds) | En France, l’hébergement numérique de données de santé doit être réalisé par un hébergeur certifié HDS. Il faut qualifier juridiquement les documents reçus et éviter, ou isoler sous une architecture HDS, tout document contenant des données de santé. |

### Point de vigilance spécifique

Le coffre candidat accepte notamment des documents d’identité, autorisations/licences, diplômes, certificats, assurances, vaccins et extraits de casier. La politique et les formulaires doivent interdire clairement tout dossier médical ou toute donnée patient ; la collecte de justificatifs de vaccination, d’aptitude ou d’autres informations médicales doit faire l’objet d’une qualification juridique et d’un avis spécialisé avant généralisation. L’architecture actuelle dispose de chiffrement applicatif et de revue humaine, mais ces protections techniques ne remplacent pas, à elles seules, l’analyse HDS/RGPD requise si des données de santé sont effectivement hébergées.

## IA de recrutement et AI Act — mise à jour réglementaire

| Point | Source officielle | Conséquence de conformité |
|---|---|---|
| IA dans l’emploi | [Commission européenne — AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) | Les outils IA de recrutement, dont les logiciels de tri de CV, relèvent des cas d’usage à haut risque. Les exigences renforcées pour les cas d’emploi de l’annexe III s’appliquent à compter du 2 décembre 2027 selon la page mise à jour le 3 août 2026. |
| Exemples de haut risque | [AI Act Service Desk — Employment](https://ai-act-service-desk.ec.europa.eu/en/employment-0) | Un système qui classe, note, filtre ou établit une shortlist de candidats a une influence matérielle et est classé à haut risque. La seule extraction/organisation limitée d’information de CV, sans impact matériel sur la sélection, est donnée comme exemple de tâche procédurale étroite pouvant relever de l’exception. |
| Conséquence pratique | [Commission européenne — AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) | Un usage de classement/sélection doit être traité comme un chantier de conformité distinct : évaluation/atténuation des risques, qualité des jeux de données, journalisation, documentation, information, supervision humaine, exactitude, robustesse et cybersécurité. |

Le module actuel doit rester strictement configuré comme **aide à l’extraction et à la revue humaine**, sans classement décisif, sans rejet automatique et sans exclusion sur la base d’un score IA. Tout passage vers un score, une shortlist ou un filtrage qui influence matériellement l’accès à une mission devra déclencher une revue AI Act/RGPD formelle et, le cas échéant, une AIPD.

## Cookies, registre et chaîne de sous-traitance

| Point | Source officielle | Conséquence de conformité |
|---|---|---|
| Cookies et traceurs | [CNIL — cookies et traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi) | Le consentement doit précéder les traceurs non essentiels, être libre, éclairé, spécifique et révocable aussi simplement qu’il a été donné. Le responsable doit pouvoir en apporter la preuve. |
| Registre article 30 | [CNIL — registre](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement) | Le registre doit couvrir les finalités, personnes, catégories de données, destinataires/sous-traitants, transferts, conservation et mesures de sécurité ; il est mis à jour à chaque évolution matérielle. |
| Responsables et sous-traitants | [CNIL — qualification des rôles](https://www.cnil.fr/fr/rgpd-comment-bien-identifier-son-role) | Hippocampus Consulting doit qualifier son rôle au cas par cas, encadrer les sous-traitants par un acte article 28 RGPD et conserver les informations sur les sous-traitants ultérieurs et les transferts. |

Le site dispose d’un bandeau de consentement, de préférences révisables et d’un blocage analytique dépendant du consentement. Ce mécanisme doit néanmoins être contrôlé périodiquement sur les environnements publiés, notamment à chaque ajout de traceur, de script, de pixel ou d’intégration tierce. Le registre interne doit désormais mentionner explicitement l’export Google Drive, sa finalité de sauvegarde opérationnelle, son dossier de destination, la durée/condition de conservation, le token OAuth chiffré et la chaîne de sous-traitance correspondante.

## Mentions légales et transparence de la société

| Point | Source officielle | Écart constaté |
|---|---|---|
| Identification de la société | [Service Public — mentions obligatoires d’une société](https://entreprendre.service-public.gouv.fr/vosdroits/F37351) ; [Loi LCEN consolidée](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164) | La page française identifie aujourd’hui « Dr. Ahmed Ben Lallahom » comme professionnel indépendant. Pour une SARL, il faut afficher la dénomination Hippocampus Consulting SARL, forme, siège, capital, SIREN/RCS, TVA le cas échéant, e-mail/téléphone, directeur de publication et hébergeur avec coordonnées complètes. |
| Service payant B2C | [Service Public — mentions obligatoires d’une société](https://entreprendre.service-public.gouv.fr/vosdroits/F37351) | La réservation de consultation payante impose de vérifier les informations précontractuelles/CGV B2C : prix TTC, exécution, paiement, annulation/rétractation le cas échéant, médiation et règlement des litiges. |
| Transparence des traitements | [Service Public — mentions et données personnelles](https://entreprendre.service-public.gouv.fr/vosdroits/F37351) | La politique doit exposer au point de collecte la finalité, base légale, caractère obligatoire/facultatif, destinataires, conservation, droits, plainte CNIL et transferts éventuels. La page publiée en contient une partie mais ne couvre pas encore de façon spécifique et suffisamment lisible le recrutement, le coffre candidat, l’IA, Google Drive et les établissements destinataires. |

La mise à jour de la page légale doit être prioritaire car l’identité d’éditeur affichée ne correspond pas au titulaire annoncé par l’utilisateur. Les données sociétaires exactes doivent être fournies ou vérifiées sur un extrait Kbis/Annuaire des entreprises avant publication ; elles ne doivent pas être devinées.
