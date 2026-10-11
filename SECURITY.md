# Politique de sécurité

Ce site traite des données personnelles, dont certaines relèvent de la santé (questions santé, rendez-vous) ou du recrutement (CV, diplômes). Nous prenons tout signalement au sérieux.

## Signaler une vulnérabilité

- Écrivez à **contact@drahmedbenlallahom.com** avec l'objet « Sécurité », en décrivant le problème, les étapes pour le reproduire et l'impact estimé.
- Merci de **ne pas** ouvrir d'issue publique, de ne pas accéder aux données d'autres personnes au-delà du strict nécessaire pour démontrer le problème, et de ne pas dégrader le service (pas de test de charge ni de déni de service).
- Nous accusons réception sous 5 jours ouvrés et vous tenons informé de la correction.

## Périmètre

- Inclus : `drahmedbenlallahom.com` et ses sous-chemins (`/api/*`, espace candidat, back-office), ainsi que le code de ce dépôt.
- Exclus : services tiers (Stripe, Clerk, Resend, Cloudflare, Vercel, Neon), à signaler directement à l'éditeur concerné.

## Pratiques en place

- Accès administrateur protégé par Clerk et une validation MFA côté serveur.
- Webhooks Stripe et Resend vérifiés par signature ; tâches planifiées protégées par un secret (`CRON_SECRET`).
- Limitation de débit persistante sur les formulaires publics, la réservation et l'espace candidat ; anti-robot Turnstile sur les formulaires sensibles.
- Documents candidats chiffrés (AES-256) et téléchargeables uniquement via des routes authentifiées.
- En-têtes de sécurité (CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
- Dépendances : installation figée (`--frozen-lockfile`) et audit `pnpm audit --prod` en CI.

## Données personnelles

Pour exercer vos droits RGPD (accès, rectification, suppression…), utilisez le formulaire de la page [/gdpr](https://drahmedbenlallahom.com/gdpr).
