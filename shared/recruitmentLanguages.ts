import { foldAdminSearchText } from "./adminSearchFolding";

/**
 * IA-02: the languages the recruitment screens compare, by ISO 639-1 code,
 * with their names in French, English, German and Chinese, then the other
 * names they are written under (the language's own name, a traditional
 * Chinese spelling…). The application form records them in English (French,
 * Arabic), even from its French page; an admin types them in French
 * (Français, francais); the AI reads them in the CV's language (Deutsch,
 * العربية, 中文). The matching profiles, the missions and the Langue filter
 * of the Candidatures compare these codes, so that « Français » finds
 * « French » and « Arabe » finds « Arabic ».
 */
export const RECRUITMENT_LANGUAGES = [
  { code: "fr", names: { fr: "Français", en: "French", de: "Französisch", zh: "法语" }, otherNames: ["法文", "法語"] },
  { code: "en", names: { fr: "Anglais", en: "English", de: "Englisch", zh: "英语" }, otherNames: ["英文", "英語"] },
  { code: "ar", names: { fr: "Arabe", en: "Arabic", de: "Arabisch", zh: "阿拉伯语" }, otherNames: ["العربية", "عربي", "عربی", "阿拉伯文", "阿拉伯語"] },
  { code: "es", names: { fr: "Espagnol", en: "Spanish", de: "Spanisch", zh: "西班牙语" }, otherNames: ["Español", "Castellano", "西班牙文", "西班牙語"] },
  { code: "pt", names: { fr: "Portugais", en: "Portuguese", de: "Portugiesisch", zh: "葡萄牙语" }, otherNames: ["Português", "葡萄牙文", "葡萄牙語"] },
  { code: "de", names: { fr: "Allemand", en: "German", de: "Deutsch", zh: "德语" }, otherNames: ["德文", "德語"] },
  { code: "zh", names: { fr: "Chinois", en: "Chinese", de: "Chinesisch", zh: "中文" }, otherNames: ["Mandarin", "汉语", "漢語", "普通话", "普通話", "华语", "華語"] },
  { code: "it", names: { fr: "Italien", en: "Italian", de: "Italienisch", zh: "意大利语" }, otherNames: ["Italiano", "意大利文", "義大利語"] },
  { code: "ru", names: { fr: "Russe", en: "Russian", de: "Russisch", zh: "俄语" }, otherNames: ["Русский", "俄文", "俄語"] },
  { code: "nl", names: { fr: "Néerlandais", en: "Dutch", de: "Niederländisch", zh: "荷兰语" }, otherNames: ["Nederlands", "荷蘭語"] },
  { code: "tr", names: { fr: "Turc", en: "Turkish", de: "Türkisch", zh: "土耳其语" }, otherNames: ["Türkçe", "土耳其語"] },
  { code: "pl", names: { fr: "Polonais", en: "Polish", de: "Polnisch", zh: "波兰语" }, otherNames: ["Polski", "波蘭語"] },
  { code: "ro", names: { fr: "Roumain", en: "Romanian", de: "Rumänisch", zh: "罗马尼亚语" }, otherNames: ["Română", "羅馬尼亞語"] },
  { code: "el", names: { fr: "Grec", en: "Greek", de: "Griechisch", zh: "希腊语" }, otherNames: ["Ελληνικά", "希臘語"] },
  { code: "fa", names: { fr: "Persan", en: "Persian", de: "Persisch", zh: "波斯语" }, otherNames: ["Farsi", "فارسی", "波斯語"] },
  { code: "he", names: { fr: "Hébreu", en: "Hebrew", de: "Hebräisch", zh: "希伯来语" }, otherNames: ["עברית", "希伯來語", "希伯来文", "希伯來文"] },
  { code: "hi", names: { fr: "Hindi", en: "Hindi", de: "Hindi", zh: "印地语" }, otherNames: ["हिन्दी", "印地語"] },
  { code: "ur", names: { fr: "Ourdou", en: "Urdu", de: "Urdu", zh: "乌尔都语" }, otherNames: ["اردو", "烏爾都語"] },
  { code: "ja", names: { fr: "Japonais", en: "Japanese", de: "Japanisch", zh: "日语" }, otherNames: ["日本語", "日文"] },
  { code: "ko", names: { fr: "Coréen", en: "Korean", de: "Koreanisch", zh: "韩语" }, otherNames: ["한국어", "韓語", "韩文"] },
] as const;

