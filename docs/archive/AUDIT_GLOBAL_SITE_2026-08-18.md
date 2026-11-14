# Audit global du site — Dr. Ahmed Ben Lallahom & Hippocampus Consulting

**Date :** 18 août 2026  
**Auteur :** Manus AI  
**Périmètre :** site public, réservation, recrutement international, espace candidat, documents administratifs, IA, administration, emails, sécurité, SEO, performance et opérations.

> **Conclusion exécutive.** Le site possède une base fonctionnelle et technique substantielle : paiement, formulaires, recrutement, pipelines d’analyse, conformité et nouvelle sécurité documentaire sont présents. L’audit confirme toutefois une **route publique employeur en erreur**, des **écarts de contenu dans le recrutement**, des **protections HTTP incomplètes**, un **sitemap insuffisant** et une **performance publique à surveiller**. Les données sensibles sont mieux protégées qu’avant grâce au chiffrement, au MFA et à la journalisation ; le principal compromis restant est l’absence d’antivirus privé, choisie pour rester sur l’hébergement actuel.

## 1. Méthode et limites de l’inspection

L’audit a combiné une revue des routes et sources, des captures desktop et mobile, des tests HTTP non authentifiés, des contrôles de base de données, la vérification des tâches planifiées, la revue des journaux runtime, la suite Vitest et un build de production. Aucun paiement réel, aucun email réel à un tiers et aucune suppression de donnée métier n’ont été déclenchés pendant l’audit.

| Volet | Vérifications effectuées | Résultat |
|---|---|---|
| Pages publiques | Accueil, recrutement, formulaire standard, VVIP/Offshore, employeurs, méthode, accès candidat, réservation | Pages chargées par le serveur ; une route client est en erreur (voir P0). |
| Responsive | Captures desktop et mobile sur les parcours principaux | La structure générale reste exploitable ; les améliorations UX sont listées. |
| Réservation | Source, webhook sans signature, états en base, rappels configurés | Contrôle de signature confirmé ; concurrence et reprise de facture à renforcer. |
| Recrutement / IA | Files CV, jobs documentaires, tests d’analyse et planificateurs | Aucun job actif bloqué ; échecs historiques à traiter dans l’interface. |
| Espace candidat | Accès sans session, chiffrement, MFA, sessions, Turnstile, jobs | Contrôles d’accès confirmés ; tests intégrés de parcours restent à élargir. |
| Sécurité | HSTS, accès non autorisés, chiffrement, journal, tests, WAF documenté | Défense en profondeur améliorée ; CSP et antivirus privé restent absents. |
| Tests automatisés | Vitest complet, typage et build | **105 tests réussis, 1 ignoré ; typage et build réussis.** |

## 2. État global par domaine

| Domaine | Évaluation | Commentaire |
|---|---:|---|
| Fonctionnalités métier | **Bon** | Les grands parcours existent et les services essentiels sont structurés. |
| Recrutement / IA | **Bon sous surveillance** | File asynchrone, reprises et revue humaine existent ; échecs historiques à rendre plus visibles. |
| Espace candidat | **Bon, récemment consolidé** | Sessions, chiffrement, contrôle d’accès, Turnstile et MFA admin sont en place. |
| Sécurité applicative | **Intermédiaire à bon** | Plusieurs couches ajoutées ; CSP, WAF effectif et antivirus privé restent des écarts. |
| SEO technique | **Intermédiaire** | Métadonnées côté client présentes, mais sitemap et rendu initial des sous-pages sont incomplets. |
| Performance | **À optimiser** | Réponses initiales observées entre 2 et 6 secondes ; un parcours a dépassé 12 secondes durant la sonde. |
| Accessibilité | **Bon socle** | Nombreux libellés ARIA, alt et structures sémantiques ; aucun audit automatisé WCAG exhaustif n’a été exécuté. |
| Exploitation / observabilité | **Bon socle** | Jobs Heartbeat, logs et événements sécurité sont présents ; alertes et tableaux restent à enrichir. |

## 3. Défauts et risques confirmés

### P0 — Corriger en priorité immédiate

