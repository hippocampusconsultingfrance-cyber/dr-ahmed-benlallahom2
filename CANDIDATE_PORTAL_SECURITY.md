# Espace candidat sécurisé — règles de conception

## Contrôles mis en œuvre

Les comptes candidats sont séparés de l’authentification interne. Les mots de passe ne sont jamais stockés en clair : ils sont dérivés avec **scrypt**, un sel unique et un secret serveur distinct. Les sessions sont opaques, expirent au bout de sept jours et leur empreinte seule est conservée. La vérification d’email, la réinitialisation de mot de passe, le verrouillage temporaire après échecs et les journaux d’accès complètent ce dispositif.

Les documents sont envoyés par des utilisateurs authentifiés vers un stockage privé. Le système applique une liste blanche de formats nécessaires (PDF, DOC, DOCX, JPG et PNG), des limites de taille, une vérification de signature, une vérification défensive des conteneurs PDF/DOCX et des noms générés côté serveur. Les liens de téléchargement sont signés à la demande après contrôle d’autorisation. L’analyse IA est une **aide à la revue humaine** : elle ne vérifie pas l’authenticité d’un document et ne produit aucune décision automatique.

## Références externes

Les exigences suivantes s’appuient sur les recommandations de l’OWASP : hachage lent des mots de passe, transmission sécurisée, messages d’authentification génériques, limitation des tentatives de connexion, liste blanche des formats, contrôle du type et de la signature, noms de fichiers générés, limites de taille et accès autorisé au dépôt/téléchargement.

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

## Limites connues et revue humaine

La validation de signature et de structure n’est pas un antivirus. Toute pièce doit être examinée par un administrateur qualifié avant utilisation opérationnelle. Le système n’efface jamais automatiquement les documents ; les suppressions RGPD restent une action administrative explicite et traçable.