export type RecruitmentLanguageCode = (typeof RECRUITMENT_LANGUAGES)[number]["code"];

/**
 * The other French names of a language, inflected as its French name
 * (« langue hébraïque », « études hébraïques »): the adjectives in -ique
 * that name it (hébraïque, hellénique, arabique, persique) and « hollandais »
 * for Dutch. The places they also name (golfe Persique, péninsule arabique)
 * are among the texts below that name no language.
 */
const FRENCH_OTHER_NAMES: Partial<Record<RecruitmentLanguageCode, readonly string[]>> = {
  ar: ["Arabique"],
  nl: ["Hollandais"],
  el: ["Hellénique"],
  fa: ["Persique"],
  he: ["Hébraïque"],
};

/** A text as the languages compare it: folded like the admin search (accents, Arabic harakat, ligatures), case aside. */
const foldLanguageText = (text: string) => foldAdminSearchText(text).toLowerCase();

/**
 * Scripts that separate their words with spaces and no prefix: a name written
 * in them is found at the start of a word, and ends it or ends with one of
 * its inflections (« anglais » in « Anglais courant » or « anglaise »,
 * « deutsch » in « Deutschkenntnisse », not « polish » in « polished » nor
 * « german » in « Germany »). An Arabic or Chinese name is found anywhere,
 * Arabic gluing و or ال to the word and Chinese writing no spaces
 * (« 英语（流利） »).
 */
const SPACED_SCRIPT = new RegExp("[\\p{Script=Latin}\\p{Script=Greek}\\p{Script=Cyrillic}]", "u");
const LETTER_OR_DIGIT = new RegExp("[\\p{L}\\p{N}]", "u");

/**
 * The inflections a name takes before its word ends, by the language it is
 * written in, and only those: a French feminine or plural (anglaise,
 * italiennes, grecque, turque, russes), a German ending or the -kenntnisse
 * of a compound (Englischen, Deutschkenntnisse). An English name, or one of
 * the others, takes none: « Germane » is not German, nor « Grèce » Greek.
 */
function nameForms(folded: string, writtenIn: string) {
  const form = (stem: string, endings: string) => ({ stem, ending: new RegExp(`^(?:${endings})(?![\\p{L}\\p{N}])`, "u") });
  if (writtenIn === "de") return [form(folded, "|e|en|er|es|kenntnis|kenntnisse")];
  if (writtenIn !== "fr") return [form(folded, "")];
  if (folded.endsWith("en")) return [form(folded, "|s|ne|nes")];
  // grec, grecque; turc, turque.
  if (folded.endsWith("c")) return [form(folded, "|s|que|ques"), form(folded.slice(0, -1), "que|ques")];
  if (folded.endsWith("e")) return [form(folded, "|s")];
  if (folded.endsWith("s")) return [form(folded, "|e|es")];
  if (folded.endsWith("eu")) return [form(folded, "|x")];
  return [form(folded, "|e|s|es")];
}

/**
 * Places and names that contain a language's name but name no language,
 * blanked out before the names are looked for: « Émirats arabes unis »,
 * « Vereinigte Arabische Emirate », « الإمارات العربية المتحدة », « المملكة
 * العربية السعودية », the Mandarin Oriental hotels. Those that only start
 * like one (Grèce, Germany, Deutschland, Polska) end with no inflection of
 * its name.
 */
const NOT_LANGUAGES = [
  "Émirats arabes", "Arabische Emirate", "الإمارات العربية", "المملكة العربية", "Mandarin Oriental",
  "golfe Persique", "golfe-Persique", "golfe arabo-persique", "golfe Arabique", "péninsule Arabique", "gomme arabique", "République hellénique",
].map(foldLanguageText);

const LANGUAGE_NAMES = RECRUITMENT_LANGUAGES.flatMap(language =>
  [
    ...Object.entries(language.names),
    ...(FRENCH_OTHER_NAMES[language.code] ?? []).map(name => ["fr", name] as const),
    ...language.otherNames.map(name => ["other", name] as const),
  ].map(([writtenIn, name]) => {
    const folded = foldLanguageText(name);
    return { code: language.code as RecruitmentLanguageCode, folded, atWordStart: SPACED_SCRIPT.test(folded), forms: nameForms(folded, writtenIn) };
  }),
);

