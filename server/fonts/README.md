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

Limite connue, en 2.009 aussi : la ligature lam-alef (لا, لأ, لإ, لآ) s’imprime
correctement mais se copie avec ses deux lettres inversées. Son glyphe unique
porte les deux lettres dans l’ordre logique, et le lecteur les retourne avec le
reste du mot : « سلامة » est extrait « سالمة » par pdftotext comme par pdf.js
(visionneuse de Firefox). Beaucoup de noms sont concernés (علاء، بلال، صلاح،
الأمين…) : seul l’affichage d’un nom arabe est garanti exact, pas son texte
copié.

Noto Sans 2.015 dessine ǹ ḿ ṃ ṅ ṣ ẹ ị ọ ụ en lettre de base plus marque
(fonctionnalité OpenType `ccmp`, pour y empiler un ton) : le texte copié en
perdait la marque (« Thi » pour « Thị »). La facture retire `ccmp` d’une ligne
de nom qui en contient (`DECOMPOSED_BY_NOTO_SANS` dans `server/invoice.ts`). À
revoir avec une autre version de Noto Sans : le test des lettres latines
précomposées de `server/invoice.names.test.ts` le signalera. Limite connue : ị
suivi d’un ton au-dessus (igbo ị̀, ị́) garde alors le point du i sous le ton ;
son texte copié reste exact.

Écritures qu’aucune de ces polices n’a (hébreu, coréen, thaï, devanagari,
géorgien…) et emoji : PDFKit les dessinerait en carrés vides. La ligne du nom
remplace un caractère sans dessin par sa forme simple quand elle s’imprime
(𝓙𝓮𝓪𝓷 et Ⓙⓔⓐⓝ → Jean, ⒥ → (j)) ; sinon elle retire un emoji ou un
pictogramme, et met « ? » à la place de tout autre caractère. Un nom fait
seulement d’emoji s’imprime « - » : la ligne du nom reste, et l’email, le
téléphone et le tableau ne remontent pas.

# Polices standard de pdf.js (`pdfjs/`)

Copie à l’identique de `pdfjs-dist/standard_fonts/` (pdfjs-dist 5.4.296,
dépendance de pdf-parse 2.4.5), utilisée par `server/pdfExtractionSandbox.ts`
(`standardFontDataUrl`). Beaucoup de PDF n’embarquent pas les 14 polices
standard (Helvetica, Times, Courier, Symbol, ZapfDingbats, ou Arial et Times
New Roman qui y sont ramenées) : PDFKit, FPDF/TCPDF, ReportLab, certains
exports d’ATS. Sans ces fichiers, pdf.js ne peut dessiner ce texte qu’avec les
polices du système, absentes d’une fonction Vercel : la page sortirait blanche,
le contrôle de visibilité du CV (IA-01) prendrait tout le texte pour invisible
et la vision lirait une page vide. Le même `includeFiles` de `vercel.json` les
inclut dans la fonction.

Polices Foxit (`Foxit*.pfb`, licence BSD de PDFium : `LICENSE_FOXIT`) et
Liberation Sans 2 (`LiberationSans-*.ttf`, SIL Open Font License 1.1 :
`LICENSE_LIBERATION`). À recopier si pdf-parse passe à une autre version de
pdfjs-dist : le test « polices standard » de
`server/recruitmentInvisibleText.test.ts` signale un fichier manquant.
