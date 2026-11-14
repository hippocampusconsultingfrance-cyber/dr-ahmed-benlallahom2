import { foldAdminSearchText } from "./adminSearchFolding";

/**
 * IA-02: the languages the recruitment screens compare, by ISO 639-1 code,
 * with their names in French, English, German and Chinese, then the other
 * names they are written under (the language's own name, a traditional
 * Chinese spelling, the short Chinese names 阿语, 西语, 葡语, 意语 and 荷语,
 * 朝鲜语…). The application form records them in English (French,
 * Arabic), even from its French page; an admin types them in French
 * (Français, francais); the AI reads them in the CV's language (Deutsch,
 * العربية, 中文). The matching profiles, the missions and the Langue filter
 * of the Candidatures compare these codes, so that « Français » finds
 * « French » and « Arabe » finds « Arabic ».
 */
export const RECRUITMENT_LANGUAGES = [
  { code: "fr", names: { fr: "Français", en: "French", de: "Französisch", zh: "法语" }, otherNames: ["法文", "法語"] },
  { code: "en", names: { fr: "Anglais", en: "English", de: "Englisch", zh: "英语" }, otherNames: ["英文", "英語"] },
  { code: "ar", names: { fr: "Arabe", en: "Arabic", de: "Arabisch", zh: "阿拉伯语" }, otherNames: ["العربية", "عربي", "عربی", "阿拉伯文", "阿拉伯語", "阿语", "阿語"] },
  { code: "es", names: { fr: "Espagnol", en: "Spanish", de: "Spanisch", zh: "西班牙语" }, otherNames: ["Español", "Castellano", "西班牙文", "西班牙語", "西语", "西語"] },
  { code: "pt", names: { fr: "Portugais", en: "Portuguese", de: "Portugiesisch", zh: "葡萄牙语" }, otherNames: ["Português", "葡萄牙文", "葡萄牙語", "葡语", "葡語"] },
  { code: "de", names: { fr: "Allemand", en: "German", de: "Deutsch", zh: "德语" }, otherNames: ["德文", "德語"] },
  { code: "zh", names: { fr: "Chinois", en: "Chinese", de: "Chinesisch", zh: "中文" }, otherNames: ["Mandarin", "汉语", "漢語", "普通话", "普通話", "华语", "華語"] },
  { code: "it", names: { fr: "Italien", en: "Italian", de: "Italienisch", zh: "意大利语" }, otherNames: ["Italiano", "意大利文", "義大利語", "意语", "意語"] },
  { code: "ru", names: { fr: "Russe", en: "Russian", de: "Russisch", zh: "俄语" }, otherNames: ["Русский", "俄文", "俄語"] },
  { code: "nl", names: { fr: "Néerlandais", en: "Dutch", de: "Niederländisch", zh: "荷兰语" }, otherNames: ["Nederlands", "荷蘭語", "荷语", "荷語"] },
  { code: "tr", names: { fr: "Turc", en: "Turkish", de: "Türkisch", zh: "土耳其语" }, otherNames: ["Türkçe", "土耳其語"] },
  { code: "pl", names: { fr: "Polonais", en: "Polish", de: "Polnisch", zh: "波兰语" }, otherNames: ["Polski", "波蘭語"] },
  { code: "ro", names: { fr: "Roumain", en: "Romanian", de: "Rumänisch", zh: "罗马尼亚语" }, otherNames: ["Română", "羅馬尼亞語"] },
  { code: "el", names: { fr: "Grec", en: "Greek", de: "Griechisch", zh: "希腊语" }, otherNames: ["Ελληνικά", "希臘語"] },
  { code: "fa", names: { fr: "Persan", en: "Persian", de: "Persisch", zh: "波斯语" }, otherNames: ["Farsi", "فارسی", "波斯語"] },
  { code: "he", names: { fr: "Hébreu", en: "Hebrew", de: "Hebräisch", zh: "希伯来语" }, otherNames: ["עברית", "希伯來語", "希伯来文", "希伯來文"] },
  { code: "hi", names: { fr: "Hindi", en: "Hindi", de: "Hindi", zh: "印地语" }, otherNames: ["हिन्दी", "印地語"] },
  { code: "ur", names: { fr: "Ourdou", en: "Urdu", de: "Urdu", zh: "乌尔都语" }, otherNames: ["اردو", "烏爾都語"] },
  { code: "ja", names: { fr: "Japonais", en: "Japanese", de: "Japanisch", zh: "日语" }, otherNames: ["日本語", "日文"] },
  { code: "ko", names: { fr: "Coréen", en: "Korean", de: "Koreanisch", zh: "韩语" }, otherNames: ["한국어", "韓語", "韩文", "朝鲜语", "朝鮮語"] },
] as const;

export type RecruitmentLanguageCode = (typeof RECRUITMENT_LANGUAGES)[number]["code"];

/**
 * The other French names of a language, inflected as its French name
 * (« langue hébraïque », « études hébraïques »): the adjectives in -ique
 * that name it (hébraïque, hellénique, arabique, persique), « hollandais »
 * for Dutch and « castillan » for Spanish (IA02-R6). The places they also
 * name (golfe Persique, péninsule arabique) are among the texts below that
 * name no language.
 */
const FRENCH_OTHER_NAMES: Partial<Record<RecruitmentLanguageCode, readonly string[]>> = {
  ar: ["Arabique"],
  es: ["Castillan"],
  nl: ["Hollandais"],
  el: ["Hellénique"],
  fa: ["Persique"],
  he: ["Hébraïque"],
};

/**
 * IA02-R7: the other names a language of the table is usually written
 * under, in the language they are written in (with its inflections) or in
 * none: Castilian and Kastilisch for Spanish; Putonghua, Hochchinesisch and
 * 国语 (國語) for Chinese; 韩国语 (韓國語) for Korean; Hocharabisch, Fusha,
 * Khaleeji and Golfarabisch for Arabic (Modern Standard Arabic names it
 * already); Hochdeutsch for German; Flemish (flamand, Flämisch, 弗拉芒语),
 * Dutch as Belgium writes it, as Intl.DisplayNames names it. They name the
 * language as its names do, but only as a name of their own: a word they
 * start with (« Golf », « Hoch », « Standard », « Flam ») is no language
 * being typed in the Langue filter; a place named with one is no language
 * (« Brabant flamand », « Flemish Region », below); 国语 is Mandarin only
 * where 国 starts a word (below: « 所在国语言 » is the host country's
 * language). Not an acronym that also names other things: « MSA » is also an
 * insurer, a degree or a certificate (« Français – MSA »).
 */
const USUAL_OTHER_NAMES: ReadonlyArray<readonly [code: RecruitmentLanguageCode, writtenIn: "fr" | "en" | "de" | "zh" | "other", ...names: string[]]> = [
  ["es", "en", "Castilian"],
  ["es", "de", "Kastilisch"],
  ["zh", "other", "Putonghua"],
  ["zh", "de", "Hochchinesisch", "Standardchinesisch"],
  ["zh", "zh", "国语", "國語"],
  ["ko", "zh", "韩国语", "韓國語"],
  ["ar", "other", "Fusha", "Fus'ha", "Fuṣḥā", "Khaleeji", "Khaliji"],
  ["ar", "de", "Hocharabisch", "Standardarabisch", "Golfarabisch"],
  ["de", "de", "Hochdeutsch"],
  ["nl", "fr", "Flamand"],
  ["nl", "en", "Flemish"],
  ["nl", "de", "Flämisch"],
  ["nl", "zh", "弗拉芒语"],
];

/**
 * The Hebrew points and cantillation marks (U+0591–U+05C7, not the maqaf,
 * paseq, sof pasuq and nun hafukha): « ייִדיש », Yiddish as Intl.DisplayNames
 * writes it, is « יידיש » as it is usually typed, « עִבְרִית » is « עברית ».
 */
const HEBREW_POINTS = /[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g;

/** A text as the languages compare it: folded like the admin search (accents, Arabic harakat, ligatures) and without Hebrew points, case aside. */
const foldLanguageText = (text: string) => foldAdminSearchText(text).replace(HEBREW_POINTS, "").toLowerCase();

/** A name as the lists of names hold it: folded, what it says between brackets aside, its spaces single. */
const foldListedName = (name: string) => foldLanguageText(name.replace(/[(（][^)）]*[)）]/g, " ")).replace(/\s+/g, " ").trim();

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
 * its name. IA02-R5: the seas, the states and the regions named with the
 * name of a language of the table, in French, English and German (« Persian
 * Gulf », « Russian Federation », « Dutch Caribbean », « Suisse italienne »,
 * « Kurdistan turc », « monde arabe »), with the countries and territories
 * Intl.DisplayNames names so (« Polynésie française », « French Guiana »,
 * « Französisch-Polynesien », « Îles Turques-et-Caïques »), which are also
 * listed here where it is missing. IA02-R6: the Gulf and the Arab world as
 * they are also written (« golfe arabe », « arabischer Raum »). IA02-R7: the
 * Flemish places, named with Flemish, another name of Dutch (« Brabant
 * flamand », « Communauté flamande », « Flemish Region », « Flämische
 * Region »), as « Communauté française » is.
 */
const LISTED_NOT_LANGUAGES = [
  "Émirats arabes", "Arabische Emirate", "الإمارات العربية", "المملكة العربية", "Mandarin Oriental",
  "golfe Persique", "golfe-Persique", "golfe arabo-persique", "golfe Arabique", "golfe arabe", "péninsule Arabique", "gomme arabique", "République hellénique",
  "Persian Gulf", "Persischer Golf", "Persischen Golf", "Persische Golf", "Arabischer Golf", "Arabischen Golf", "Arabische Halbinsel", "Arabischen Halbinsel",
  "monde arabe", "pays arabes", "Ligue arabe", "arabische Welt", "arabischen Welt", "arabische Länder", "arabischen Ländern", "Arabische Liga", "Arabischen Liga",
  "arabischer Raum", "arabischen Raum", "arabische Raum",
  "Russian Federation", "Russische Föderation", "Russischen Föderation",
  "Dutch Caribbean", "Caraïbes néerlandaises", "Antilles néerlandaises", "Niederländische Karibik", "Niederländischen Karibik", "Niederländische Antillen", "Niederländischen Antillen",
  "French Polynesia", "Polynésie française", "Französisch-Polynesien", "French Guiana", "Guyane française", "Französisch-Guayana",
  "French West Indies", "French Antilles", "Antilles françaises", "Französische Antillen", "Französischen Antillen",
  "Flandre française", "Pays basque français", "Pays basque espagnol", "Catalogne française", "Communauté française",
  "Suisse italienne", "Suisse allemande", "Italian Switzerland", "italienische Schweiz", "italienischen Schweiz", "französische Schweiz", "französischen Schweiz", "deutsche Schweiz", "deutschen Schweiz",
  "Kurdistan turc", "Turkish Kurdistan", "Türkisch-Kurdistan", "Chypre turque", "Turkish Cyprus", "Chinese Taipei", "Taipei chinois", "Chinesisch Taipeh", "Chinesisch-Taipeh",
  "Brabant flamand", "Communauté flamande", "Région flamande", "Flemish Brabant", "Flemish Community", "Flemish Region",
  "Flämisch-Brabant", "Flämische Gemeinschaft", "Flämischen Gemeinschaft", "Flämische Region", "Flämischen Region",
];