/** Whether a word starts at this index: the text's start, or after a character that is neither a letter nor a digit. */
const startsWord = (folded: string, index: number) => index === 0 || !LETTER_OR_DIGIT.test(folded[index - 1]!);

function namesLanguage(folded: string, entry: (typeof LANGUAGE_NAMES)[number]) {
  if (!entry.atWordStart) return folded.includes(entry.folded);
  return entry.forms.some(({ stem, ending }) => {
    for (let index = folded.indexOf(stem); index >= 0; index = folded.indexOf(stem, index + 1)) {
      if (startsWord(folded, index) && ending.test(folded.slice(index + stem.length))) return true;
    }
    return false;
  });
}

const OPENING_BRACKETS = "([{（［";
const CLOSING_BRACKETS = ")]}）］";

/** A text with what it says between brackets blanked out, character for character: « Anglais (C1/C2) » is split, or compared, as « Anglais ». */
function blankBrackets(text: string) {
  if (!OPENING_BRACKETS.split("").some(bracket => text.includes(bracket))) return text;
  let depth = 0;
  return text.split("").map(character => {
    if (OPENING_BRACKETS.includes(character)) depth += 1;
    const kept = depth > 0 ? "\u0000" : character;
    if (CLOSING_BRACKETS.includes(character) && depth > 0) depth -= 1;
    return kept;
  }).join("");
}

/**
 * The texts already compared, folded, with the codes of the languages they
 * name and their words outside brackets (`core`, « wolof » for « Wolof
 * (courant) »). The same few names come back for every dossier (the form's
 * fixed list, the names the AI reads), and a mission ranks up to 2 000
 * candidates, a profile checks up to 10 000 dossiers, at each request: each is
 * folded and looked up once. Only texts the length of a language mention, and
 * emptied once full.
 */
type ComparedText = { folded: string; core: string; codes: readonly RecruitmentLanguageCode[]; readonly others: readonly string[] };
const COMPARED_TEXTS = new Map<string, ComparedText>();
const COMPARED_TEXTS_LIMIT = 2_000;
const COMPARED_TEXT_MAX_LENGTH = 200;

function comparedText(text: string): ComparedText {
  const cached = COMPARED_TEXTS.get(text);
  if (cached) return cached;
  const folded = foldLanguageText(text);
  const searched = NOT_LANGUAGES.reduce((current, phrase) => current.replaceAll(phrase, " ".repeat(phrase.length)), folded);
  const codes: RecruitmentLanguageCode[] = [];
  for (const entry of LANGUAGE_NAMES) {
    if (!codes.includes(entry.code) && namesLanguage(searched, entry)) codes.push(entry.code);
  }
  const core = blankBrackets(folded).replaceAll("\u0000", " ").replace(/\s+/g, " ").trim() || folded.trim();
  // The languages the table does not know it names outside brackets, by their codes: read when first asked for.
  let others: readonly string[] | undefined;
  const compared = {
    folded, core, codes: Object.freeze(codes),
    get others() { return (others ??= Object.freeze(otherLanguageCodes(core, blankBrackets(text.normalize("NFC").toLowerCase()).replaceAll("\u0000", " ")))); },
  };
  if (text.length <= COMPARED_TEXT_MAX_LENGTH) {
    if (COMPARED_TEXTS.size >= COMPARED_TEXTS_LIMIT) COMPARED_TEXTS.clear();
    COMPARED_TEXTS.set(text, compared);
  }
  return compared;
}

/**
 * The codes of the languages this text names, in any of the table's names,
 * accents and case aside: « Français » and « French » fr, « Anglais et
 * arabe » en and ar. None for a language the table does not know (« Wolof »)
 * or only part of a name (« fran »).
 */
export function recruitmentLanguageCodes(text: string): readonly RecruitmentLanguageCode[] {
  return comparedText(text).codes;
}

/**
 * A language a matching profile, a mission or the Langue filter requires
 * (IA-02): the codes of the languages of the table it names, none for one the
 * table does not know (« Wolof »), then compared by its words. `anyOf`: the
 * languages of an alternative (« Anglais ou arabe »: Anglais, arabe), any one
 * of which meets it; none when it requires all its languages.
 */
export type RecruitmentLanguageRequirement = { text: string; codes: readonly RecruitmentLanguageCode[]; anyOf: readonly string[] };

