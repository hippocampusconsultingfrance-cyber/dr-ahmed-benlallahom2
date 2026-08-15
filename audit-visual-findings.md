# Constats visuels de l’audit — 15 août 2026

Les captures desktop des routes `/`, `/booking`, `/booking/confirmation?status=success`, `/booking/confirmation?status=canceled`, `/blog`, `/gdpr`, `/testimonials` et `/venture/hippocampus-consulting` ont été chargées avec succès après redémarrage du serveur.

La direction visuelle est cohérente : palette sombre médicale, accent cyan, typographie éditoriale, rail ECG et cartes premium. Les titres et appels à l’action restent lisibles sur desktop. Les états succès et annulation de la confirmation Stripe sont distingués visuellement et la référence de suivi est visible dans l’état succès.

Le bandeau cookies est visible sur toutes les routes auditées et occupe une large zone fixe en bas de l’écran. Il ne semble pas casser la structure, mais il réduit la visibilité du contenu inférieur dans une fenêtre de 720 px ; son comportement mobile doit encore être vérifié.

La page Blog affiche correctement l’état vide localisé en français. La page GDPR affiche le formulaire et son retour. La page venture charge son contenu et son logo. Aucune capture n’a révélé de texte coupé ou d’erreur de rendu desktop dans la zone visible.

Les vérifications techniques associées indiquent que le typage, la compilation et les tests passent. Les erreurs Vite et warnings React relevés dans les journaux précédents sont historiques ; un warning de clé React sur les tags chinois a été corrigé depuis.