const LANGUAGE_NAMES = RECRUITMENT_LANGUAGES.flatMap(language =>
  [
    ...Object.entries(language.names),
    ...(FRENCH_OTHER_NAMES[language.code] ?? []).map(name => ["fr", name] as const),
    ...language.otherNames.map(name => ["other", name] as const),
  ].map(([writtenIn, name]) => ({ code: language.code as RecruitmentLanguageCode, writtenIn, name, typedFromStart: true })),
).concat(USUAL_OTHER_NAMES.flatMap(([code, writtenIn, ...names]) => names.map(name => ({ code, writtenIn, name, typedFromStart: false }))))
  .map(({ code, writtenIn, name, typedFromStart }) => {
    const folded = foldLanguageText(name);
    return { code, writtenIn, folded, typedFromStart, atWordStart: SPACED_SCRIPT.test(folded), forms: nameForms(folded, writtenIn) };
  });

/** Whether a word starts at this index: the text's start, or after a character that is neither a letter nor a digit. */
const startsWord = (folded: string, index: number) => index === 0 || !LETTER_OR_DIGIT.test(folded[index - 1]!);

/** Each place where this folded text writes one of the table's names, with its inflection: its start and its end. */
function namePlaces(folded: string, entry: (typeof LANGUAGE_NAMES)[number]) {
  const places: Array<readonly [number, number]> = [];
  if (!entry.atWordStart) {
    for (let index = folded.indexOf(entry.folded); index >= 0; index = folded.indexOf(entry.folded, index + 1)) {
      if (COUNTRY_CHARACTERS.includes(entry.folded[0]!) && writesCountrysLanguage(folded, index, index + entry.folded.length)) continue;
      places.push([index, index + entry.folded.length]);
    }
    return places;
  }
  for (const { stem, ending } of entry.forms) {
    for (let index = folded.indexOf(stem); index >= 0; index = folded.indexOf(stem, index + 1)) {
      const inflection = startsWord(folded, index) ? ending.exec(folded.slice(index + stem.length)) : null;
      if (inflection) places.push([index, index + stem.length + inflection[0].length]);
    }
  }
  return places;
}

const namesLanguage = (folded: string, entry: (typeof LANGUAGE_NAMES)[number]) => namePlaces(folded, entry).length > 0;

/** The Chinese characters for a country (国, 國), that 国语 (國語), Mandarin, starts with. */
const COUNTRY_CHARACTERS = "国國";
/** The Chinese conjunctions (和, 及, 与, 與) and 或. */
const CHINESE_JOINING_CHARACTERS = "和及与與或";
/** The characters a language's Chinese name ends with: 英语, 上海话, 中文. */
const CHINESE_NAME_ENDINGS = "语語话話文言";
/**
 * IA02-R7B: those of them an everyday Chinese word ends with as well: 话 (电话,
 * 通话, 讲话, 说话), 文 (论文, 作文, 课文, 原文), 言 (发言, 留言, 前言, 方言).
 * A word that ends so is a language's name only after the name of a language,
 * a people or a place (below).
 */
const CHINESE_WORD_ENDINGS = "话話文言";
/** Taiwan's Chinese names: 台湾国语 is Taiwanese Mandarin. */
const TAIWAN_NAMES = ["台湾", "台灣", "臺灣", "臺湾"];
const HAN_CHARACTER = new RegExp("\\p{Script=Han}", "u");
const HAN_WORD = new RegExp("^\\p{Script=Han}+$", "u");

/**
 * IA02-R7B: the names a Chinese speech or script is named after, beside those
 * of the languages (英 of 英语, 阿拉伯 of 阿拉伯语, 广东 of 广东话, 斯瓦希里 of
 * 斯瓦希里语) and the countries and regions Intl.DisplayNames gives in Chinese
 * (中国, 新加坡, 香港, 台湾): China's provinces, municipalities and autonomous
 * regions, and the areas and cities whose speech is named after them (上海话,
 * 潮州话, 四川话, 温州话, 潮汕话, 东北话, 莆仙话), IA02-R8: those the groups of
 * Mandarin and of Pinghua are named after too (西南官话, 中原官话, 兰银官话,
 * 桂南平话, 北方话); then the peoples of China whose script or speech is
 * named after them (蒙文, 维文, 满文, 傣文; IA02-R8B: one of a single character
 * too, wherever it ends what is written before 话, 文 or 言, 新疆维文,
 * 德宏傣文, 新傣文, but in the everyday words below, 恭维话, compliments); then
 * the usual short Chinese names of languages no list knows (印尼语, 越语,
 * 缅语, 柬语); each in simplified and traditional characters.
 */
const CHINESE_PLACE_NAMES =
  "北京 天津 上海 重庆 重慶 河北 山西 辽宁 遼寧 吉林 黑龙江 黑龍江 江苏 江蘇 浙江 安徽 福建 江西 山东 山東 河南 湖北 湖南 广东 廣東 海南 四川 " +
  "贵州 貴州 云南 雲南 陕西 陝西 甘肃 甘肅 青海 内蒙古 內蒙古 广西 廣西 西藏 宁夏 寧夏 新疆 " +
  "东北 東北 闽南 閩南 闽东 閩東 闽北 閩北 潮汕 广府 廣府 胶东 膠東 江淮 苏北 蘇北 苏南 蘇南 粤西 粵西 雷州 四邑 " +
  "广州 廣州 深圳 东莞 東莞 佛山 中山 珠海 江门 江門 台山 臺山 潮州 汕头 汕頭 揭阳 揭陽 梅州 湛江 惠州 福州 厦门 廈門 泉州 漳州 莆田 温州 溫州 " +
  "宁波 寧波 杭州 绍兴 紹興 金华 金華 台州 臺州 苏州 蘇州 无锡 無錫 常州 扬州 揚州 南京 南通 武汉 武漢 长沙 長沙 南昌 合肥 成都 西安 济南 濟南 " +
  "青岛 青島 大连 大連 沈阳 瀋陽 长春 長春 哈尔滨 哈爾濱 太原 郑州 鄭州 洛阳 洛陽 昆明 贵阳 貴陽 南宁 南寧 桂林 柳州 海口 兰州 蘭州 银川 銀川 " +
  "西宁 西寧 乌鲁木齐 烏魯木齊 拉萨 拉薩 呼和浩特 " +
  "开平 開平 恩平 新会 新會 鹤山 鶴山 顺德 順德 南海 番禺 阳江 陽江 茂名 化州 廉江 肇庆 肇慶 清远 清遠 韶关 韶關 河源 梅县 梅縣 兴宁 興寧 汕尾 " +
  "海陆丰 海陸豐 潮阳 潮陽 普宁 普寧 澄海 云浮 雲浮 石岐 福清 长乐 長樂 闽侯 閩侯 莆仙 兴化 興化 仙游 仙遊 晋江 晉江 石狮 石獅 永春 安溪 龙岩 龍巖 三明 南平 " +
  "建瓯 建甌 宁德 寧德 福安 嘉兴 嘉興 湖州 衢州 丽水 麗水 舟山 义乌 義烏 镇江 鎮江 泰州 盐城 鹽城 徐州 淮安 连云港 連雲港 宿迁 宿遷 启东 啟東 " +
  "海门 海門 湘潭 株洲 衡阳 衡陽 岳阳 岳陽 常德 益阳 益陽 娄底 婁底 邵阳 邵陽 怀化 懷化 郴州 永州 张家界 張家界 湘西 九江 赣州 贛州 上饶 上饒 " +
  "景德镇 景德鎮 萍乡 萍鄉 宜春 抚州 撫州 吉安 芜湖 蕪湖 安庆 安慶 徽州 蚌埠 阜阳 阜陽 三亚 三亞 儋州 文昌 琼海 瓊海 临高 臨高 梧州 北海 玉林 " +
  "钦州 欽州 桂柳 百色 石家庄 石家莊 唐山 保定 宜昌 襄阳 襄陽 荆州 荊州 绵阳 綿陽 自贡 自貢 乐山 樂山 宜宾 宜賓 遵义 遵義 烟台 煙臺 煙台 开封 開封 " +
  "北方 西南 中原 兰银 蘭銀 胶辽 膠遼 冀鲁 冀魯 桂南 桂北";
const CHINESE_PEOPLE_NAMES = "汉 漢 蒙 藏 维 維 满 滿 苗 彝 壮 壯 傣 侗 瑶 黎 佤 畲 傈僳 纳西 納西 景颇 景頗 锡伯 錫伯 哈尼 土家 布依 朝鲜 朝鮮 哈萨克 哈薩克 柯尔克孜 柯爾克孜 维吾尔 維吾爾";
const CHINESE_SHORT_LANGUAGE_NAMES = "印尼 越 缅 緬 柬";
/**
 * The names of a Chinese speech named after none of these: 白话 (白話),
 * Cantonese, 官话 (官話), Mandarin, and (IA02-R8) 平话 (平話), Pinghua,
 * wherever they end a word (会说白话, 熟悉白话, 当地官话, 广东白话, 西南官话,
 * 桂南平话), but in the everyday words below.
 */
const CHINESE_SPEECH_NAMES = ["白话", "白話", "官话", "官話", "平话", "平話"];
/**
 * IA02-R8B: the everyday words written with one of these names, or with a
 * people of one character (above) before 话, known by what is written before
 * their last character: 大白话 and 明白话 (plain words: 大 or 明 before 白话),
 * 打官话 (officialese: 打 before 官话) and 恭维话 (compliments: 恭 before 维),
 * in simplified and traditional characters. A closed list, short on purpose:
 * after any other character the name is the language's (熟悉白话, 当地官话,
 * 正宗平话, 德宏傣文, 熟悉维文), as « cantonais local » and « local
 * Cantonese » are.
 */
const CHINESE_EVERYDAY_STEMS = ["大白", "明白", "打官", "恭维", "恭維"];
/** IA02-R8: the Chinese of Intl.DisplayNames, in simplified and in traditional characters (拉丁语, 拉丁文; 斯瓦希里语, 史瓦希里文). */
const CHINESE_LOCALES = ["zh", "zh-Hant"];
/**
 * IA02-R8: the codes of the other languages Intl.DisplayNames gives a Chinese
 * name to, beside the table's and OTHER_LANGUAGE_CODES (below), one code for
 * each name, 2 letters then 3: the ancient and constructed ones that list
 * leaves out, whose names also qualify a language or a place in a Latin
 * script (Latin, Sanskrit, Pali, Avestan, Church Slavic, Esperanto, Ido,
 * Interlingua, Interlingue, Volapük), the other ancient and historical ones
 * (Akkadian, Aramaic, Coptic, Sumerian, Ancient Greek, Old English), and the
 * regional and minority ones (Asturian, Bavarian, Hawaiian, Rohingya, Romani,
 * Manchu, Wu, Gan, Xiang, Shan…). Their Chinese names, as the others', only
 * say which Chinese word that ends with 话, 文 or 言 is a language's name
 * (below: 拉丁文, 梵文, 巴利文, 吴话); no requirement compares them by code.
 */