/**
 * What separates two required languages: a comma, a slash, a plus, an
 * ampersand… or « et », « and », « und », « y », « e », « 、 ».
 */
const REQUIREMENT_SEPARATOR = new RegExp("[,;/+&|\\n、，；／＋＆]|\\s(?:et|and|und|y|e)\\s", "giu");
/** A conjunction between two Chinese names (« 英语和阿拉伯语 »), that may also be a character of one (埃及, Egypt, in « 埃及阿拉伯语 »). */
const CHINESE_CONJUNCTION = new RegExp("[和及与與]", "gu");
/**
 * A dash between two names (« Anglais - Arabe », « Anglais – Arabe »), that
 * may also introduce a level (« Anglais - courant »): a hyphen or minus sign
 * with a space on at least one side (« Anglais- Arabe », « Anglais -Arabe »),
 * an en, em or two-em dash, a full width or small em dash. Not a hyphen
 * within a word (« serbo-croate »).
 */
const DASH = new RegExp("\\s[-\u2010\u2011\u2212\ufe63]+\\s?|[-\u2010\u2011\u2212\ufe63]+\\s|[\u2012-\u2015\u2e3a\u2e3b\ufe58\uff0d]+", "gu");
/** What separates two languages only when each side names one. */
const BETWEEN_NAMES = new RegExp(`${CHINESE_CONJUNCTION.source}|${DASH.source}`, "gu");
/** What makes a required text an alternative: « ou », « or », « oder », « o », « et/ou », « and/or », « 或 ». */
const ALTERNATIVE = new RegExp("(?:^|[\\s/／])(?:ou|or|oder|o)(?=[\\s/／]|$)|或", "iu");
/** What separates the languages of an alternative: a separator above, « ou », « or », « oder », « o », « 或 », « 或者 »… */
const OPTION_SEPARATOR = new RegExp(`${REQUIREMENT_SEPARATOR.source}|\\s(?:ou|or|oder|o)\\s|或者?`, "giu");
/** The word left at either end of a language by a separator in « et/ou », « and/or ». */
const OPTION_CONNECTOR = new RegExp("^(?:et|and|und|y|e|ou|or|oder|o)\\s+|\\s+(?:et|and|und|y|e|ou|or|oder|o)$", "giu");

/** The required texts already split, as the compared texts above. */
const READ_REQUIREMENTS = new Map<string, readonly RecruitmentLanguageRequirement[]>();

/**
 * IA-02: the languages the table does not know, by their ISO 639-1 code, and
 * Kabyle, Moroccan and Central Atlas Tamazight, Tachelhit and Filipino:
 * their names make a part beside a dash a language of its own (« Wolof –
 * Anglais »), where any other part qualifies the language beside it
 * (« Anglais – obligatoire », « Arabe – Golfe », « Portugais – Brésil »).
 * Then, by their ISO 639-2 or 639-3 code, the other languages of the
 * countries the candidates and the missions come from, which ISO 639-1 has
 * no code for: Cantonese, Hakka and Min Nan, Dari, Sorani and Kurmanji, Tigre;
 * Cebuano, Hiligaynon, Ilocano, Waray, Bikol and Pangasinan; Pulaar, Dioula,
 * Tshiluba, Northern Sotho, Soninke, Fon, Krio, Nigerian Pidgin, Luo,
 * Kamba, Kalenjin, Bemba, Nyankole, Kiga, Tumbuka, Lozi, Kimbundu, Umbundu,
 * Susu, Mende, Temne, Tiv, Efik, Ibibio, Edo and Ewondo; the creoles of
 * Mauritius, the Seychelles, Jamaica and Cape Verde, Papiamento, Sranan;
 * Hmong; Bhojpuri, Maithili, Konkani, Santali, Manipuri, Rajasthani, Awadhi,
 * Magahi, Dogri, Bodo and Mizo; Minangkabau, Balinese, Madurese, Buginese,
 * Sasak, Tetum and Tok Pisin. Not those whose name is mostly a place's
 * (Douala, Bassa, Lunda, Aceh, Banjar, Pampanga) or, accents aside, a word
 * (« moré », Mooré: « more », read with its accent only, below), nor Swiss
 * German, a variety of German. Not
 * the table's, nor the constructed or ancient languages, whose names also
 * qualify a language or a place (« Amérique latine », « 世界语言 »): Latin,
 * Sanskrit, Pali, Avestan, Church Slavic, Esperanto, Ido, Interlingua,
 * Interlingue, Volapük.
 */
