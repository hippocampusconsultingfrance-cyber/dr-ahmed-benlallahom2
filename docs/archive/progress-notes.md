# Progress Notes

## Completed Features
- Resend API for emails (replaces SMTP Gmail)
- Mode clair/sombre with toggle (Sun/Moon in nav)
- Heartbeat cron for 24h reminders: task_uid = ijGZhKmBcGdAYhrJii4K8q
- Admin dashboard at /admin (appointments, messages, GDPR, blog, availability)
- Blog system at /blog with admin CRUD
- Availability calendar (admin management)
- Breadcrumbs on all pages
- Page 404 personalized
- Progress indicator on booking form
- Testimonials carousel on homepage
- Animations (parallax, stagger, hover-lift, button press)
- Lazy loading images + eager hero
- Font preloading
- Open Graph meta tags already in place

## Remaining TODO items (unchecked)
1. Corriger les statistiques dans la section "À Propos" (9+ années, 5+ entreprises, 16+ certifications, 3 langues)
2. Tester la soumission du formulaire de contact sans cocher GDPR (doit être rejeté)
3. Tester la soumission du formulaire de contact avec GDPR coché (doit être accepté)
4. Tester le changement de langue vers l'anglais (EN)
5. Tester le changement de langue vers l'allemand (DE)
6. Tester le changement de langue vers le chinois (ZH)
7. Soumettre le site à Google Search Console (manuel)
8. Créer et soumettre le sitemap.xml à Google (manuel)
9. Vérifier les redirections des domaines vers le site Manus
10. Vérifier que le site est accessible via les domaines personnalisés
11. Attendre l'indexation par Google (3-7 jours)
12. Ajouter gestion des états d'erreur dans TestimonialsSection
13. Ajouter gestion des états d'erreur dans TestimonialsPage
14. Corriger le schéma Review JSON-LD
15. Modifier SEOHead pour injecter JSON-LD sans écraser
16. Ajouter tests tRPC end-to-end pour testimonials.list
17. Ajouter tests UI pour TestimonialsSection et TestimonialsPage
18. Valider que tous les tests vitest passent
19. Facture PDF : ajouter un lien de téléchargement dans l'email

## Notes
- Items 7-11 are manual tasks that the user must do themselves
- Items 2-6 are verification tests that can be done via screenshots/tests
- Items 12-18 are code improvements
- The Navigation.tsx console errors from 21:52 are stale (before HMR fix) - TypeScript shows 0 errors now
- All 56 tests pass currently
- Responsive looks good on mobile (375x812) and tablet (768x1024)
- Blog breadcrumb shows "Accueil > Accueil > Actualités" - needs fix (double Accueil)