| ID | Constat confirmé | Preuve | Impact | Correction recommandée |
|---|---|---|---|---|
| P0-01 | La page **Pourquoi Hippocampus Consulting** est inaccessible. | La capture de `/why-hippocampus` affiche 404 ; `App.tsx` ne déclare pas cette route. | Perte directe d’un parcours de conversion Employeurs et incohérence avec les liens existants. | Réimporter `WhyHippocampusPage`, déclarer `/why-hippocampus`, puis ajouter un test de routes publiques. |

### P1 — À corriger dans le prochain lot

| ID | Domaine | Constat confirmé | Impact | Recommandation précise |
|---|---|---|---|---|
| P1-01 | Recrutement | La carte publique VVIP mentionne encore **« résidences de prestige »**. | Écart avec votre directive de suppression et positionnement potentiellement trop restrictif. | Remplacer par « environnements critiques, industriels, offshore et missions internationales spécialisées ». |
| P1-02 | Formulaire recrutement | La version rendue examinée ne reflète pas de manière fiable les nouvelles cases à cocher de langues. | Risque de régression entre version de code, prévisualisation et production. | Tester explicitement le composant rendu, la soumission structurée et la version déployée. |
| P1-03 | SEO | Le sitemap ne référence pas les parcours standard recrutement, VVIP, Employeurs ou la méthode Hippocampus. | Indexation incomplète des pages à valeur commerciale. | Compléter `/sitemap.xml` avec les routes publiques indexables et exclure les pages personnelles. |
| P1-04 | SEO / partage social | Les métadonnées des sous-pages sont majoritairement définies après chargement React. | Les robots sociaux ou crawlers ne rendant pas JavaScript peuvent partager le titre de l’accueil. | Pré-rendre les balises critiques ou fournir un HTML spécifique par route. |
| P1-05 | En-têtes HTTP | HSTS et `X-Content-Type-Options` sont présents, mais CSP, `frame-ancestors`, `Referrer-Policy` et `Permissions-Policy` ne sont pas visibles. | Défense navigateur incomplète contre l’injection de contenu, le clickjacking et la fuite de référent. | Ajouter une CSP progressive avec liste blanche Stripe, Turnstile, Resend et stockage, puis activer les autres en-têtes. [1] |
| P1-06 | IA recrutement | Quatre jobs CV historiques sont marqués en échec sur une ancienne erreur de réponse IA vide. Aucun job n’est actuellement bloqué. | Dette opérationnelle et risque de dossiers oubliés. | Ajouter un écran « Échecs historiques » avec relance contrôlée ou archivage explicite. |
| P1-07 | Couverture de tests | 105 tests passent, mais le parcours intégral candidat n’est pas couvert de bout en bout avec Turnstile simulé, activation email, stockage chiffré et téléchargement. | Régressions possibles sur les interactions entre modules. | Créer un test d’intégration isolé de compte + activation + dépôt + analyse + téléchargement. |
| P1-08 | Réservation | La création de rendez-vous et la vérification de chevauchement doivent être revues pour garantir l’atomicité en charge. | Risque théorique de double créneau lors de requêtes simultanées. | Encadrer la réservation par une transaction/contrainte d’unicité sur le créneau. |
| P1-09 | Factures et emails | L’échec de génération/envoi après paiement devrait être repris automatiquement. | Un paiement peut être confirmé sans facture ou confirmation livrée. | Créer une file de notification/facture avec retries et alerte admin. |

### P2 — Améliorations importantes, non bloquantes

| ID | Domaine | Constat | Recommandation |
|---|---|---|---|
| P2-01 | UX réservation | Le contrôle date/heure affiche un format système `mm/dd/yyyy` sur une interface française. | Utiliser un sélecteur localisé ou afficher clairement le format attendu. |
| P2-02 | Performance | Les sondes publiques ont observé des TTFB de 2 à 6 secondes ; une requête recrutement a dépassé 12 secondes. | Mesurer depuis plusieurs régions, distinguer démarrage à froid/charge réelle et fractionner le bundle principal. |
| P2-03 | JavaScript | Le bundle principal produit fait environ 670 kB non compressé (203 kB gzip). | Découper davantage les pages lourdes et retarder les bibliothèques non indispensables. |
| P2-04 | Antivirus | Les fichiers restent validés structurellement, chiffrés et en quarantaine, mais sans moteur antivirus privé continu. | Prévoir ClamAV ou équivalent uniquement lors d’un passage à un hébergement permanent. [2] |
| P2-05 | WAF | La règle WAF/IP est documentée mais nécessite activation manuelle dans Cloudflare. | Créer la règle `Managed Challenge` et le rate limiting documentés dans `CANDIDATE_PORTAL_WAF.md`. |
| P2-06 | Observabilité | Le job quotidien de posture est planifié, mais un tableau visuel de sécurité manque encore. | Ajouter un onglet avec échecs de connexion, blocages Turnstile, téléchargements et événements élevés. |