const OTHER_LANGUAGE_CODES = [
  "aa ab af ak am an as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cv cy da dv dz ee et eu ff fi fj fo fy ga gd gl gn gu gv ha ho hr ht hu hy hz",
  "id ig ii ik is iu jv ka kg ki kj kk kl km kn kr ks ku kv kw ky lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nn no nr nv ny oc oj om",
  "or os pa ps qu rm rn rw sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to ts tt tw ty ug uk uz ve vi wa wo xh yi yo za zu",
  "kab zgh tzm shi fil",
  "yue hak nan prs ckb kmr tig ceb hil ilo war bik pag fuc dyu lua nso snk fon kri pcm luo kam kln bem nyn cgg tum loz kmb umb sus men tem tiv efi ibb bin ewo",
  "mfe crs jam kea pap srn hmn bho mai kok sat mni raj awa mag doi brx lus min ban mad bug sas tet tpi",
].join(" ").split(" ");
/** The languages their names are read in, from Intl.DisplayNames: the table's four. */
const OTHER_LANGUAGE_LOCALES = ["fr", "en", "de", "zh"];
/**
 * The names it gives none of, or other names than its, each with the code (or
 * the codes) of the language it names: serbo-croate (« serbe (latin) »),
 * berbère, amazigh, tagalog (« filipino »); and the names these languages are
 * written under, which it gives in full or under another name: Twi and Fante
 * (« akan »), Luganda (« ganda »), Kirundi (« roundi »), Sotho and Ndebele
 * (« sotho du Sud », « North Ndebele »), créole (« créole haïtien », and the
 * creoles above), frison (« frison occidental »), gaélique (« gaélique
 * écossais »), Pulaar and Fulfulde (« peul »), Jula (« dioula »), Tshiluba
 * (« luba-kasaï »), Sorani (« Central Kurdish »), Kurmanji, Kapampangan,
 * Bisaya, Mooré, the languages of southern Africa under their own names
 * (Setswana, isiZulu…), Hokkien, and Cantonese, also where Intl.DisplayNames
 * is missing, and as 广东话 or 粵語. And the usual names it does not give: the
 * English names of ISO 639 (Pushto, Panjabi, Fulah), the spellings in use
 * (Pashtu, Azeri, Nepalese, Fulani), the names the candidates write their
 * language under (Bahasa Indonesia, Bahasa Melayu, Afaan Oromoo, Bamanankan,
 * Pular, Shqip, Frysk, پښتو, الكردية, الأمازيغية, السواحيلية, አማርኛ,
 * Українська), and French names (azéri, malinké, comorien, pidgin).
 */