const CHINESE_NAMED_LANGUAGE_CODES = [
  "ae cu eo ia ie io la pi sa vo",
  "ace ach ada ady aeb afh agq ain aju akk akz ale aln alt ang ann anp arc arn aro arp arq ars arw ary arz asa ase ast atj avk bar bas bax bbc",
  "bbj bej bew bez bfd bfq bgc bgn bjn bkm bla blg blo blt bpy bqi bra brh bss bua bum bxk byn byv cad car cay cch ccp chb chg chk chm chn cho",
  "chp chr chy cic clc cld cop cps crg crh crj crk crl crm crr csb csw dak dar dav del den dgr dhd dik diq dje dsb dtp dua dum dzg ebu egl egy",
  "eka elx emk enm esu ext fan fit frc frm fro frr frs fur gaa gag gan gay gba gbo gbz gez gil glk gmh gno goh gor got grc gsw guc gur guz gwi",
  "hai haw hax hif hit hsb hsn hup hur ikt inh izh jbo jgo jmc jpr jut kaa kac kaj kaw kbd kbl kcg kde ken kfo kgp kha kho khq khw kiu kkj kos",
  "kpe krc krj krl kru ksb ksf ksh kum kut kwk kxv lad lag lah lam lez lij lil liv lkt lmo lol lou lrc lsm ltg lui lun lzz maf mak mas mde mdf",
  "mdr mer mga mgh mgo mic mnc moe moh mos mrj mua mus mwl mwv mye myv mzn nap naq nds new nia niu njo nmg nnh nog non nov nus nwc nym nyo nzi",
  "ojb ojc ojs ojw oka osa ota pal pam pau pcd pdc pdt peo pfl phn pis pms pnt pon pqm prg pro quc qug rap rar rgn rhg rmy rof rtm rue rug rup",
  "rwk sad sah sam saq saz sba sbp scn sco see seh sei sel ses sga sgs shn shu sid slh sli sly sma smj smn sms sog ssy stq str suk sux swb swc",
  "syc szl tce teo ter tgx tht tkl tkr tlh tli tly tmh tog tok tru trv trw tsd tsi ttm ttt tvl twq tyv udm uga vai vec vep vls vmw vot vro vun",
  "wae wal was wbp wuu xal xmf xnr xog yao yap yav ybb yrl zai zea zen zun",
].join(" ").split(" ");

/**
 * IA02-R7: whether 国语 (國語) at this place of a folded text, « the language
 * of the country », is a country's language rather than Mandarin. It is
 * Mandarin where 国 starts a word: at the text's start, after what is not a
 * Chinese character, a conjunction, another language's name (« 粤语国语 »)
 * or a word of the closed list below (« 会说国语 », « 流利的国语 »), and
 * after 台湾 (台灣, 臺灣), Taiwanese Mandarin. After any other Chinese
 * character, 国 ends a word for a country or for countries (所在国, 该国,
 * 驻在国, 东道国, 泰国, 外国, 民国), and before 言 or 文 always (所在国语言,
 * 工作国语言, 民国语文): the text names that country's language, which no
 * table names.
 */
function writesCountrysLanguage(folded: string, start: number, end: number) {
  if ("言文".includes(folded[end] ?? " ")) return true;
  const head = folded.slice(0, start);
  return !startsChineseWord(head) && !TAIWAN_NAMES.some(name => head.endsWith(name));
}

/**
 * Whether a Chinese word starts after this folded text: at the text's start,
 * after what is not a Chinese character, a conjunction, a language's name
 * (« 粤语国语 ») or a word of the closed list below (« 会说国语 », « 流利的国语 »).
 */
function startsChineseWord(head: string) {
  const before = head.at(-1) ?? " ";
  if (!HAN_CHARACTER.test(before) || CHINESE_JOINING_CHARACTERS.includes(before) || CHINESE_NAME_ENDINGS.includes(before)) return true;
  return REQUIREMENT_WORD_FORMS.some(word => !word.spaced && head.endsWith(word.folded));
}

/**
 * The codes of the languages of the table this folded text names. IA02-R7: a
 * name written within a longer name of the table, at its place, is part of
 * that name (« 国语 », Mandarin, in « 韩国语 », Korean).
 */
function namedCodes(folded: string) {
  const found = LANGUAGE_NAMES.flatMap(entry => namePlaces(folded, entry).map(([start, end]) => ({ code: entry.code, start, end })));
  const codes: RecruitmentLanguageCode[] = [];
  for (const name of found) {
    if (codes.includes(name.code)) continue;
    if (!found.some(other => other.start <= name.start && name.end <= other.end && other.end - other.start > name.end - name.start)) codes.push(name.code);
  }
  return codes;
}

/**
 * The places above, folded, the region names of Intl.DisplayNames and the
 * names of the languages the table does not know that hold a name of the
 * table among other words: « Polynésie française », « Îles Turques-et-Caïques »,
 * « 库尔德语 » (Kurdish, not 德语), « 南非荷兰语 » (Afrikaans, not 荷兰语),
 * « Hakka Chinese », « Jamaican Creole English ». Read when first asked for.
 */
let notLanguages: readonly string[] | undefined;

function readNotLanguages() {
  const phrases = new Set(LISTED_NOT_LANGUAGES.map(foldLanguageText));
  const add = (whole: string) => {
    const places = LANGUAGE_NAMES.flatMap(entry => namePlaces(whole, entry));
    // Wholly a name of the table (Italien, Italy in German): a language where the text is written in its language, below.
    if (places.length && !places.some(([start, end]) => start === 0 && end === whole.length)) phrases.add(whole);
  };
  for (const locale of OTHER_LANGUAGE_LOCALES) for (const region of regionNames(locale)) add(foldLanguageText(region.name));
  otherLanguageNames ??= readOtherLanguageNames();
  otherLanguageNames.forEach((_, name) => add(name));
  return Array.from(phrases);
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

/** The region names of Intl.DisplayNames in French, English, German or Chinese that hold a separator, as written, case aside: read when first asked for. */
let placesWithSeparators: RegExp | null | undefined;

function readPlacesWithSeparators() {
  const separator = new RegExp(`${REQUIREMENT_SEPARATOR.source}|${BETWEEN_NAMES.source}`, "iu");
  const names = new Set<string>();
  for (const locale of OTHER_LANGUAGE_LOCALES) for (const region of regionNames(locale)) if (separator.test(region.written)) names.add(region.written);
  // A name of a script written with spaces is found as whole words, one of another script anywhere (« 埃及 » in « 埃及阿拉伯语 »).
  const patterns = Array.from(names).sort((left, right) => right.length - left.length).map(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return SPACED_SCRIPT.test(name) ? `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])` : escaped;
  });
  return patterns.length ? new RegExp(patterns.join("|"), "giu") : null;
}

/** A text with the separators of the region names above that it writes whole blanked out, character for character. */
function blankPlacesWithSeparators(text: string) {
  if (placesWithSeparators === undefined) placesWithSeparators = readPlacesWithSeparators();
  if (!placesWithSeparators) return text;
  return text.replace(placesWithSeparators, place => "\u0000".repeat(place.length));
}

/** A text as ACCENTED_NAMES are looked for in it: as written, case aside, what it says between brackets blanked out. */
const writtenText = (text: string) => blankBrackets(text.normalize("NFC").toLowerCase()).replaceAll("\u0000", " ");

/**
 * The texts already compared, folded, with the codes of the languages they
 * name and their words outside brackets (`core`, « wolof » for « Wolof
 * (courant) »). The same few names come back for every dossier (the form's
 * fixed list, the names the AI reads), and a mission ranks up to 2 000
 * candidates, a profile checks up to 10 000 dossiers, at each request: each is
 * folded and looked up once. Only texts the length of a language mention, and
 * emptied once full.
 */
type ComparedText = { folded: string; searched: string; core: string; codes: readonly RecruitmentLanguageCode[]; readonly others: readonly string[] };
const COMPARED_TEXTS = new Map<string, ComparedText>();
const COMPARED_TEXTS_LIMIT = 2_000;
const COMPARED_TEXT_MAX_LENGTH = 200;

function comparedText(text: string): ComparedText {
  const cached = COMPARED_TEXTS.get(text);
  if (cached) return cached;
  const folded = foldLanguageText(text);
  notLanguages ??= readNotLanguages();
  const searched = notLanguages.reduce((current, phrase) => current.replaceAll(phrase, " ".repeat(phrase.length)), folded);
  const codes = namedCodes(searched);
  const core = blankBrackets(folded).replaceAll("\u0000", " ").replace(/\s+/g, " ").trim() || folded.trim();
  // The languages the table does not know it names outside brackets, by their codes: read when first asked for.
  let others: readonly string[] | undefined;
  const compared = {
    folded, searched, core, codes: Object.freeze(codes),
    get others() { return (others ??= Object.freeze(otherLanguageCodes(core, writtenText(text)))); },
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
 * Sasak, Tetum and Tok Pisin; Tarifit, Montenegrin and Southern Kurdish, of
 * the families below; Serer, Jola, Balochi, Tulu, Saraiki and Sylheti. Not
 * those whose name is mostly a place's
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
  "rif cnr sdh",
  "srr dyo bal tcy skr syl",
].join(" ").split(" ");
/** The languages their names are read in, from Intl.DisplayNames: the table's four, and each language in its own (« srpski », « Taqbaylit »). */
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
 * Українська), and French names (azéri, malinké, comorien, pidgin). And the
 * names a language is written under in its own script or spelling that
 * Intl.DisplayNames does not give as its own (Srpski, the Latin spelling of
 * Serbian; کوردی; پنجابی, Punjabi in Shahmukhi; Oʻzbek; Bokmål and Nynorsk;
 * Tarifit and rifain), and the English names still in use for a country's
 * language (Montenegrin, Myanmar, Cambodian, Laotian, Pilipino). And the
 * names of Jola, Balochi, Saraiki and Sylheti it gives none of, and Hakka and
 * Min Nan as 客家话 and 闽南话.
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
  ["sr", "Srpski"],
  ["ku ckb", "کوردی"],
  ["pa", "پنجابی"],
  ["uz", "Oʻzbek", "O'zbek", "O’zbek", "Ozbek", "Oʻzbekcha"],
  ["nb", "Bokmål", "Bokmal"],
  ["nn", "Nynorsk"],
  ["rif", "Tarifit", "Tarifiyt", "Rifain", "Riffian", "Rifian"],
  ["cnr", "Montenegrin", "Monténégrin", "Montenegrinisch", "Crnogorski"],
  ["my", "Myanmar"],
  ["km", "Cambodian", "Cambodgien"],
  ["lo", "Laotian", "Laotien"],
  ["tl fil", "Pilipino"],
  ["dyo", "Diola", "Jola", "Joola"],
  ["bal", "Balochi"],
  ["skr", "Saraiki", "Seraiki", "Siraiki"],
  ["syl", "Sylheti"],
  ["hak", "客家话", "客家話"],
  ["nan", "闽南话", "閩南話"],
];