## 4. Tests et preuves détaillées

### 4.1 Résultats confirmés

| Contrôle | Résultat | Commentaire |
|---|---|---|
| Suite Vitest | **105 réussis, 1 ignoré** | Le test ignoré dépend d’une connectivité externe Resend, non du comportement applicatif. |
| TypeScript | **Réussi** | Aucun diagnostic de type bloquant. |
| Build production | **Réussi** | Build final réussi ; avertissement de taille de bundle à traiter comme P2. |
| Dépôt candidat sans session | **401** | L’accès anonyme est refusé. |
| Téléchargement admin sans session | **403** | L’accès administrateur est requis. |
| Webhook Stripe sans signature | **400** | Une requête non signée est refusée. |
| Jobs IA actifs | **Aucun** | Ni CV ni document candidat en attente, exécution ou reprise au moment du contrôle. |
| Heartbeat documents | **Actif toutes les 5 minutes** | Traitement asynchrone candidat planifié. |
| Heartbeat sécurité | **Actif à 03:15 UTC** | Nettoyage de limites et synthèse d’événements élevés. |
| Domaine public | **HTTPS actif, HSTS présent** | Le domaine répond et les routes serveur renvoient le shell applicatif. |

### 4.2 Vérifications volontairement non exécutées

Les actions suivantes n’ont pas été déclenchées afin d’éviter des effets irréversibles, des coûts ou des communications non sollicitées : paiement Stripe réel, remboursement réel, email à un tiers, création durable de candidat de démonstration, suppression RGPD réelle et envoi massif de campagne.

> Les tests non destructifs sont préférables à une simulation de données sensibles sur un site médical en production. Les flux doivent être rejoués avec cartes de test Stripe et une adresse de test dédiée lors de la prochaine fenêtre de recette.

## 5. Plan de correction priorisé

| Lot | Délai conseillé | Actions | Bénéfice |
|---|---|---|---|
| **Lot A — Urgent** | 24–48 h | Corriger `/why-hippocampus`, supprimer la formulation VVIP obsolète, ajouter les routes au sitemap, créer les tests de routes. | Rétablit la conversion Employeurs et la cohérence du contenu. |
| **Lot B — Prochaine semaine** | 3–7 jours | CSP/en-têtes, test intégré espace candidat, vue de reprise des jobs IA, atomicité réservation, file de facture/email. | Réduit les risques techniques et opérationnels. |
| **Lot C — Optimisation** | 1–3 semaines | Pré-rendu SEO, amélioration mobile/localisation date, découpage de bundles, tableau sécurité. | Améliore référencement, conversion et vitesse perçue. |
| **Lot D — Infrastructure** | À décider | Hébergement permanent et antivirus privé ; activation WAF Cloudflare. | Niveau de sécurité documentaire supérieur. |

## 6. Améliorations stratégiques proposées

La priorité métier devrait être de rendre le parcours **Employeur → Brief → Méthode → Shortlist** parfaitement continu et mesurable. La page méthode restaurée, un sitemap complet et des appels à l’action cohérents créeront un meilleur tunnel B2B. En parallèle, le portail candidat peut gagner en confiance grâce à un indicateur clair d’état de chaque document : reçu, vérifié, à compléter, analysé, à revoir.

Pour la réservation, l’amélioration la plus utile est une file d’exécution fiable après paiement. Elle doit garantir que la confirmation, le lien Meet, la facture et le rappel soient soit envoyés, soit visiblement en erreur et relançables. Pour les données de santé et administratives, la validation de téléversement multicouche, la quarantaine, le chiffrement et la revue humaine restent les bonnes pratiques de référence. [2] [3]

## 7. Références

[1] [MDN Web Docs — Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)  
[2] [OWASP — File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)  
[3] [OWASP — Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)  
[4] [Stripe — Webhook signatures](https://docs.stripe.com/webhooks/signature)  
[5] [Google Search Central — JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