const OTHER_LANGUAGE_NAMES: ReadonlyArray<readonly [codes: string, ...names: string[]]> = [
  ["hbs", "Serbo-croate", "Serbo-Croatian", "Serbokroatisch", "塞尔维亚-克罗地亚语"],
  ["ber", "Berbère", "Berber", "Berberisch", "柏柏尔语", "Amazigh", "Amazighe", "Tamazight"],
  ["tl", "Tagalog", "他加禄语"],
  ["sw", "Kiswahili"],
  ["si", "Sinhalese"],
  ["tw", "Twi", "Asante Twi", "契维语"],
  ["fat", "Fante", "Fanti"],
  ["lg", "Luganda"],
  ["rn", "Kirundi", "Kiroundi", "Ikirundi"],
  ["st", "Sotho", "Sesotho", "索托语"],
  ["nd nr", "Ndebele", "Ndébélé", "isiNdebele", "恩德贝勒语"],
  ["ht mfe crs jam kea", "Créole", "Creole", "Kreyòl", "Kreol", "Kreolisch", "克里奥尔语"],
  ["fy", "Frison", "Frisian", "Friesisch", "弗里西亚语"],
  ["gd", "Gaélique", "Gaelic", "Gälisch", "盖尔语"],
  ["fuc", "Pulaar", "Poular"],
  ["ff", "Fulfulde", "Peulh"],
  ["dyu", "Jula"],
  ["lua", "Tshiluba", "Ciluba"],
  ["ckb", "Sorani"],
  ["kmr", "Kurmanji", "Kurmandji", "Kurmancî"],
  ["pam", "Kapampangan"],
  ["ceb", "Bisaya", "Visayan"],
  ["tn", "Setswana"],
  ["ss", "Siswati"],
  ["zu", "isiZulu"],
  ["xh", "isiXhosa"],
  ["ve", "Tshivenda"],
  ["ts", "Xitsonga"],
  ["ny", "Chichewa"],
  ["kg", "Kikongo"],
  ["rw", "Kinyarwanda"],
  ["mos", "Mooré", "Mossi"],
  ["yue", "Cantonais", "Cantonese", "Kantonesisch", "粤语", "广东话", "廣東話", "粵語"],
  ["nan", "Hokkien"],
  ["ps", "Pushto", "Pashtu", "Pakhto", "پښتو"],
  ["pa", "Panjabi"],
  ["az", "Azeri", "Azéri", "Aseri"],
  ["id", "Bahasa Indonesia"],
  ["ms", "Bahasa Melayu", "Bahasa Malaysia"],
  ["ne", "Nepalese"],
  ["ff", "Fulani", "Fulah"],
  ["ku", "الكردية", "Kurdî", "Kurdi"],
  ["ber", "الأمازيغية", "ⵜⴰⵎⴰⵣⵉⵖⵜ"],
  ["sw", "السواحيلية"],
  ["man", "Malinké", "Malinke", "Maninka", "Mandinka", "Mandingue", "Mandingo"],
  ["zdj wni swb wlc", "Comorien", "Comorian", "Shikomori", "Komorisch"],
  ["pcm", "Pidgin"],
  ["om", "Afaan Oromoo", "Oromiffa"],
  ["am", "Amharigna", "Amarigna", "አማርኛ"],
  ["ti", "Tigrigna", "ትግርኛ"],
  ["bm", "Bamanankan"],
  ["fuf", "Pular"],
  ["yue", "Yue"],
  ["gd", "Gàidhlig"],
  ["fy", "Frysk"],
  ["si", "Singhalese"],
  ["sq", "Shqip"],
  ["uk", "Українська"],
];

/** Names of a language that are words accents aside (« moré », « more »): found only as written, with their accents, case aside. */
const ACCENTED_NAMES: ReadonlyArray<readonly [code: string, name: string]> = [["mos", "moré"]];

/**
 * The languages of a macrolanguage or a family the table does not know, by
 * its code: a requirement of it is met by each of them (« Kurde » by Sorani
 * and Kurmanji, « Serbo-croate » by Serbian, Croatian and Bosnian, « Berbère »
 * by Kabyle, Tachelhit and Tamazight, « Peul » by Pulaar), not the reverse.
 */
const MEMBER_LANGUAGES: Readonly<Record<string, readonly string[]>> = {
  ku: ["ckb", "kmr", "sdh"],
  hbs: ["sr", "hr", "bs", "cnr"],
  ber: ["kab", "shi", "tzm", "zgh", "rif"],
  ff: ["fuc", "fuf", "fuv"],
  man: ["emk", "mnk"],
};

/** Each name of a language the table does not know, folded, and the codes of the languages it names. */
let otherLanguageNames: ReadonlyMap<string, readonly string[]> | undefined;

/**
 * The names of the languages above, folded, what they say between brackets
 * aside (« luba-katanga (kiluba) », « Norwegisch (Bokmål) »), from two
 * letters in Chinese and three in the other scripts, each with the code of the
 * language Intl.DisplayNames gives it for, or that the list above gives it:
 * « cantonais », « Cantonese », « Kantonesisch » and « 粤语 » are all yue. Only
 * the list above where Intl.DisplayNames is missing (a browser or a Node.js
 * built without its data).
 */
function readOtherLanguageNames() {
  const names = new Map<string, string[]>();
  const add = (name: string | undefined, code: string) => {
    const folded = foldLanguageText(name?.replace(/[(（][^)）]*[)）]/g, " ") ?? "").replace(/\s+/g, " ").trim();
    const letters = Array.from(folded).filter(character => LETTER_OR_DIGIT.test(character)).length;
    if (letters < (SPACED_SCRIPT.test(folded) ? 3 : 2)) return;
    const codes = names.get(folded);
    if (!codes) names.set(folded, [code]);
    else if (!codes.includes(code)) codes.push(code);
  };
  if (typeof Intl.DisplayNames === "function") {
    for (const locale of OTHER_LANGUAGE_LOCALES) {
      try {
        const display = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
        for (const code of OTHER_LANGUAGE_CODES) add(display.of(code), code);
      } catch {
        // A locale or a code this host cannot name: the others and the list below.
      }
    }
  }
  for (const [codes, ...written] of OTHER_LANGUAGE_NAMES) for (const name of written) for (const code of codes.split(" ")) add(name, code);
  return names;
}

