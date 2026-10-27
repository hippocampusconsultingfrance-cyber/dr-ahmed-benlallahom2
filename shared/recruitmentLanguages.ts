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
  { code: "ar", names: { fr: "Arabe", en: "Arabic", de: "Arabisch", zh: "阿拉伯语" }, otherNames: ["العربية", "عربي", "阿拉伯文", "阿拉伯語"] },
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
 * in them is found at the start of a word (« anglais » in « Anglais courant »
 * or « anglaise », « deutsch » in « Deutschkenntnisse »). An Arabic or Chinese
 * name is found anywhere, Arabic gluing و or ال to the word and Chinese writing
 * no spaces (« 英语（流利） »).
 */
const SPACED_SCRIPT = new RegExp("[\\p{Script=Latin}\\p{Script=Greek}\\p{Script=Cyrillic}]", "u");
const LETTER_OR_DIGIT = new RegExp("[\\p{L}\\p{N}]", "u");

const LANGUAGE_NAMES = RECRUITMENT_LANGUAGES.flatMap(language =>
  [...Object.values(language.names), ...language.otherNames].map(name => {
    const folded = foldLanguageText(name);
    return { code: language.code as RecruitmentLanguageCode, name, folded, atWordStart: SPACED_SCRIPT.test(folded) };
  }),
);

function namesLanguage(folded: string, entry: (typeof LANGUAGE_NAMES)[number]) {
  if (!entry.atWordStart) return folded.includes(entry.folded);
  for (let index = folded.indexOf(entry.folded); index >= 0; index = folded.indexOf(entry.folded, index + 1)) {
    if (index === 0 || !LETTER_OR_DIGIT.test(folded[index - 1]!)) return true;
  }
  return false;
}

/**
 * The codes of the languages this text names, in any of the table's names,
 * accents and case aside: « Français » and « French » fr, « Anglais et
 * arabe » en and ar. None for a language the table does not know (« Wolof »)
 * or only part of a name (« fran »).
 */
export function recruitmentLanguageCodes(text: string): RecruitmentLanguageCode[] {
  const folded = foldLanguageText(text);
  const codes: RecruitmentLanguageCode[] = [];
  for (const entry of LANGUAGE_NAMES) {
    if (!codes.includes(entry.code) && namesLanguage(folded, entry)) codes.push(entry.code);
  }
  return codes;
}

/** Whether these two texts name a same language of the table: « Arabe » and « Arabic », « Anglais » and « 英语 ». */
export function sameRecruitmentLanguage(left: string, right: string) {
  const leftCodes = recruitmentLanguageCodes(left);
  return leftCodes.length > 0 && recruitmentLanguageCodes(right).some(code => leftCodes.includes(code));
}

/**
 * Whether these names (a candidate's languages) give every language of the
 * table the required text names: « Anglais » by « English », « Anglais et
 * arabe » by « English » and « العربية ». False when the required text names
 * none of them: the caller compares its letters instead.
 */
export function holdsRecruitmentLanguages(names: string[], required: string) {
  const requiredCodes = recruitmentLanguageCodes(required);
  const held = new Set(names.flatMap(recruitmentLanguageCodes));
  return requiredCodes.length > 0 && requiredCodes.every(code => held.has(code));
}

/**
 * Every name of the languages this term names, for a filter that searches the
 * stored text (« arabe »: Arabe, Arabic, Arabisch, 阿拉伯语, العربية…), empty
 * when it names none.
 */
export function recruitmentLanguageNames(term: string): string[] {
  const codes = recruitmentLanguageCodes(term);
  return Array.from(new Set(LANGUAGE_NAMES.filter(entry => codes.includes(entry.code)).map(entry => entry.name)));
}
