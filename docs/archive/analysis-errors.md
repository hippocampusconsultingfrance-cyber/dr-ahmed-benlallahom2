# Analyse des Erreurs du Site

## Erreurs Critiques Identifiées

### 1. Bug d'insertion contact_messages et gdpr_requests (tracking_id trop long)
- **Problème**: Le tracking_id généré pour `contact_messages` fait 25 chars (`CNT-{timestamp13}-{random7}`) et pour `gdpr_requests` fait 26 chars (`GDPR-{timestamp13}-{random7}`), mais la colonne est `varchar(20)`.
- **Impact**: Le formulaire de contact et le formulaire GDPR ne fonctionnent PAS en production.
- **Solution**: Raccourcir le tracking_id ou agrandir la colonne.

### 2. Bug Drizzle/TiDB avec db.insert() pour contact et GDPR
- **Problème**: `db.insert(contactMessages).values(...)` utilise `DEFAULT` pour les colonnes auto-increment, ce qui échoue avec TiDB.
- **Impact**: Même si le tracking_id était correct, l'insertion échouerait.
- **Solution**: Utiliser `db.execute(sql\`...\`)` comme pour appointments.

## Erreurs Mineures

### 3. Stripe success_url error dans les logs anciens
- **Problème**: Erreur `Invalid URL: An explicit scheme (such as https) must be provided` dans les anciens logs.
- **Statut**: Déjà corrigé (utilise `ctx.req.headers.origin` avec fallback).

### 4. Tests vitest en échec (12 tests)
- contact.test.ts: 11 tests échouent (bug d'insertion DB)
- testimonials.test.ts: 1 test échoue (diverse ratings - normal car tous les avis sont 5 étoiles)

## Vérification Visuelle

- ✅ Page d'accueil: OK
- ✅ Page booking: OK
- ✅ Page testimonials: OK
- ✅ Page legal: OK
- ✅ Page GDPR: OK (mais formulaire ne fonctionne pas côté serveur)
- ✅ Pas d'erreurs TypeScript
- ✅ Pas d'erreurs console navigateur récentes
- ✅ Pas d'erreurs réseau récentes