/**
 * The codes of the languages the table does not know this folded text names,
 * by one of their names found whole in it (« yue » for « Cantonese » as for
 * « cantonais courant », « gd » for « Gaelic »); none for any other text.
 */
function otherLanguageCodes(folded: string, written: string) {
  otherLanguageNames ??= readOtherLanguageNames();
  const codes: string[] = [];
  otherLanguageNames.forEach((named, name) => {
    if (!containsWords(folded, name)) return;
    for (const code of named) if (!codes.includes(code)) codes.push(code);
  });
  for (const [code, name] of ACCENTED_NAMES) if (!codes.includes(code) && containsWords(written, name)) codes.push(code);
  return codes;
}

/**
 * Whether a part names a language the table does not know: one of the names
 * above, whole (« Wolof », « Wolof courant », « Serbo-croate »; not « Brésil »,
 * « Golfe », « obligatoire »).
 */
function namesOtherLanguage(text: string) {
  return comparedText(text).others.length > 0;
}

/**
 * The parts of a text at a Chinese conjunction or a dash, each that names a
 * language with the parts after it that name none, which qualify it: a level
 * (« Anglais - C1 - Arabe » is « Anglais - C1 » and « Arabe »), a requirement
 * (« Anglais – obligatoire »), a variety or a region (« Arabe – Golfe »,
 * « Portugais – Brésil »). And the parts before the first one that names one
 * with it (埃 in 埃及阿拉伯语, Egyptian Arabic). A language the table does not
 * know is named by its name (« Wolof – Anglais » and « Serbo-croate –
 * Anglais » are two, as with « / »).
 */
function partsBetweenNames(text: string) {
  const groups: Array<{ start: number; end: number; names: boolean }> = [];
  let cursor = 0;
  for (const part of partsOutsideBrackets(text, BETWEEN_NAMES)) {
    const start = text.indexOf(part, cursor);
    cursor = start + part.length;
    const names = recruitmentLanguageCodes(part).length > 0 || namesOtherLanguage(part);
    const last = groups.at(-1);
    if (last && (!names || !last.names)) Object.assign(last, { end: cursor, names: names || last.names });
    else groups.push({ start, end: cursor, names });
  }
  return groups.map(({ start, end }) => text.slice(start, end));
}

