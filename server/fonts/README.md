# Polices de la facture PDF

Polices libres Noto (SIL Open Font License 1.1), utilisées par `server/invoice.ts`
et incluses dans la fonction Vercel par `vercel.json` (`includeFiles`). Chaque
licence est à côté de sa police.

| Fichier | Rôle | Version | Source | Licence |
| --- | --- | --- | --- | --- |
| `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` | tout le document (latin étendu, grec, cyrillique) | 2.015 | [notofonts/notofonts.github.io](https://github.com/notofonts/notofonts.github.io/tree/main/fonts/NotoSans/unhinted/ttf) | `NotoSans-OFL.txt` |
| `NotoSansArabic-Regular.ttf` | ligne du nom, s’il contient de l’arabe | 2.009 | [googlefonts/noto-fonts](https://github.com/googlefonts/noto-fonts/tree/main/unhinted/ttf/NotoSansArabic) | `NotoSansArabic-OFL.txt` |
| `NotoSansSC-Regular.otf` | ligne du nom, s’il contient des idéogrammes ou des kana | 2.004 | [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk/tree/main/Sans/SubsetOTF/SC) | `NotoSansSC-OFL.txt` |

Noto Sans Arabic reste en 2.009 : chaque forme de lettre y est un glyphe
complet. Dans les versions suivantes, les points sont des marques posées sur
des squelettes partagés (ب, ت, ي…), et un lecteur PDF qui extrait le texte
(copier-coller, recherche, pdftotext) rendrait une lettre pour une autre.