/** Names of a language that are words accents aside (« moré », « more »): found only as written, with their accents, case aside. */
const ACCENTED_NAMES: ReadonlyArray<readonly [code: string, name: string]> = [["mos", "moré"]];

/**
 * The languages of a macrolanguage or a family the table does not know, by
 * its code: a requirement of it is met by each of them (« Kurde » by Sorani
 * and Kurmanji, « Serbo-croate » by Serbian, Croatian and Bosnian, « Berbère »
 * by Kabyle, Tachelhit, Tamazight and Tarifit, « Peul » by Pulaar,
 * « Norvégien » by Bokmål and Nynorsk), not the reverse.
 */
const MEMBER_LANGUAGES: Readonly<Record<string, readonly string[]>> = {
  no: ["nb", "nn"],
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
 * language Intl.DisplayNames gives it for, in the table's four languages and
 * in its own, or that the list above gives it: « cantonais », « Cantonese »,
 * « Kantonesisch » and « 粤语 » are all yue, « српски » sr, « Soomaali » so.
 * Only the list above where Intl.DisplayNames is missing (a browser or a
 * Node.js built without its data).
 */
function readOtherLanguageNames() {
  const names = new Map<string, string[]>();
  const add = (name: string | undefined, code: string) => {
    const folded = foldListedName(name ?? "");
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
    // Each language's own name, as its speakers write it: in a locale the host does not have, the name in its default locale.
    for (const code of OTHER_LANGUAGE_CODES) {
      try {
        add(new Intl.DisplayNames([code], { type: "language", fallback: "none" }).of(code), code);
      } catch {
        // A code this host cannot name in its own language.
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
 * IA02-R4: the words that say how a language is required, and nothing else:
 * a requirement (« obligatoire », « un plus », « required », « erforderlich »,
 * « 必须 »), a level or a skill (« courant », « langue maternelle », « lu »,
 * « fluent », « mother tongue », « fließend », « 流利 »), a language test or
 * its certificate (« IELTS », « DELF », « Goethe », « HSK », « 证书 »), and the
 * words these are said with (IA02-R5): the verbs and the articles of a
 * requirement (« serait un atout », « is required », « would be an
 * advantage », « wäre von Vorteil », « ein Plus », « 为母语 », « 者优先 »), its
 * intensifiers (« fortement », « vivement », « strongly », « highly »,
 * « big », « strong »), the verbs of a skill (« command of », « 熟练掌握 »,
 * « 能熟练使用 », « 会说 », « 听说读写 », « 沟通 »), the words that join two
 * levels (« et », « and », « und », « ou », « or », « oder », « above »,
 * « höher »), and (IA02-R6) a duration, a level in each of the four
 * languages alike (« 5 ans », « 5 years », « 5 Jahre », « 5年 », « 6 mois »).
 * IA02-R7: the list is written concept by concept, each with its words in
 * French, English, German and Chinese, so that a text is read alike whatever
 * its language: what a concept says in one of them, it says in the three
 * others. Each skill, how it is had and its verb (« lu, écrit, parlé,
 * compris », « lire, écrire, parler, comprendre », « read, written, spoken,
 * understood », « read, write, speak, understand », « gelesen, geschrieben,
 * gesprochen, verstanden », « lesen, schreiben, sprechen, verstehen », « 读,
 * 写, 说, 听懂 »); the skills themselves (« compétences », « skills »,
 * « Kenntnisse », « Kompetenz », « 能力 »); a duration in words as in digits,
 * with how much of it (« au moins », « at least », « mindestens », « 至少 »;
 * « plus de », « more than », « over », « mehr als », « über », « 以上 »;
 * « plusieurs années », « several years », « mehrere Jahre », « 多年 »); an
 * experience, a practice or a use, and of what kind (« 5 ans de pratique »,
 * « 5 years of practice », « beruflicher Gebrauch », « 日常使用 », « usage
 * quotidien », « daily use », « täglicher Gebrauch »); the levels as each
 * language names them, LinkedIn's among them (« compétence professionnelle
 * limitée », « limited working proficiency », « 有限工作能力 », « capacité
 * professionnelle complète », « 全面专业工作能力 », « niveau élevé », « high
 * level », « hohes Niveau », « 高水平 »).
 * In French with their feminine and plural endings, in English their plural
 * but for a word of one or two letters, in German their endings; in Chinese
 * anywhere; a hyphen as a space (« must-have », « near-native »,
 * « upper-intermediate »). Not the words of a place (« pays », « région »,
 * « Region », « Nadu », « Barat », « Central », « Sud », « Haute »), nor a
 * preposition that says where (« en Corse », « in Afar », « de Dakar »), nor
 * those of a variety (« standard », « littéraire »), nor those of a field or a
 * place of work (« clinique », « clinical », « Klinik », « 临床 »,
 * « médical », « medical », « medizinisch », « 医学 »).
 */
const REQUIREMENT_CONCEPTS: ReadonlyArray<readonly [concept: string, fr: string, en: string, de: string, zh: string]> = [
  ["required",
    "obligatoire|obligatoirement|exigé|exigence|exigible|requis|indispensable|impératif|impérative|impérativement|nécessaire|demandé|attendu|essentiel|essentielle",
    "required|requirement|mandatory|essential|compulsory|must|must have|needed|necessary|expected",
    "erforderlich|notwendig|zwingend|unbedingt|pflicht|vorausgesetzt|voraussetzung|gefordert|verlangt|erwartet",
    "必须|必需|必备|要求|需要"],
  ["preferred, an advantage",
    "souhaité|souhaitable|apprécié|préféré|préférable|de préférence|recommandé|recherché|plus|atout|avantage|bonus|idéalement|si possible",
    "preferred|preferable|preferably|desirable|desired|advantage|advantageous|an advantage|plus|nice to have|asset|an asset|recommended|appreciated|considered|ideally|if possible",
    "wünschenswert|erwünscht|gewünscht|von vorteil|vorteilhaft|bevorzugt|empfohlen|idealerweise|wenn möglich",
    "优先|者优先|加分|最好|佳|推荐"],
  ["optional", "facultatif|facultative|optionnel|optionnelle", "optional", "fakultativ|optional", "可选"],
  ["only", "uniquement|seulement|exclusivement", "only|exclusively", "nur|ausschließlich", "仅|只"],
  ["at least", "minimum|au minimum|au moins|min", "minimum|at least", "mindestens|wenigstens", "至少|最少|最低"],
  ["more than, above", "plus de|supérieur", "more than|over|above|higher", "mehr als|über|höher", "以上|超过|高于"],
  ["equivalent, better", "équivalent|meilleur", "equivalent|better", "gleichwertig|besser", "同等|相当|更好"],
  ["is, would be, a", "un|une|est|serait|sera|constitue|représente", "is|are|be|would|will|should|an", "ist|sind|wäre|wären|sein|ein", "为|是|者|的"],
  ["very, strongly", "très|fortement|vivement|absolument|vrai|réel|réelle|véritable", "very|strongly|highly|big|great|strong|absolutely|definitely", "sehr|äußerst|absolut", "非常|很"],
  ["and, or", "et|ou", "and|or", "und|oder", "和|与|與|及|或"],
  ["fluent, native, bilingual",
    "courant|couramment|bilingue|natif|native|natal|maternel|maternelle",
    "fluent|fluently|fluency|native|native speaker|near native|mother tongue|first language|bilingual",
    "fließend|verhandlungssicher|muttersprache|muttersprachler|muttersprachlich|auf muttersprachlichem niveau|zweisprachig",
    "流利|流畅|母语|双语"],
  ["a level",
    "niveau|niv|débutant|élémentaire|intermédiaire|avancé|confirmé|expert|scolaire|notions|bases|de base|moyen|moyenne|opérationnel|opérationnelle|limité|complet|élevé|soutenu",
    "level|basic|basics|beginner|elementary|intermediate|upper intermediate|advanced|expert|limited|full|high",
    "niveau|anfänger|fortgeschritten|grundkenntnisse|begrenzt|eingeschränkt|hoch|hoh",
    "水平|一般|基础|初级|中级|高级|有限|全面|高"],
  ["good, excellent", "bon|bonne|excellent|parfait|parfaitement|correct", "good|excellent|perfect|solid", "gut|ausgezeichnet|perfekt|solide|fundiert", "良好|优秀|好"],
  ["mastery, skills",
    "maîtrise|maîtrisé|connaissance|compétence|capacité|aptitude",
    "proficient|proficiency|knowledge|knowledge of|command|command of|skill|competence|competency|competencies|ability|abilities|capability",
    "kenntnis|kenntnisse|sprachkenntnis|sprachkenntnisse|kompetenz|fähigkeit|fertigkeit",
    "熟练|精通|掌握|熟练掌握|能力|技能|具备|具有"],
  ["professional, working", "professionnel|professionnelle", "professional|full professional|business|working", "beruflich", "专业|工作"],
  ["daily, conversation", "quotidien|quotidienne|au quotidien|conversation|en conversation|conversationnel|conversationnelle", "daily|everyday|conversation|in conversation|conversational", "täglich|alltäglich|alltag|im alltag|konversation|gespräch|im gespräch", "日常|会话|对话"],
  ["communication, at ease", "communication|aisance|aisé", "communication|comfortable|confident", "kommunikation|sicher", "沟通|交流|自如"],
  ["read", "lu|lire|lecture", "read|reading", "gelesen|lesen|leseverstehen", "读|阅读|读写|听说读写"],
  ["write", "écrit|écrire|écriture", "written|write|writing", "geschrieben|schreiben|schriftlich|schrift|in schrift|in wort und schrift|wort und schrift", "写|写作|书面|书面语"],
  ["speak", "parlé|parler|oral|expression", "spoken|speak|speaking|oral|verbal", "gesprochen|sprechen|mündlich|wort|in wort", "说|讲|口语"],
  ["understand", "compris|comprendre|compréhension", "understood|understand|understanding|comprehension", "verstanden|verstehen", "听懂|看懂|听得懂|看得懂|懂|理解"],
  ["listen", "écoute|écouter", "listening|listen", "hören|hörverstehen", "听|听力"],
  ["able to", "savoir", "able to", "können|kann", "会|能"],
  ["use, practice", "usage|utilisation|pratique|de pratique|exercice", "use|of use|usage|practice|of practice", "gebrauch|anwendung|nutzung|praxis", "使用|运用|实践"],
  ["experience",
    "expérience|expérience de",
    "experience|experienced|of experience|experience of",
    "erfahrung|erfahrung von|berufserfahrung|arbeitserfahrung|praxiserfahrung|berufspraxis",
    "经验|工作经验|经历"],
  ["a duration", "an|année|mois|plusieurs", "year|yr|yrs|month|several", "jahr|monat|mehrere", "年|个月|個月|多年"],
  // The Chinese numerals are digits, read as digits are (DIGIT, below): « 两年 », « 三年 ».
  ["a number", "deux|trois|quatre|cinq|six|sept|huit|neuf|dix", "one|two|three|four|five|six|seven|eight|nine|ten", "eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn", ""],
  ["a test",
    "test|test de langue|test de niveau|examen|certificat|certificat de langue|certification|certifié|diplôme|attestation|attestation de niveau|attesté|justifié|score",
    "test|exam|examination|certificate|certification|certified|diploma|score|grade|band",
    "prüfung|fachsprachprüfung|zertifikat|zertifiziert|nachweis",
    "考试|证书|成绩|分|级|雅思|托福|托业"],
  ["the language, its words",
    "langue|langue de travail|linguistique|terminologie|vocabulaire",
    "language|working language|linguistic|terminology|vocabulary",
    "sprache|fachsprache|arbeitssprache|sprachlich|terminologie|fachbegriff|wortschatz",
    "语言|工作语言|术语|用语|词汇"],
];
/** The language tests and their scales, named alike in every language. */
const LANGUAGE_TEST_NAMES = "toefl|toeic|ielts|oet|pte|celpip|cael|linguaskill|duolingo|cambridge|cae|cpe|fce|bec|tcf|tef|tefaq|delf|dalf|dele|siele|celpe|goethe|testdaf|dsh|telc|ösd|fsp|hsk|hskk|tocfl|jlpt|topik|torfl|cils|celi|plida|actfl|ilr|cefr|cecr|cecrl";
const REQUIREMENT_WORDS: ReadonlyArray<readonly [writtenIn: "fr" | "en" | "de" | "zh", words: string]> = [
  ...REQUIREMENT_CONCEPTS.flatMap(([, fr, en, de, zh]) => [["fr", fr], ["en", en], ["de", de], ["zh", zh]] as const),
  ["en", LANGUAGE_TEST_NAMES],
];
const REQUIREMENT_WORD_ENDINGS = { fr: "|e|s|es", en: "|s", de: "|e|en|er|es|em", zh: "" } as const;
const REQUIREMENT_WORD_FORMS = REQUIREMENT_WORDS.flatMap(([writtenIn, words]) => words.split("|").filter(Boolean).map(word => {
  const folded = foldLanguageText(word);
  // IA02-R6: no English plural for a word of one or two letters (is, be, an, or): « ans » is the French « an », a year, not « an » + s.
  const endings = writtenIn === "en" && folded.length <= 2 ? "" : REQUIREMENT_WORD_ENDINGS[writtenIn];
  // A word of these scripts ends before another letter of them, not before a digit or an ideograph (« HSK五级 »).
  return { folded, spaced: SPACED_SCRIPT.test(folded), ending: new RegExp(`^(?:${endings})(?!${SPACED_SCRIPT.source})`, "u") };
}));
const LETTER_OR_MARK = new RegExp("[\\p{L}\\p{M}]", "u");
/** The digits a requirement is written with: those of Unicode, and the Chinese numerals (« HSK五级 », 六级), 两 and 〇 among them (« 两年 », IA02-R7). */
const DIGIT = new RegExp("[\\p{N}〇零一二两兩三四五六七八九十百]", "u");

/**
 * Whether a part beside a dash, once its requirement words above, its digits,
 * its punctuation and what it says between brackets are set aside, is wholly
 * the names of languages the table does not know: « Wolof », « Wolof
 * courant », « Tamil (C1) required », « Baskisch fließend », « 粤语流利 ». A
 * single letter is a level's (« B2 ») or an article's (« à l'oral »). Any
 * other word means the name of a language is part of another name, a place's
 * (« Tamil Nadu », « Pays basque », « Basque Country », « Corse-du-Sud »,
 * « Jawa Barat », « Province du Kongo-Central », « Sénégal wolof »), which
 * qualifies the language beside it.
 */
function namesOnlyLanguages(text: string) {
  return saysOnly(text, "languages");
}

/**
 * Whether a part says nothing but how a language is required: its
 * requirement words above, its digits, its punctuation and what it says
 * between brackets aside, nothing is left (« écrit », « C2 », « above »,
 * « bilingual », « höher »).
 */
function saysOnlyRequirements(text: string) {
  return saysOnly(text, "requirements");
}

/**
 * IA02-R6: whether a part is wholly the known words a language is qualified
 * with: its requirement, level and test words above, its digits, its
 * punctuation and what it says between brackets aside, and the names of the
 * countries and the places known here (the region names of Intl.DisplayNames
 * in French, English, German and Chinese, and the places listed above),
 * nothing is left: « écrit », « C2 », « 5 ans », « Qatar », « Arabie
 * saoudite », « Persian Gulf »; not « Darija », « Somalisch », « 阿语 », nor
 * « Dubaï », which no list knows.
 */
function saysOnlyQualifiers(text: string) {
  return saysOnly(text, "qualifiers");
}

/**
 * The names of the countries and places known here, folded, what they say
 * between brackets aside, by their first word (their first character in a
 * script written without spaces), so that a part is only compared with those
 * that start one of its words: read when first asked for.
 */
let knownPlaces: ReadonlyMap<string, readonly string[]> | undefined;

/** The word that starts at this index of a folded text: its letters and digits, or its first character in a script written without spaces. */
function wordAt(folded: string, index: number) {
  const first = folded[index] ?? "";
  if (!SPACED_SCRIPT.test(first)) return first;
  let end = index;
  while (end < folded.length && LETTER_OR_DIGIT.test(folded[end]!)) end += 1;
  return folded.slice(index, end);
}

function readKnownPlaces() {
  const names = new Set([...LISTED_NOT_LANGUAGES.map(foldListedName), ...LISTED_REGION_NAMES.map(region => region.folded)]);
  for (const locale of OTHER_LANGUAGE_LOCALES) {
    for (const region of regionNames(locale)) {
      names.add(region.folded);
      // The other name it gives between brackets (« Myanmar (Birmanie) », « Myanmar (Burma) »), of two letters at least.
      for (const [, other] of Array.from(region.name.matchAll(/[(（]([^)）]*)[)）]/g))) {
        const folded = foldListedName(other ?? "");
        if (Array.from(folded).filter(character => LETTER_OR_DIGIT.test(character)).length >= 2) names.add(folded);
      }
    }
  }
  const byWord = new Map<string, string[]>();
  for (const name of Array.from(names)) {
    const start = name.search(LETTER_OR_DIGIT);
    if (start < 0) continue;
    const word = wordAt(name, start);
    byWord.set(word, [...(byWord.get(word) ?? []), name]);
  }
  return byWord;
}

/** Where the countries and places known here are written in this folded text: whole words, anywhere in a script written without spaces. */
function knownPlacesIn(folded: string) {
  knownPlaces ??= readKnownPlaces();
  const found: Array<readonly [number, number]> = [];
  for (let index = 0; index < folded.length; index += 1) {
    if (!LETTER_OR_DIGIT.test(folded[index]!) || (SPACED_SCRIPT.test(folded[index]!) && !startsWord(folded, index))) continue;
    for (const name of knownPlaces.get(wordAt(folded, index)) ?? []) {
      const start = index - name.search(LETTER_OR_DIGIT);
      if (start < 0 || !folded.startsWith(name, start)) continue;
      if (SPACED_SCRIPT.test(name) && (!startsWord(folded, start) || LETTER_OR_DIGIT.test(folded[start + name.length] ?? ""))) continue;
      found.push([start, start + name.length]);
    }
  }
  return found;
}

function saysOnly(text: string, words: "languages" | "requirements" | "qualifiers") {
  const { core } = comparedText(text);
  const covered = new Uint8Array(core.length);
  const cover = (places: ReadonlyArray<readonly [number, number]>) => { for (const [start, end] of places) covered.fill(1, start, end); };
  if (words === "languages") {
    otherLanguageNames ??= readOtherLanguageNames();
    otherLanguageNames.forEach((_, name) => cover(wordsPlaces(core, name)));
    const written = writtenText(text);
    for (const [, name] of ACCENTED_NAMES) if (containsWords(written, name)) cover(wordsPlaces(core, foldLanguageText(name)));
  }
  if (words === "qualifiers") cover(knownPlacesIn(core));
  // A hyphen joins the words of a requirement as a space does (« must-have », « near-native »), one character for one.
  const spaced = core.replace(/[-\u2010\u2011]/g, " ");
  for (const word of REQUIREMENT_WORD_FORMS) {
    for (let index = spaced.indexOf(word.folded); index >= 0; index = spaced.indexOf(word.folded, index + 1)) {
      const ending = word.spaced ? (startsWord(spaced, index) ? word.ending.exec(spaced.slice(index + word.folded.length)) : null) : [""];
      if (ending) covered.fill(1, index, index + word.folded.length + ending[0].length);
    }
  }
  const characters = Array.from(core);
  let index = 0;
  return characters.every((character, position) => {
    const at = index;
    index += character.length;
    if (covered[at] || !LETTER_OR_MARK.test(character) || DIGIT.test(character)) return true;
    // A single letter, between characters that are not letters of its script (« B2 », « B级 », « l'oral »).
    return SPACED_SCRIPT.test(character) && !SPACED_SCRIPT.test(characters[position - 1] ?? "") && !SPACED_SCRIPT.test(characters[position + 1] ?? "");
  });
}

/** The two-letter region codes, AA to ZZ: Intl.DisplayNames names those that exist. */
const REGION_CODES = Array.from({ length: 26 * 26 }, (_, index) => String.fromCharCode(65 + Math.floor(index / 26), 65 + (index % 26)));
/**
 * A region name as Intl.DisplayNames gives it, as it is written, case aside,
 * what it says between brackets aside, its spaces single (« indonesien »,
 * « myanmar » for « Myanmar (Burma) »), and folded as the listed names.
 */
type RegionName = { name: string; written: string; folded: string };
function regionName(name: string): RegionName {
  const written = name.normalize("NFC").toLowerCase().replace(/[(（][^)）]*[)）]/g, " ").replace(/\s+/g, " ").trim();
  return { name, written, folded: foldLanguageText(written) };
}
/** The country names of the list above (« Myanmar »), regions also where Intl.DisplayNames is missing. */
const LISTED_REGION_NAMES: readonly RegionName[] = ["Myanmar"].map(regionName);
/** By locale, the region names Intl.DisplayNames gives in it, long and short: each read when first asked for. */
const REGION_NAMES = new Map<string, readonly RegionName[]>();
/** By code, the names Intl.DisplayNames gives a language in the table's four languages, folded: each read when first asked for. */
const DISPLAYED_LANGUAGE_NAMES = new Map<string, ReadonlySet<string>>();

function regionNames(locale: string) {
  const cached = REGION_NAMES.get(locale);
  if (cached) return cached;
  const names = new Map<string, RegionName>();
  if (typeof Intl.DisplayNames === "function") {
    try {
      for (const style of ["long", "short"] as const) {
        const display = new Intl.DisplayNames([locale], { type: "region", style, fallback: "none" });
        for (const region of REGION_CODES) {
          const name = display.of(region);
          if (name) names.set(name, regionName(name));
        }
      }
    } catch {
      // A locale this host cannot name regions in: the names read before it.
    }
  }
  const read = Array.from(names.values());
  REGION_NAMES.set(locale, read);
  return read;
}

function displayedLanguageNames(code: string) {
  const cached = DISPLAYED_LANGUAGE_NAMES.get(code);
  if (cached) return cached;
  const names = new Set<string>();
  if (typeof Intl.DisplayNames === "function") {
    try {
      for (const locale of OTHER_LANGUAGE_LOCALES) {
        const name = new Intl.DisplayNames([locale], { type: "language", fallback: "none" }).of(code);
        if (name) names.add(foldListedName(name));
      }
    } catch {
      // A code this host cannot name: the names read before it.
    }
  }
  DISPLAYED_LANGUAGE_NAMES.set(code, names);
  return names;
}

/**
 * Whether the languages the table does not know that a part beside a dash
 * names, with only requirement words beside them (above), are only named by
 * a country's name, which qualifies the language next to it (IA02-R4): a
 * region name of Intl.DisplayNames in French, English, German or Chinese, or
 * in a language the part names, is written whole in its words outside
 * brackets, accents aside, and each name of a language written there lies
 * within such a region name. Written as Intl.DisplayNames writes it, case
 * aside, it is a country's name whatever language also bears it (« Englisch
 * – Indonesien », « Englisch – Georgien », « English – Nauru »); written
 * otherwise, it is a language when it is, accents aside, that language's
 * French, English, German or Chinese name (« Anglais – Arménien »,
 * « Indonésien – Anglais »), and a country otherwise (« Português –
 * Indonésia »). « English – Indonesia », « Anglais – Myanmar (Birmanie) »,
 * « Englisch – Myanmar », « English – Myanmar required » and « English – C1
 * Myanmar » are English in a country, as « English – Malaysia required » is,
 * although « Indonesia » is Indonesian in its own language and « Myanmar » an
 * English name of Burmese, which a candidate's language still reads as;
 * « Bahasa Indonesia », a name of Indonesian, and « Myanmar Wolof » stay
 * languages, as « Wolof » and « Serbo-croate » do.
 */
function namesRegion(text: string) {
  const compared = comparedText(text);
  const languages = compared.others;
  const written = writtenText(text).replace(/\s+/g, " ");
  const regions: Array<readonly [number, number]> = [];
  for (const names of [LISTED_REGION_NAMES, ...[...OTHER_LANGUAGE_LOCALES, ...languages].map(regionNames)]) {
    for (const name of names) {
      const places = wordsPlaces(compared.core, name.folded);
      if (places.length && (containsWords(written, name.written) || !languages.some(code => displayedLanguageNames(code).has(name.folded)))) regions.push(...places);
    }
  }
  if (!regions.length) return false;
  otherLanguageNames ??= readOtherLanguageNames();
  const outsideRegions = Array.from(otherLanguageNames.keys()).some(name =>
    wordsPlaces(compared.core, name).some(([start, end]) => !regions.some(region => region[0] <= start && end <= region[1])));
  if (outsideRegions) return false;
  return !ACCENTED_NAMES.some(([, name]) => containsWords(written, name));
}

/**
 * IA02-R5: the region names of Intl.DisplayNames in French, English, German
 * or Chinese that are wholly a name of the table in another of them: « Italien »,
 * Italy in German and Italian in French. Each read when first asked for, with
 * the languages it is a language's name in.
 */
type RegionNamedAsLanguage = RegionName & { locale: string; languageLocales: readonly string[] };
let regionsNamedAsLanguages: readonly RegionNamedAsLanguage[] | undefined;

function readRegionsNamedAsLanguages() {
  const found: RegionNamedAsLanguage[] = [];
  for (const locale of OTHER_LANGUAGE_LOCALES) {
    for (const region of regionNames(locale)) {
      const languageLocales = new Set<string>();
      for (const entry of LANGUAGE_NAMES) {
        if (namePlaces(region.folded, entry).some(([start, end]) => start === 0 && end === region.folded.length)) languageLocales.add(entry.writtenIn);
      }
      if (languageLocales.size && !languageLocales.has(locale)) found.push({ ...region, locale, languageLocales: Array.from(languageLocales) });
    }
  }
  return found;
}

/** This folded text with each place where these folded words are found whole written as spaces. */
const blankWords = (folded: string, words: string) =>
  wordsPlaces(folded, words).reduce((current, [start, end]) => current.slice(0, start) + " ".repeat(end - start) + current.slice(end), folded);

/**
 * The region names above that a required text writes as Intl.DisplayNames
 * writes them, accents included, case aside, in the language the text is
 * written in, and that are no language there: in « Englisch – Italien », the
 * German of « Englisch » makes « Italien » Italy; in « Anglais – Italien »,
 * the French of « Anglais » keeps it Italian, as in « Italien » alone. The
 * language a text is written in is that of the names of the table it writes
 * beside the region's.
 */
function regionsReadAsPlaces(required: string): readonly RegionName[] {
  regionsNamedAsLanguages ??= readRegionsNamedAsLanguages();
  const { searched } = comparedText(required);
  const written = writtenText(required);
  const present = regionsNamedAsLanguages.filter(region => containsWords(written, region.written) && containsWords(searched, region.folded));
  if (!present.length) return [];
  const beside = present.reduce((current, region) => blankWords(current, region.folded), searched);
  const locales = new Set(LANGUAGE_NAMES.filter(entry => namesLanguage(beside, entry)).map(entry => entry.writtenIn));
  return present.filter(region => locales.has(region.locale) && !region.languageLocales.some(locale => locales.has(locale)));
}

/** The codes of the languages of the table a part of a required text names, the regions it writes read as places aside. */
function codesBeside(text: string, places: readonly RegionName[]) {
  const compared = comparedText(text);
  const written = writtenText(text);
  const present = places.filter(region => containsWords(written, region.written) && containsWords(compared.searched, region.folded));
  if (!present.length) return compared.codes;
  return namedCodes(present.reduce((current, region) => blankWords(current, region.folded), compared.searched));
}

/**
 * Whether a part between separators names a language: one of the table (or
 * the start of its name, three letters at least, as the Langue filter reads
 * it during typing), or one it does not know that is no country's name
 * (« Wolof », « Tamil Nadu », « créole martiniquais », « swahili pour les
 * patients »; not « Indonesia », « Qatar », « Herzegovina », « écrit »,
 * « C2 »), whatever words are written with it, among the places a dash
 * opened too (IA02-R6-LANGUE-APRES-LIEUX): a language's name is never lost
 * there, at the cost of a place that holds one (« Tamil Nadu », « Somali
 * Region ») read as a requirement of its own after a separator. IA02-R7: and
 * a language's Chinese name, which no list knows (below: « 英语 – 迪拜，上海话 »).
 */
function namesLanguageAmong(part: string, places: readonly RegionName[]) {
  if (codesBeside(part, places).length) return true;
  if (namesOtherLanguage(part)) return !namesRegion(part);
  return (recruitmentLanguagePrefixCodes(part).length > 0 && !isRegionName(part)) || chineseLastWord(part) === "name";
}

/**
 * IA02-R7: how a part written in Chinese ends, once the known words a language
 * is qualified with that end otherwise are set aside (« 上海话优先 »,
 * « 潮州话流利 », « 会说上海话的 »). A language's Chinese name ends with 语,
 * 话, 文 or 言, whether a list knows it or not (粤语, 上海话, 潮州话, 台语,
 * 手语, 中文): such a last word, outside the closed list, is a language's
 * name (`name`); a word of the list that ends so is what the language is used
 * for or how (术语, 用语, 口语, 语言: `qualifier`); any other Chinese word is a
 * place, a field or a use (迪拜, 患者沟通: `other`); a part whose last word is
 * not Chinese, or that is wholly the known words a language is qualified
 * with, is none of them (`none`). IA02-R7B: a word that ends with 话, 文 or 言
 * is a language's name only after a known name (namesChineseSpeech, below);
 * any other is an everyday word (电话, 打电话, 讲话, 论文, 作文, 发言, 留言,
 * 方言: `other`), read as « téléphone », « phone » and « Telefon » are.
 */
function chineseLastWord(part: string): "name" | "qualifier" | "other" | "none" {
  if (!HAN_CHARACTER.test(part) || saysOnlyQualifiers(part)) return "none";
  let rest = comparedText(part).core;
  for (;;) {
    rest = rest.replace(TRAILING_NOT_WORDS, "");
    const word = REQUIREMENT_WORD_FORMS.find(form => !form.spaced && rest.endsWith(form.folded));
    if (word && CHINESE_NAME_ENDINGS.includes(word.folded.at(-1)!)) return "qualifier";
    if (!word || rest.length <= word.folded.length) break;
    rest = rest.slice(0, -word.folded.length);
  }
  const last = rest.at(-1) ?? "";
  if (!HAN_CHARACTER.test(last)) return "none";
  return CHINESE_NAME_ENDINGS.includes(last) && namesChineseSpeech(rest) ? "name" : "other";
}

/**
 * The names a Chinese word that ends with 话, 文 or 言 is a language's name
 * after, as above, read when first asked for: `stems`, those of languages,
 * places and peoples, wherever they end what is written before that
 * character; `length`, the longest of them.
 */
type ChineseSpeechStems = { stems: ReadonlySet<string>; length: number };
let chineseSpeechStems: ChineseSpeechStems | undefined;

function readChineseSpeechStems(): ChineseSpeechStems {
  const stems = new Set<string>();
  let length = 0;
  const add = (name: string) => {
    if (!HAN_WORD.test(name)) return;
    stems.add(name);
    length = Math.max(length, name.length);
  };
  // A language's Chinese name without its last character; not 国 of 国语, which ends a word for a country (所在国, 外国), nor
  // what ends with 语, 话, 文 or 言 itself, a word of its own (文言 of 文言文, Literary Chinese, also a literary style).
  const addLanguage = (name: string) => {
    const stem = name.slice(0, -1);
    if (CHINESE_NAME_ENDINGS.includes(name.at(-1) ?? "") && !COUNTRY_CHARACTERS.includes(stem) && !CHINESE_NAME_ENDINGS.includes(stem.at(-1) ?? "")) add(stem);
  };
  otherLanguageNames ??= readOtherLanguageNames();
  [...LANGUAGE_NAMES.map(entry => entry.folded), ...Array.from(otherLanguageNames.keys())].forEach(addLanguage);
  // IA02-R8: the Chinese names Intl.DisplayNames gives to every language it names, the table's, those above and the others
  // (拉丁语, 梵语, 巴利语, 阿拉米语, 吴语; 拉丁文, 史瓦希里文, 阿維斯塔文), as each of the lists' (斯瓦希里语, 广东话).
  if (typeof Intl.DisplayNames === "function") {
    for (const locale of CHINESE_LOCALES) {
      try {
        const display = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
        for (const code of [...RECRUITMENT_LANGUAGES.map(language => language.code), ...OTHER_LANGUAGE_CODES, ...CHINESE_NAMED_LANGUAGE_CODES]) {
          addLanguage(foldListedName(display.of(code) ?? ""));
        }
      } catch {
        // A locale or a code this host cannot name: the names of the lists and of the other locale.
      }
    }
  }
  // IA02-R8B: the places and the peoples, those of one character among them (维, 蒙, 傣), wherever they end that text.
  [CHINESE_SHORT_LANGUAGE_NAMES, CHINESE_PLACE_NAMES, CHINESE_PEOPLE_NAMES].forEach(names => names.split(" ").forEach(add));
  [...TAIWAN_NAMES, ...regionNames("zh").map(region => region.folded)].forEach(add);
  return { stems, length };
}

/**
 * IA02-R7B: whether the Chinese word that ends this folded text, with 语, 话,
 * 文 or 言, is a language's name. One that ends with 语 (語) always is (粤语,
 * 台语, 手语). One that ends with 话, 文 or 言 is when what is written before
 * that character ends with the name of a language (英文, 法文, 粤话, 希腊文;
 * IA02-R8: any language Intl.DisplayNames names in Chinese, 拉丁文, 梵文,
 * 巴利文, 吴话), of a country or a region Intl.DisplayNames gives in Chinese
 * (台湾话, 新加坡话, 香港话), of a Chinese province, area or city (上海话,
 * 潮州话, 四川话, 温州话, 东北话), of a people (藏文, 维文, 新疆维文, 德宏傣文)
 * or a usual short name (印尼文, 越文), or when it is 白话, 官话 or 平话
 * (熟悉白话, 当地官话, 广东白话, 西南官话, 桂南平话); IA02-R8B: but in the
 * everyday words of the closed list above (大白话, 明白话, 打官话, 恭维话).
 * Any other is an everyday word (电话, 通话, 说话, 论文, 公文, 原文, 发言,
 * 前言, 方言, 文言).
 */
function namesChineseSpeech(folded: string) {
  if (!CHINESE_WORD_ENDINGS.includes(folded.at(-1) ?? "")) return true;
  const before = folded.slice(0, -1);
  if (CHINESE_EVERYDAY_STEMS.some(stem => before.endsWith(stem))) return false;
  if (CHINESE_SPEECH_NAMES.some(name => folded.endsWith(name))) return true;
  chineseSpeechStems ??= readChineseSpeechStems();
  const { stems, length } = chineseSpeechStems;
  for (let size = Math.min(before.length, length); size > 0; size -= 1) {
    if (stems.has(before.slice(-size))) return true;
  }
  return false;
}

/**
 * IA02-R6: how a part between separators is read, after the parts before it.
 * A part that names a language is a requirement, among the places a dash
 * opened too, whatever words are written with the language's name
 * (« Français – Martinique, créole martiniquais », « Anglais – Dubaï, swahili
 * pour les patients »: two). A part that names none qualifies the requirement
 * before it only when it is wholly the known words a language is qualified
 * with (« écrit », « C1/C2 », « 5 ans », « Qatar »), or when it goes on with
 * the places a dash opened beside the language before it (« Anglais – Riyad,
 * Dubaï », « Arabe – Golfe, Levant », « English – Tamil Nadu and Kerala »).
 * Any other part, a word no list knows in it, is a requirement of its own,
 * read by its words, as before the lists were read whole: « Français,
 * Darija », « Deutsch, Arabisch, Somalisch », « Anglais – courant, Darija »
 * and « Anglais – Wolof, Dakar » keep each part, so that no language is lost.
 * IA02-R7: a part with a dash of its own, after a separator, opens a new
 * requirement, led by what it writes before its dash, unless that is wholly
 * the known words a language is qualified with (« niveau – C1 »): it never
 * goes on with the places the requirement before it opened, nor qualifies it
 * (« Arabe – courant ; Wolof – Dakar ; Romani – notions »: three, Wolof
 * required as Romani is).
 * `placesOpen`: whether the parts after it go on with places a dash opened.
 */
type PartReading = { requires: boolean; placesOpen: boolean };

function readPart(part: string, places: readonly RegionName[], placesOpen: boolean): PartReading {
  if (namesLanguageAmong(part, places) || leadsOwnRequirement(part)) return { requires: true, placesOpen: opensPlaces(part, places) };
  if (placesOpen || saysOnlyQualifiers(part)) return { requires: false, placesOpen };
  return { requires: true, placesOpen: opensPlaces(part, places) };
}

/** Whether a part has a dash of its own, and before its first dash something else than the known words a language is qualified with (« Wolof – Dakar », « Romani – notions »; not « niveau – C1 »). */
function leadsOwnRequirement(part: string) {
  const parts = partsOutsideBrackets(part, DASH);
  return parts.length > 1 && !saysOnlyQualifiers(parts[0]!);
}

/**
 * Whether a requirement ends with places a dash opened: its last part beside a
 * dash names no language (as read there, below) and says more than how a
 * language is required, a place, a region or a variety (« Anglais – Riyad »,
 * « Arabe – Golfe », « English – UAE », « English – Tamil Nadu »; not
 * « Anglais – courant », « Anglais – C1 », nor « Anglais – Wolof »).
 */
function opensPlaces(requirement: string, places: readonly RegionName[]) {
  const parts = partPlaces(requirement, BETWEEN_NAMES);
  const last = parts.at(-1);
  if (parts.length < 2 || !last) return false;
  const part = requirement.slice(last.start, last.end);
  return !namesLanguageBetween(part, requirement.slice(parts.at(-2)!.end, last.start), places) && !saysOnlyRequirements(part);
}

/** Whether this text is wholly a region name of Intl.DisplayNames in French, English, German or Chinese (« Russia », « Japan », « Chine »). */
function isRegionName(text: string) {
  const { core } = comparedText(text);
  return [LISTED_REGION_NAMES, ...OTHER_LANGUAGE_LOCALES.map(regionNames)].some(names => names.some(name => name.folded === core));
}

/**
 * The parts of a text at a Chinese conjunction or a dash, each that names a
 * language with the parts after it that name none, which qualify it: a level
 * (« Anglais - C1 - Arabe » is « Anglais - C1 » and « Arabe »), a requirement
 * (« Anglais – obligatoire »), a variety or a region (« Arabe – Golfe »,
 * « Portugais – Brésil »). And the parts before the first one that names one
 * with it (埃 in 埃及阿拉伯语, Egyptian Arabic). A part names a language the
 * table does not know when it is wholly its name, its requirement words aside
 * (« Wolof – Anglais », « Serbo-croate – Anglais » and « Anglais – Wolof
 * courant » are two, as with « / »), unless the name is a country's too
 * (« English – Indonesia » is one); a part that holds the name among other
 * words is a place, a use or a variety of the language beside it
 * (« English – Tamil Nadu », « Français – Pays basque », « Anglais – Sénégal
 * wolof » are one). A name of the table in a place's name names no language
 * (« English – Persian Gulf », « Anglais – Polynésie française »), nor a
 * country's name written in the language of the text (« Englisch – Italien »).
 * Another name of the language beside it is a variety of it (« Arabe –
 * Fusha », « Chinois – Mandarin »: one, IA02-R7). After a Chinese
 * conjunction, as after « et », « and », « und », a part is a language of its
 * own also when no list knows it (below: « 英语和上海话 », « 英语 – 流利及潮州话 »:
 * two, IA02-R7).
 */
function partsBetweenNames(text: string, places: readonly RegionName[]) {
  const groups = groupedParts(text, BETWEEN_NAMES, (part, before) => namesLanguageBetween(part, before, places));
  // IA02-R7: a part that names only languages of the table the part before it names, under another of their names, is a
  // variety of them that qualifies them (« Arabe – Fusha », « Chinois – Mandarin »), as « Arabe – Golfe » does.
  const merged: typeof groups = [];
  let previous: readonly RecruitmentLanguageCode[] = [];
  for (const group of groups) {
    const part = text.slice(group.start, group.end);
    const codes = codesBeside(part, places);
    const last = merged.at(-1);
    if (last && previous.length && codes.length && codes.every(code => previous.includes(code)) && !namesOtherLanguage(part)) last.end = group.end;
    else {
      merged.push(group);
      previous = codes;
    }
  }
  return merged;
}

/** Whether a part beside a dash names a language, as read above: one of the table, or wholly the name of one it does not know that is no country's. */
function namesLanguageBesideDash(part: string, places: readonly RegionName[]) {
  return codesBeside(part, places).length > 0 || (namesOtherLanguage(part) && namesOnlyLanguages(part) && !namesRegion(part));
}

/** A Chinese conjunction, which 和, 及 and 与 also are within a word (埃及, 共和国) or as « with » (« 与患者沟通 »). */
const CHINESE_CONJUNCTION_WRITTEN = new RegExp(CHINESE_CONJUNCTION.source, "u");
/** IA02-R8: the Chinese conjunctions that end a text, written right before what follows it (« 和 » of « 英语和和田文 »). */
const CHINESE_CONJUNCTIONS_AT_END = new RegExp(`(?:${CHINESE_CONJUNCTION.source})+$`, "u");
/** What ends a text after its last word: digits, the Chinese numerals among them (« 上海话三年以上 »), punctuation, spaces. */
const TRAILING_NOT_WORDS = new RegExp(`(?:[^\\p{L}]|${DIGIT.source})+$`, "u");

/**
 * Whether a part between a Chinese conjunction or a dash, after these
 * separators (`before`), names a language: beside a dash, as read above; after
 * a Chinese conjunction (IA02-R7), as after « et », « and », « und », any part
 * but one that is wholly the known words a language is qualified with, or a
 * Chinese phrase whose last word is no language's Chinese name (above):
 * « 英语和上海话 » and « 英语 – 流利及潮州话 » are two, as « Anglais et
 * Shimaoré » and « English – fluent and Teochew » are, and « 英语和Darija »
 * too. 和 and 与 also mean « with », and a Chinese phrase that ends otherwise
 * says what the language is used for (« 英语 – 与患者沟通 », with the
 * patients), as « avec les patients » does. IA02-R8: the part is read with
 * the conjunctions written right before it, which may also be the first
 * character of a name (« 英语和和田文 », English and Khotanese, as 埃及 in
 * « 埃及阿拉伯语 »).
 */
function namesLanguageBetween(part: string, before: string, places: readonly RegionName[]) {
  if (namesLanguageBesideDash(part, places)) return true;
  if (!CHINESE_CONJUNCTION_WRITTEN.test(before) || saysOnlyQualifiers(part)) return false;
  // A part that is not wholly qualifiers: a requirement unless it is a Chinese phrase that ends otherwise than a name.
  const last = chineseLastWord(`${CHINESE_CONJUNCTIONS_AT_END.exec(before)?.[0] ?? ""}${part}`);
  return last === "name" || last === "none";
}

/** Where each part of a text between these separators lies in it: its start and its end. */
type PartPlace = { start: number; end: number };

/**
 * The parts of a text between these separators, each that names a language
 * with the parts after it that name none, and the parts before the first one
 * that names one with it: their starts and ends in the text. Whether a part
 * names one is read with the separators written before it.
 */
function groupedParts(text: string, separator: RegExp, names: (part: string, before: string) => boolean) {
  const groups: Array<PartPlace & { names: boolean }> = [];
  let previousEnd = 0;
  for (const { start, end } of partPlaces(text, separator)) {
    const named = names(text.slice(start, end), text.slice(previousEnd, start));
    previousEnd = end;
    const last = groups.at(-1);
    if (last && (!named || !last.names)) Object.assign(last, { end, names: named || last.names });
    else groups.push({ start, end, names: named });
  }
  return groups;
}

/** Where the parts of a text between the separators found outside its brackets lie, each trimmed, those with a letter or a digit. */
function partPlaces(text: string, separator: RegExp) {
  const places: PartPlace[] = [];
  let cursor = 0;
  for (const part of partsOutsideBrackets(text, separator)) {
    const start = text.indexOf(part, cursor);
    cursor = start + part.length;
    places.push({ start, end: cursor });
  }
  return places;
}

/**
 * The parts of a text between the separators found outside its brackets and
 * outside the names of the countries known here that hold one (IA02-R6:
 * « Bosnia and Herzegovina », « Französische Süd- und Antarktisgebiete »,
 * « 波斯尼亚和黑塞哥维那 », read whole), each trimmed, those with a letter or
 * a digit.
 */
function partsOutsideBrackets(text: string, separator: RegExp) {
  const parts: string[] = [];
  let start = 0;
  const outside = blankPlacesWithSeparators(blankBrackets(text));
  separator.lastIndex = 0;
  for (let found = separator.exec(outside); found; found = separator.exec(outside)) {
    parts.push(text.slice(start, found.index));
    start = found.index + found[0].length;
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(part => LETTER_OR_DIGIT.test(part));
}

/**
 * IA02-R5: the requirements of a text at its separators, each part that is a
 * requirement split at its dashes (above), each part that qualifies one (as
 * read above, IA02-R6) kept with the requirement before it, as after a dash:
 * « Anglais – parlé et écrit », « Anglais – C1/C2 », « English – UAE and
 * Qatar », « English – Bosnia and Herzegovina » and « Anglais – Riyad, Dubaï »
 * are one, met by English; « Anglais et arabe », « Anglais – obligatoire,
 * Arabe – souhaité », « Français, Darija » are two, « Anglais – Wolof, Dakar »
 * three. The parts before the first requirement that qualify one qualify the
 * first requirement (« obligatoire : anglais, arabe »). When no part is a
 * requirement, each is one of its own, as before.
 */
function requirementTexts(required: string, separator: RegExp, places: readonly RegionName[]) {
  let placesOpen = false;
  const parts = partPlaces(required, separator).map(part => {
    const reading = readPart(required.slice(part.start, part.end), places, placesOpen);
    placesOpen = reading.placesOpen;
    return { ...part, requires: reading.requires };
  });
  const requiring = parts.some(part => part.requires);
  const requirements: PartPlace[] = [];
  let leading: number | undefined;
  for (const { start, end, requires } of parts) {
    if (requiring && !requires) {
      // A qualifier of the requirement before it, or of the first one.
      if (requirements.length) requirements.at(-1)!.end = end;
      else leading ??= start;
      continue;
    }
    const groups = partsBetweenNames(required.slice(start, end), places).map(group => ({ start: start + group.start, end: start + group.end }));
    if (leading !== undefined) groups[0]!.start = leading;
    leading = undefined;
    requirements.push(...groups);
  }
  return requirements.map(({ start, end }) => required.slice(start, end));
}

/**
 * The languages a required text names, each a requirement of its own
 * (« Anglais/Arabe », « anglais et arabe », « Englisch und Arabisch »,
 * « Anglais - Arabe », « 英语和阿拉伯语 »: two), so that the matching
 * profiles, the missions and the Langue filter count them alike. Not split
 * inside brackets (« Anglais (C1/C2) » is one), nor at a Chinese conjunction,
 * a dash or a separator before a part that names no language (« Anglais -
 * courant », « Anglais – parlé et écrit » are one). A part that names several
 * languages without a separator (« anglais arabe ») requires them all; a
 * text that offers a choice (« Anglais ou arabe », « anglais et/ou arabe »)
 * is one requirement, met by any of its languages, and a choice between two
 * levels (« English – Tamil B2 or above », « Anglais – C1 ou C2 ») none.
 */
export function recruitmentLanguageRequirements(required: string): readonly RecruitmentLanguageRequirement[] {
  // A profile reads its requirements again for each of its 10 000 dossiers: each text is split once.
  const cached = READ_REQUIREMENTS.get(required);
  if (cached) return cached;
  let requirements: RecruitmentLanguageRequirement[];
  const places = regionsReadAsPlaces(required);
  // The options of a choice, each with the requirement words that follow it, up to a dash (« B2 or above »: one option).
  const options = ALTERNATIVE.test(blankBrackets(required))
    ? groupedParts(required, OPTION_SEPARATOR, part => !saysOnlyRequirements(partsOutsideBrackets(part, BETWEEN_NAMES)[0] ?? part))
      .map(({ start, end }) => required.slice(start, end))
    : [];
  if (options.length > 1) {
    const text = required.trim();
    const anyOf = options.map(option => option.replace(OPTION_CONNECTOR, "").trim()).filter(option => LETTER_OR_DIGIT.test(option));
    requirements = [{ text, codes: codesBeside(text, places), anyOf }];
  } else {
    requirements = requirementTexts(required, options.length ? OPTION_SEPARATOR : REQUIREMENT_SEPARATOR, places)
      .map(text => ({ text, codes: codesBeside(text, places), anyOf: [] }));
  }
  if (required.length <= COMPARED_TEXT_MAX_LENGTH) {
    if (READ_REQUIREMENTS.size >= COMPARED_TEXTS_LIMIT) READ_REQUIREMENTS.clear();
    READ_REQUIREMENTS.set(required, Object.freeze(requirements));
  }
  return requirements;
}

/**
 * The lists of required languages already read, as the texts above, whatever
 * their length (IA02-R6): a profile of 12 terms of 80 characters is read once,
 * not for each of the 10 000 dossiers a request checks. Bounded by its number
 * of lists and their total length, and emptied before it would hold more.
 */
const READ_LISTS = new Map<string, readonly RecruitmentLanguageRequirement[]>();
const READ_LISTS_LENGTH_LIMIT = 1_000_000;
let readListsLength = 0;

/**
 * IA02-R5: the requirements of a list of required languages, a mission's (its
 * text split at its commas, semicolons and lines) or a matching profile's
 * (typed with commas), read as one text (IA02-R6, above): each term whose
 * parts all qualify the term before it is kept with it, or with the first;
 * any other term is a requirement of its own: « Anglais – lu », « écrit »,
 * « parlé » are one requirement, met by English, as « Anglais – Riyad »,
 * « Dubaï »; « Anglais », « arabe » and « Français », « Darija » are two.
 */
export function recruitmentLanguageListRequirements(terms: readonly string[]): readonly RecruitmentLanguageRequirement[] {
  const key = JSON.stringify(terms);
  const cached = READ_LISTS.get(key);
  if (cached) return cached;
  const places = regionsReadAsPlaces(terms.join(", "));
  const joined: string[][] = [];
  let leading: string[] = [];
  let placesOpen = false;
  for (const term of terms) {
    // The places a dash opened go on after the term only if each of its parts qualifies.
    let open: boolean = placesOpen;
    const qualifies = partsOutsideBrackets(term, REQUIREMENT_SEPARATOR).every(part => {
      const reading: PartReading = readPart(part, places, open);
      open = reading.placesOpen;
      return !reading.requires;
    });
    if (qualifies) {
      placesOpen = open;
      (joined.at(-1) ?? leading).push(term);
      continue;
    }
    joined.push([...leading, term]);
    leading = [];
    // Read as a text of its own from here: the places its last part opens.
    placesOpen = partsOutsideBrackets(term, REQUIREMENT_SEPARATOR).reduce((current, part) => readPart(part, places, current).placesOpen, false);
  }
  // When no term is a requirement, each is one of its own, as before.
  const texts = joined.length ? joined.map(group => group.join(", ")) : leading;
  const requirements = Object.freeze(texts.flatMap(recruitmentLanguageRequirements));
  if (READ_LISTS.size >= COMPARED_TEXTS_LIMIT || readListsLength + key.length > READ_LISTS_LENGTH_LIMIT) {
    READ_LISTS.clear();
    readListsLength = 0;
  }
  READ_LISTS.set(key, requirements);
  readListsLength += key.length;
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
  return Array.from(new Set(LANGUAGE_NAMES.filter(entry => entry.typedFromStart && entry.folded.startsWith(folded)).map(entry => entry.code)));
}

/**
 * Where these folded words are found whole in this folded text, from `from`:
 * the index of the first place, -1 when none. Words of a script written
 * without spaces or with prefixes are found anywhere in it.
 */
function wordsIndex(folded: string, words: string, from = 0) {
  if (!LETTER_OR_DIGIT.test(words)) return -1;
  if (!SPACED_SCRIPT.test(words)) return folded.indexOf(words, from);
  for (let index = folded.indexOf(words, from); index >= 0; index = folded.indexOf(words, index + 1)) {
    if (startsWord(folded, index) && !LETTER_OR_DIGIT.test(folded[index + words.length] ?? "")) return index;
  }
  return -1;
}

/** Whether these folded words (a language the table does not know) are found whole in this folded name: « wolof » in « Wolof courant », not « fran » in « français ». */
function containsWords(folded: string, words: string) {
  return wordsIndex(folded, words) >= 0;
}

/** Each place where these folded words are found whole in this folded text: its start and its end. */
function wordsPlaces(folded: string, words: string) {
  const places: Array<readonly [number, number]> = [];
  for (let index = wordsIndex(folded, words); index >= 0; index = wordsIndex(folded, words, index + 1)) places.push([index, index + words.length]);
  return places;
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
  const required = comparedRequirement(requirement);
  if (requirement.anyOf.length) return required.options.some(option => givesOtherLanguage(compared, option));
  return givesOtherLanguage(compared, required.text);
}

/**
 * IA02-R6: a requirement's text and options compared, once for each
 * requirement whatever their length: a profile's or a mission's requirements
 * are read once (above) and checked against each of up to 10 000 dossiers,
 * one of 12 terms of 80 characters kept with its places too.
 */
const COMPARED_REQUIREMENTS = new WeakMap<RecruitmentLanguageRequirement, { text: ComparedText; options: readonly ComparedText[] }>();

function comparedRequirement(requirement: RecruitmentLanguageRequirement) {
  const cached = COMPARED_REQUIREMENTS.get(requirement);
  if (cached) return cached;
  const compared = { text: comparedText(requirement.text), options: requirement.anyOf.map(comparedText) };
  COMPARED_REQUIREMENTS.set(requirement, compared);
  return compared;
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