/** The parts of a text between the separators found outside its brackets, each trimmed, those with a letter or a digit. */
function partsOutsideBrackets(text: string, separator: RegExp) {
  const parts: string[] = [];
  let start = 0;
  const outside = blankBrackets(text);
  separator.lastIndex = 0;
  for (let found = separator.exec(outside); found; found = separator.exec(outside)) {
    parts.push(text.slice(start, found.index));
    start = found.index + found[0].length;
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(part => LETTER_OR_DIGIT.test(part));
}

/**
 * The languages a required text names, each a requirement of its own
 * (« Anglais/Arabe », « anglais et arabe », « Englisch und Arabisch »,
 * « Anglais - Arabe », « 英语和阿拉伯语 »: two), so that the matching
 * profiles, the missions and the Langue filter count them alike. Not split
 * inside brackets (« Anglais (C1/C2) » is one), nor at a Chinese conjunction
 * or a dash before a part that names no language (« Anglais - courant » is
 * one). A part that names several languages without a separator (« anglais
 * arabe ») requires them all; a text that offers a choice (« Anglais ou
 * arabe », « anglais et/ou arabe ») is one requirement, met by any of its
 * languages.
 */
export function recruitmentLanguageRequirements(required: string): readonly RecruitmentLanguageRequirement[] {
  // A profile reads its requirements again for each of its 10 000 dossiers: each text is split once.
  const cached = READ_REQUIREMENTS.get(required);
  if (cached) return cached;
  let requirements: RecruitmentLanguageRequirement[];
  if (ALTERNATIVE.test(blankBrackets(required))) {
    const text = required.trim();
    const anyOf = partsOutsideBrackets(text, OPTION_SEPARATOR).map(option => option.replace(OPTION_CONNECTOR, "")).filter(option => LETTER_OR_DIGIT.test(option));
    requirements = anyOf.length ? [{ text, codes: recruitmentLanguageCodes(text), anyOf }] : [];
  } else {
    requirements = partsOutsideBrackets(required, REQUIREMENT_SEPARATOR).flatMap(partsBetweenNames)
      .map(text => ({ text, codes: recruitmentLanguageCodes(text), anyOf: [] }));
  }
  if (required.length <= COMPARED_TEXT_MAX_LENGTH) {
    if (READ_REQUIREMENTS.size >= COMPARED_TEXTS_LIMIT) READ_REQUIREMENTS.clear();
    READ_REQUIREMENTS.set(required, Object.freeze(requirements));
  }
  return requirements;
}

/**
 * The codes of the languages one of whose names starts with this text, from
 * its third letter (« angl », « arab », « fran »): the Langue filter of the
 * Candidatures, which looks as the admin types, finds the language before its
 * name is typed whole. None for a shorter text.
 */
export function recruitmentLanguagePrefixCodes(text: string): RecruitmentLanguageCode[] {
  const folded = foldLanguageText(text).trim();
  if (folded.split("").filter(character => LETTER_OR_DIGIT.test(character)).length < 3) return [];
  return Array.from(new Set(LANGUAGE_NAMES.filter(entry => entry.folded.startsWith(folded)).map(entry => entry.code)));
}

/** Whether these folded words (a language the table does not know) are found whole in this folded name: « wolof » in « Wolof courant », not « fran » in « français ». */
function containsWords(folded: string, words: string) {
  if (!LETTER_OR_DIGIT.test(words)) return false;
  if (!SPACED_SCRIPT.test(words)) return folded.includes(words);
  for (let index = folded.indexOf(words); index >= 0; index = folded.indexOf(words, index + 1)) {
    if (startsWord(folded, index) && !LETTER_OR_DIGIT.test(folded[index + words.length] ?? "")) return true;
  }
  return false;
}

/**
 * Whether a name gives a language the table does not know: by the code of a
 * language both name (« Cantonese » or « 粤语 » for « Cantonais », the form
 * recording it in the page's language, the AI in the CV's), or of one of the
 * languages of the macrolanguage or the family it requires (« Sorani » for
 * « Kurde », « Serbian » for « Serbo-croate »), or by its words,
 * those of one whole in the other's, what they say between brackets aside.
 */
function givesOtherLanguage(name: ComparedText, required: ComparedText) {
  if (required.codes.length) return false;
  if (required.others.some(code => name.others.includes(code) || (MEMBER_LANGUAGES[code] ?? []).some(member => name.others.includes(member)))) return true;
  return containsWords(name.folded, required.core) || (!name.codes.length && containsWords(required.folded, name.core));
}

/**
 * Whether this name (one of a candidate's languages) gives a language of the
 * requirement: one of its codes (« Arabic » for « Arabe », not « English
 * (polished) » for « Polonais » nor « Germany » for « Allemand »), or, for a
 * language the table does not know, the code of one of its names
 * (« Cantonese » for « Cantonais ») or the words of one whole in the other's,
 * what they say between brackets aside (« Wolof » for « Wolof courant » or
 * « Wolof (courant) », and the reverse; not « Wolofs »). An alternative
 * (« Wolof ou anglais ») is given by any of its languages.
 */
export function givesRequiredLanguage(name: string, requirement: RecruitmentLanguageRequirement) {
  const compared = comparedText(name);
  if (compared.codes.some(code => requirement.codes.includes(code))) return true;
  if (requirement.anyOf.length) return requirement.anyOf.some(option => givesOtherLanguage(compared, comparedText(option)));
  return givesOtherLanguage(compared, comparedText(requirement.text));
}

/**
 * Whether these names (a candidate's languages) meet the requirement, each of
 * its languages given by one of them (« anglais arabe » by « English » and
 * « العربية »), or one of them for an alternative.
 */
export function meetsRequiredLanguage(names: string[], requirement: RecruitmentLanguageRequirement) {
  return requirement.codes.length && !requirement.anyOf.length
    ? requirement.codes.every(code => names.some(name => recruitmentLanguageCodes(name).includes(code)))
    : names.some(name => givesRequiredLanguage(name, requirement));
}
