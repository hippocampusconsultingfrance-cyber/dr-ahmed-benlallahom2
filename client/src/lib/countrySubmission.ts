/**
 * Countries the diploma country lists offer (standard and VVIP forms), as ISO
 * 3166-1 alpha-2 codes. The code is what an application records (EN-11):
 * « TN » whatever the language of the form, not « Tunisie », « Tunisia » or
 * « Tunesien »; each screen shows its name in its own language.
 */
export const WORLDWIDE_COUNTRY_CODES = "AF,AX,AL,DZ,AS,AD,AO,AI,AQ,AG,AR,AM,AW,AU,AT,AZ,BS,BH,BD,BB,BY,BE,BZ,BJ,BM,BT,BO,BQ,BA,BW,BV,BR,IO,BN,BG,BF,BI,CV,KH,CM,CA,KY,CF,TD,CL,CN,CX,CC,CO,KM,CG,CD,CK,CR,CI,HR,CU,CW,CY,CZ,DK,DJ,DM,DO,EC,EG,SV,GQ,ER,EE,SZ,ET,FK,FO,FJ,FI,FR,GF,PF,TF,GA,GM,GE,DE,GH,GI,GR,GL,GD,GP,GU,GT,GG,GN,GW,GY,HT,HM,VA,HN,HK,HU,IS,IN,ID,IR,IQ,IE,IM,IL,IT,JM,JP,JE,JO,KZ,KE,KI,KP,KR,KW,KG,LA,LV,LB,LS,LR,LY,LI,LT,LU,MO,MG,MW,MY,MV,ML,MT,MH,MQ,MR,MU,YT,MX,FM,MD,MC,MN,ME,MS,MA,MZ,MM,NA,NR,NP,NL,NC,NZ,NI,NE,NG,NU,NF,MK,MP,NO,OM,PK,PW,PS,PA,PG,PY,PE,PH,PN,PL,PT,PR,QA,RE,RO,RU,RW,BL,SH,KN,LC,MF,PM,VC,WS,SM,ST,SA,SN,RS,SC,SL,SG,SX,SK,SI,SB,SO,ZA,GS,SS,ES,LK,SD,SR,SJ,SE,CH,SY,TW,TJ,TZ,TH,TL,TG,TK,TO,TT,TN,TR,TM,TC,TV,UG,UA,AE,GB,US,UM,UY,UZ,VU,VE,VN,VG,VI,WF,EH,YE,ZM,ZW".split(",");

const WORLDWIDE_COUNTRY_CODE_SET = new Set(WORLDWIDE_COUNTRY_CODES);
/** Languages the forms showed the names in, and recorded them in, before EN-11. */
const RECORDED_NAME_LANGUAGES = ["fr", "en", "de", "zh"] as const;

const regionNames = new Map<string, Intl.DisplayNames>();
function regionNamesIn(locale: string) {
  let names = regionNames.get(locale);
  if (!names) regionNames.set(locale, names = new Intl.DisplayNames([locale], { type: "region" }));
  return names;
}

/** A country name as compared: composed, typographic apostrophe as a plain one, any case. */
function comparableCountryName(value: string) {
  return value.normalize("NFC").replace(/[’ʼ]/g, "'").trim().toLocaleLowerCase("fr");
}

let codesByName: Map<string, string> | null = null;
function codeOfCountryName(name: string) {
  if (!codesByName) {
    codesByName = new Map();
    for (const language of RECORDED_NAME_LANGUAGES) {
      for (const code of WORLDWIDE_COUNTRY_CODES) {
        const label = regionNamesIn(language).of(code);
        if (label && label !== code) codesByName.set(comparableCountryName(label), code);
      }
    }
  }
  return codesByName.get(comparableCountryName(name)) ?? null;
}

/**
 * Code of a diploma country: the code itself (« TN »), or a name the forms
 * recorded before EN-11, in French, English, German or Chinese (« Tunisie »,
 * « Tunisia », « Tunesien », « 突尼斯 »); null for anything else. The site
 * reads both until drizzle/pg/0005_country_codes.sql has turned the names
 * stored into codes.
 */
export function countryCodeOf(value: string | null | undefined): string | null {
  const recorded = value?.trim() ?? "";
  if (!recorded) return null;
  if (WORLDWIDE_COUNTRY_CODE_SET.has(recorded)) return recorded;
  return codeOfCountryName(recorded);
}

/**
 * A recorded diploma country as `locale` names it (« TN » : « Tunisie » in
 * French, « Tunisia » in English); a name recorded before EN-11 is translated
 * the same way, and a value that names no country is shown as recorded.
 */
export function countryLabel(value: string | null | undefined, locale: string): string {
  const code = countryCodeOf(value);
  if (!code) return value?.trim() ?? "";
  return regionNamesIn(locale).of(code) || code;
}

/**
 * The diploma country to send, as its code. Some mobile browsers restore or
 * autofill a visible form control without dispatching React's change event:
 * prefer the controlled value, but recover the visible DOM value at
 * submission time when state is still empty. That value may be the option's
 * code (VVIP select) or the name shown (standard search field); with
 * `countries`, only one of theirs is recovered, as its code.
 */
export function resolveCountryForSubmission(stateValue: string, visibleValue: FormDataEntryValue | null, countries?: readonly { code: string; label: string }[]): string {
  const normalizedState = stateValue.trim();
  if (normalizedState) return normalizedState;
  const normalizedVisible = typeof visibleValue === "string" ? visibleValue.trim() : "";
  if (!normalizedVisible) return "";
  if (!countries) return normalizedVisible;
  return countries.find(country => country.code === normalizedVisible || country.label === normalizedVisible)?.code ?? "";
}
