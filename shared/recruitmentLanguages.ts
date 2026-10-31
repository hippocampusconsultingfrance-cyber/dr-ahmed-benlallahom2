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
  { code: "he", names: { fr: "Hébreu", en: "Hebrew", de: "Hebräisch", zh: "希伯来语" }, otherNames: ["עברית", "希伯來語"] },
  { code: "hi", names: { fr: "Hindi", en: "Hindi", de: "Hindi", zh: "印地语" }, otherNames: ["हिन्दी", "印地語"] },
  { code: "ur", names: { fr: "Ourdou", en: "Urdu", de: "Urdu", zh: "乌尔都语" }, otherNames: ["اردو", "烏爾都語"] },
  { code: "ja", names: { fr: "Japonais", en: "Japanese", de: "Japanisch", zh: "日语" }, otherNames: ["日本語", "日文"] },
  { code: "ko", names: { fr: "Coréen", en: "Korean", de: "Koreanisch", zh: "韩语" }, otherNames: ["한국어", "韓語", "韩文"] },
] as const;

export type RecruitmentLanguageCode = (typeof RECRUITMENT_LANGUAGES)[number]["code"];

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
const NOT_LANGUAGES = ["Émirats arabes", "Arabische Emirate", "الإمارات العربية", "المملكة العربية", "Mandarin Oriental"].map(foldLanguageText);

const LANGUAGE_NAMES = RECRUITMENT_LANGUAGES.flatMap(language =>
  [...Object.entries(language.names), ...language.otherNames.map(name => ["other", name] as const)].map(([writtenIn, name]) => {
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

/**
 * The texts already compared, folded, with the codes of the languages they
 * name. The same few names come back for every dossier (the form's fixed
 * list, the names the AI reads), and a mission ranks up to 2 000 candidates,
 * a profile checks up to 10 000 dossiers, at each request: each is folded and
 * looked up once. Only texts the length of a language mention, and emptied
 * once full.
 */
type ComparedText = { folded: string; codes: readonly RecruitmentLanguageCode[] };
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
  const compared = { folded, codes: Object.freeze(codes) };
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
 * table does not know (« Wolof »), then compared by its words.
 */
export type RecruitmentLanguageRequirement = { text: string; codes: readonly RecruitmentLanguageCode[] };

/**
 * What separates two required languages: a comma, a slash, a plus, an
 * ampersand… or « et », « and », « und », « y », « e », « 和 », « 、 ».
 */
const REQUIREMENT_SEPARATOR = "[,;/+&|\\n、，；／＋＆]|\\s(?:et|and|und|y|e)\\s|[和及与與]";
const OPENING_BRACKETS = "([{（［";
const CLOSING_BRACKETS = ")]}）］";

/**
 * The languages a required text names, each a requirement of its own
 * (« Anglais/Arabe », « anglais et arabe », « Englisch und Arabisch »,
 * « 英语和阿拉伯语 »: two), so that the matching profiles, the missions and
 * the Langue filter count them alike. Not split inside brackets (« Anglais
 * (C1/C2) » is one). A part that names several languages without a separator
 * (« anglais arabe ») requires them all.
 */
export function recruitmentLanguageRequirements(required: string): RecruitmentLanguageRequirement[] {
  let depth = 0;
  const outsideBrackets = required.split("").map(character => {
    if (OPENING_BRACKETS.includes(character)) depth += 1;
    const kept = depth > 0 ? "\u0000" : character;
    if (CLOSING_BRACKETS.includes(character) && depth > 0) depth -= 1;
    return kept;
  }).join("");
  const parts: string[] = [];
  const separators = new RegExp(REQUIREMENT_SEPARATOR, "giu");
  let start = 0;
  for (let separator = separators.exec(outsideBrackets); separator; separator = separators.exec(outsideBrackets)) {
    parts.push(required.slice(start, separator.index));
    start = separator.index + separator[0].length;
  }
  parts.push(required.slice(start));
  return parts.map(part => part.trim()).filter(part => LETTER_OR_DIGIT.test(part)).map(text => ({ text, codes: recruitmentLanguageCodes(text) }));
}

/** Whether these folded words (a language the table does not know) are found whole in this folded name: « wolof » in « Wolof courant », not « fran » in « français ». */
function containsWords(folded: string, words: string) {
  if (!words) return false;
  if (!SPACED_SCRIPT.test(words)) return folded.includes(words);
  for (let index = folded.indexOf(words); index >= 0; index = folded.indexOf(words, index + 1)) {
    if (startsWord(folded, index) && !LETTER_OR_DIGIT.test(folded[index + words.length] ?? "")) return true;
  }
  return false;
}

/**
 * Whether this name (one of a candidate's languages) gives a language of the
 * requirement: one of its codes (« Arabic » for « Arabe », not « English
 * (polished) » for « Polonais » nor « Germany » for « Allemand »), or the
 * words of one the table does not know, whole.
 */
export function givesRequiredLanguage(name: string, requirement: RecruitmentLanguageRequirement) {
  const compared = comparedText(name);
  return requirement.codes.length
    ? compared.codes.some(code => requirement.codes.includes(code))
    : containsWords(compared.folded, comparedText(requirement.text).folded.trim());
}

/**
 * Whether these names (a candidate's languages) meet the requirement, each of
 * its languages given by one of them: « anglais arabe » by « English » and
 * « العربية ».
 */
export function meetsRequiredLanguage(names: string[], requirement: RecruitmentLanguageRequirement) {
  return requirement.codes.length
    ? requirement.codes.every(code => names.some(name => recruitmentLanguageCodes(name).includes(code)))
    : names.some(name => givesRequiredLanguage(name, requirement));
}
