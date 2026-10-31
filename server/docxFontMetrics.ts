// Written by scripts/generate-docx-font-metrics.mjs from the fonts installed (fc-match) and a folder of free fonts (fc-scan): run it again rather than edit this file.

/** The characters measured, in order: Latin text, its punctuation and common signs. */
export const DOCX_FONT_CHARACTERS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ‐‑‒–—―‖‗‘’‚‛“”„‟†‡•‣․‥…‧‰′″‹›€™←↑→↓−≤≥●✓";

/** The digits of the widths of DOCX_FONT_METRICS, two for each character. */
export const DOCX_FONT_WIDTH_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** In the widths of DOCX_FONT_METRICS, in place of two digits: as wide as the character's base letter (the first of its canonical decomposition, NFD). */
export const DOCX_FONT_AS_BASE = ".";

/** In the widths of a slanted style, then a digit (how many, less one): characters as wide as in its upright style. */
export const DOCX_FONT_AS_UPRIGHT = ",";

/**
 * Of each font measured: the height of a line of single spacing (the tallest
 * Word or LibreOffice sets; 0 when the fonts it stands for set theirs
 * otherwise, unknown here), and the advance of each character of
 * DOCX_FONT_CHARACTERS in each of its styles; in thousandths of the font size,
 * rounded up; 0 for a character the font lacks. Of a slanted style, the
 * wider of its advance and of its upright style's, Word possibly drawing it
 * upright; left out when never wider. Of fonts not measured but at least as
 * wide as one that is, the advances of that one (`as`), and no line.
 * DOCX_NARROWEST_FONT: what any other font not measured is given.
 */
export const DOCX_FONT_METRICS: Record<string, { line: number; regular: string; bold: string; italic?: string; boldItalic?: string } | { line: number; as: string }> = {
  "carlito": {
    line: 1221,
    regular: "3Z566H7p7xBBAh3T4m4m7p7p3w4p3z637x7x7x7x7x7x7x7x7x7x4C4C7p7p7p7GD_938W8M9e7f7C9t9m3y4_886bDNA6AN85AX8V7C7eA28uDw887e7L4p634p7p7p4a7W8E6d8E7o4o7N8E3c3m773cCV8E8G8E8E5T685F8E74BB6o756C4x7D4x7p3Z567p7x7p7x7p7p69D36J817p007x6B5J7p5G5F4a8c9A3z4q3t6d819zAWAa7G......By.........9n......7pAO.....858G......C5.........8E......7p8I.....8E................8v9n8e....................AH8L.........3c8y7L....77....6d488Y5s6k3u......949r8E......DZDI.................5Q7e5M.......................3p00007x7pEAEA6C7p3w3w3w3w6Z6Z6Z6Y7p7p7p000000Ap00GF006H5J5J7xB2EAEAEAEA7p7p7p9T00",
    italic: ",E64,cDx,883,483,W6l,q......,Q.,0.,0.,M.,0.,0.,0.,_,F.,G7x,W",
    bold: "3Z566t7p7xBQB13g4u4u7p7p424p4C6k7x7x7x7x7x7x7x7x7x7x4K4K7p7p7p7GE39U8n8I9t7e7B9-9t4B5C8Z6dDhAJAb8LAl8p7P7mAD9GEB8d887V556k557p7p4j7k8P6Z8P7u4z7R8P3s407W3sCk8P8Q8P8P5a6F5R8P7QBg7C7Q6E5O7S5O7p3Z567p7x7p7x7p7p6VD36X8R7p007x675N7p5I5G4j8q9M4C4m3z6q8RAIApA-7G......C8.........A0......7pAf.....8L8h......C7.........8P......7p8W.....8P................9LA08v....................AI8a.........3s9N7s....7W....6l4p8o6d6n48......9lA28P......DhDB.................5i7m5Z.......................4300007x7pEAEA7X7q424242426q6q6q6q7p7p7p000000B800Gc006O5P5P7xBHEAEAEAEA7p7p7p9T00",
    boldItalic: ",E6p,m8G,48G,W6v,q......,Q.,0.,0.,M.,0.,0.,0.,_,_,3",
  },
  "caladea": {
    line: 1300,
    regular: "3S4U699h7wDwAl3j5-5-6h8g3D593E7g855g7O7D7i7R7M7M7b7U48488g8g8g6cDr9N93879n8S7z8RAu5N4m9s7rDuAr9N8L9N9b758jAl9MDv8x8j7x5U7g5U8g5p2N7M886b886v4v7B8g4L3_8D4FCj8k7W887r6C68558Y7MBG7Z7Y6i634y63B83S4U6v8G8W9X4y7q45DJ6X7h8g5CDJ4M5t8g6N6N2N8W9C1g4T6N6i7hCzDZDY6c......DY.........AM......8gAD.....8-9T......B4.........8I......8g7g.....8Z.....9l..........8uAM8h....................Ap8e.......4V.4LA78W....8G.....4c7r4S8S4r......8kAf8d......EXC3..............0000..8j5I.......................4N0000007qFeFq005p3T3T3D3T5t5t5e0085856x000000Bm00Jl3j694m4m9qAdCF4cCF4c8g8g8g0000",
    italic: ",B3E,36A,U9k,C7F2t83,06o,27j,67Z,080,15K,46n,89m,36g,15K,52O8X,5DXDqDg,W......B5.,9.....,9.,0.,0.,0.,0.,0.,0.,E.,0.,0.,0.,N00,04n,04U,700,2.,0.,0.,I.,05K,H.,0.,0.,37rFf,17N,23c,15o,EAo,8",
    bold: "3S5F6c9g8VFGBa3x6O6O759G3e4t3c7v8L7A7x7y8f888Q7k8i8M4O4O9G9G9G74EPAD9w8dAO8l8M9ABF5c5KAe8TDDAkA79HA7A07P9BAt9uE_9e9B8g5m7v5m9G5p2u8D8u728w815F7y9O4q4f9D4tDx9S8I8z8l766y5j9X87CB8D897G6950699G3S5F7L8i9B9S508L4cDJ6a8J9G5HDJ4t5w9G6r6r2t9T9C2C4T6r6q8JE1E8FA74......Dm.........B5......9GAt.....9fAb......CQ........4t8y......9G8v.....9F.....AC..........A0B59L....................BN9L.......4w.4qAw9f....9M.....6p8T5z8i5M......9SAd9N......EuDG..............0000..9B5j.......................510000007qFeBk005p3h3h3e3T6E6E6B0085856x000000C400La3x6c4o4oA0AiCF4cCF4c9G9G9G0000",
    boldItalic: ",F8T,17-8k8A,081,C8u8Q9C,8AJ,07g,A6n3L8q,07J8_,18X,68g8-,87K,57f9h,0AH,G2J,3ErEcFC,8....,J......,0.,9.....,9.,0.,0.,0.,0.,0.,0.,0AN,1.,0.,0.,0.,0.,0........,N00,B00,2.,0.,0.,7.,0.,0.,0.,49R,I.,0.,0.,37y,0FW,06m,23j6L6L6J,DAYAw,8",
  },
  "liberation-sans": {
    line: 1150,
    regular: "4M4M5Z8j8jDwAR2_5E5E66984M5E4M4M8j8j8j8j8j8j8j8j8j8j4M4M9898988jFuARARBJBJAR9ZCABJ4M7qAR8jD2BJCAARCABJAR9ZBJAREmARAR9Z4M4M4M7M8j5E8j8j7q8j8j4M8j8j3V3V7q3VD28j8j8j8j5E7q4M8j7qBJ7q7q7q5E445E984M5E8j8j8j8j448j5EBX5p8j985EBX8f6G8b5E5E5E918Q5E5E5E5k8jD2D2D29Z......Fe.........BJ......98CA.....AR9Z......Dw.....4M4M4M4M8j......8b9Z.....8j................9dBJ8j....................BJ8j.4M.4M.4M...4MBV6y....7q.....4a8j5E8j3V......9TBK8j......FeEm.................5t9Z4M.......................3V5E008j8jFeFe6U8f3V3V3V3V5E5E5E5E8j8j5V000000Fe00Fe2y5Z5E5E8jFeFe7qFe7q988b8b9T00",
    italic: ",_,_,_,D9n,l6G,79d,_,T",
    bold: "4M5E7R8j8jDwBJ3k5E5E66984M5E4M4M8j8j8j8j8j8j8j8j8j8j5E5E9898989ZFGBJBJBJBJAR9ZCABJ4M8jBJ9ZD2BJCAARCABJAR9ZBJAREmARAR9Z5E4M5E988j5E8j9Z8j9Z8j5E9Z9Z4M4M8j4MDw9Z9Z9Z9Z668j5E9Z8jCA8j8j7q664O66984M5E8j8j8j8j4O8j5EBX5p8j985EBX8f6G8b5E5E5E918j5E5E5E5k8jD2D2D29Z......Fe.........BJ......98CA.....AR9Z......Dw.........9Z......8b9Z.....9Z................BFBJ9Z....................BJ9Z.........4MCH8j....8j.....629Z7W9Z4M......B5BK9Z......FeEm.................7W9Z5E.......................4M5E008j8jFeFe7o8f4M4M4M4M7q7q7q7q8j8j5V000000Fe00Fe3m7W5E5E8jFeFe7qFe7q988b8b9T00",
    boldItalic: ",_,_,_,DBa,j6C,_,e",
  },
  "liberation-serif": {
    line: 1150,
    regular: "3w5E6P7q7qD2CA2r5E5E7q8q3w5E3w4M7q7q7q7q7q7q7q7q7q7q4M4M8q8q8q6yEPBJARARBJ9Z8jBJBJ5E66BJ9ZDwBJBJ8jBJAR8j9ZBJBJEmBJBJ9Z5E4M5E7M7q5E6y7q6y7q6y5E7q7q4M4M7q4MCA7q7q7q7q5E664M7q7qBJ7q7q6y7W397W8U3w5E7q7q7q7q397q5EBu4K7q8q5EBu7q6G8b4i4i5E91765E5E4i4t7qBkBkBk6y......Dw.........BJ......8qBJ.....8j7q......AR.........7q......8b7q.....7q................A7BJ7q....................BJ7q.........4MB58f....7q.....6N9Z5O9Z4M......9TA-7l......DwBJ.................6i9Z4M.......................4M5E007q7qFeFe4P7q5E5E5E5E6y6y6y6y7q7q5V000000Fe00Fe3R6X5E5E7qFKFe7qFe7q8q8b8b9T00",
    italic: ",16a,33M,2AZ,D5E5EAZAZAZ7q,59Z,26y,49Z,966,066,27q,F66,84J,266,34J,4AZ,88B,77q,MAZ,59Z,0......,Q.,0.,0.,hBk,0.,SEm,1.,0.,0.,C4N,Z8j8j8j8j,IAZ,3",
    bold: "3w5E8i7q7qFeD24M5E5E7q8w3w5E3w4M7q7q7q7q7q7q7q7q7q7q5E5E8w8w8w7qEZBJARBJBJAR9ZCACA667qCAAREmBJCA9ZCABJ8jARBJBJFeBJBJAR5E4M5E967q5E7q8j6y8j6y5E7q8j4M5E8j4MD28j7q8j8j6y665E8j7qBJ7q7q6y6B3T6B893w5E7q7q7q7q3T7q5EBi4i7q8w5EBi7q6G8b4i4i5E918T5E5E4i5B7qBkBkBk7q......Fe.........BJ......8wCA.....9Z8j......BJ.........7q......8b7q.....8j................BUBJ8j....................CA8j.........4MCt8f....8j.....7LAR6CAR4M......BQC28j......FeBJ.................89AR5E.......................4M5E007q7qFeFe557q5E5E5E5E7q7q7q7q7q7q5V000000Fe00Fe4Q8f5E5E7qFeFe7qFe7q8w8b8b9T00",
    boldItalic: ",066,ZAR,s8w,066,99U,_,XBj,j89,ACG,P8K,O5E,55Q,R9U,3",
  },
  "liberation-mono": {
    line: 1133,
    regular: "9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P......9P.........9P......9P9P.....9P9P......9P.........9P......9P9P.....9P.................9P9P....................9P9P.........9P9P9P....9P......9P9P9P9P......9P9P9P......9P9P..................9P9P.......................9P9P009P9P9P9P009P9P9P9P9P9P9P9P9P9P9P9P0000009P009P9P9P9P9P9P9P9P9P9P9P9P9P9P9P00",
    bold: "9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P9P......9P.........9P......9P9P.....9P9P......9P.........9P......9P9P.....9P.................9P9P....................9P9P.........9P9P9P....9P......9P9P9P9P......9P9P9P......9P9P..................9P9P.......................9P9P009P9P9P9P009P9P9P9P9P9P9P9P9P9P9P9P0000009P009P9P9P9P9P9P9P9P9P9P9P9P9P9P9P00",
  },
  "dejavu-sans": {
    line: 1201,
    regular: "4-6H7CD69zEtCC4J67677qD64-5f4-5H9z9z9z9z9z9z9z9z9z9z5H5HD6D6D68JFeAjAlAxC39u90C7Bm4d4dAG8kDVBjCK9SCKAt9x9ZBSAjFTAk9ZAk675H67D67q7q9b9x8c9x9e5X9x9w4M4M944MFF9w9a9x9x6S89699w9GCo9G9G8D9z5H9zD64-6H9z9z9z9z5H7q7qFe7O9aD65fFe7q7qD66H6H7q9z9z4-7q6H7O9aFAFAFA8J......FF.........C7......D6CK.....9T9s......FM.........9a......D69a.....9x.................C79x....................ELAt.........4M9E8i....94.....5t8k5M8p4T......CkBj9w......GkF_..................9Z69.......................5X5f5f9z7qFeFe7q7q4-4-4-4-878787877q7q9E9E5FASFe4-K-3a5s6G6G9zFeD6D6D6D6D6D6D6DfD6",
    bold: "5T7989D6AuFgDf4p7A7A8BD65y6W5y5kAuAuAuAuAuAuAuAuAuAu6G6GD6D6D695FeC6BxBUC_AiAiCrD55r5rC79-FaD5DJBTDJC3BHAhCjC6HGC3BLBM7A5k7AD67q7qAZBC9HBCAd6qBCB85N5NAQ5NGIB8AmBCBC7k9K7VB8ACESA6AC97B85kB8D65T79AuAu9zAu5k7q7qFe8qA6D66WFe7q7qD66s6s7qBW9z5y7q6s8qA6GCGCGC95......Gz.........D6......D6DJ.....BYBG......GO.........Am......D6Am.....BC.................D6BC....................FECN.........5NBfAk....AQ.....7W9-8jA35q......FND5B8......IFH7..................Ah7V.......................6q6W6WAu7qFeFe7q7q5y5y5y5yAIAIAIAI7q7qA0A05EARFe5TMW486_6T6TAuFeD6D6D6D6D6D6D6DfD6",
  },
  "dejavu-serif": {
    line: 1201,
    regular: "4-6I7CD69zEtDx4J67677qD64-5I4-5H9z9z9z9z9z9z9z9z9z9z5H5HD6D6D68PFeBJBVB-CYBQAsCVDf6C6HBiAPG0DhCqAXCqBnAkARDBBJG4B8ALAt675H67D67q7q9LA18nA19G5pA1A5504t9U50ErA59RA1A17V826IA58rDO8q8r8F9z5H9zD64-6I9z9z9z9z5H7q7qFe7S9aD65IFe7q7qD66H6H7qAA9z4-7q6H7N9aFAFAFA8P......Ff.........Ce......D6Cq.....AaAS......Ei.........9R......D69R.....A1.................CeA1....................DfA5.........50CY8M....9U......AP50AT55......DZDBA5......HoFT..................AR6I.......................5p5I5I9z7qFeFe7q7q4-4-4-4-808087807q7q9E9E5EARFe00K-3a5s6G6G9zFeD6D6D6D6D6D6D6Df00",
    bold: "5T6t89D6AuEtE74p7Q7Q8BD65T6W5T5kAuAuAuAuAuAuAuAuAuAu5o5oD6D6D69AFeC8DECSDaBxB6DNEn7K7QDcB0HJEJDeBmDeD0BJBfDfC8HaC8BABQ7Q5k7QD67q7qA8Ay9XAy9z6lAyBO5y5gAr5yGZBOARAyAy8F8p7EBO96DT9L968uA45iA4D65T6tAuAu9zAu5i8B7qFe7d9nD66WFe7q7qD66s6s7qBS9z5T7q6s7q9nGJGJGJ9A......GB.........Dh......D6De.....BrBu......FG.........AR......D6AR.....Ay.................DhAy....................EnBO.........5yEkBl....Ar......B05yB661......FnDfBO......ITG4..................Bf7E.......................6l6W6WAu7qFeFe7q7q5T5T5T5T909090908B8BA0A05TAYFe00Lf486_6G6GAuFeD6D6D6D6D6D6D6Df00",
  },
  "gelasio": {
    line: 0,
    regular: "3o5C6SA49YCoB73O5t5t7PA44E5t4E7L9c6k8l8e8r8H8s7t9L8s4v4vA4A4A47VEXAVAEA3BkAE9OBMCl6686At9SEWC0Bf9YBfA-8o9hBrARFGB79e9Q5t7L5tA4A47q7u8n778_7a567-974b4a8O4VDn9F8S8y8m6Q6n5Q907nBY7v7j6y6l5t6lA43o5C8i9l8y9d5t7q7qEk7q96A400EkA46aA47q7q7q947q4O3s7q7q96GQGQGQ7V......FB.........Bk......A4Bf.....9d8b......BX.........8K......A48S.....8m................AQBk8_....................Cl97.........4bEC99....8X.....5cAQ6b9S4V......00BY93......FdCn..................9h5Q.......................4i000000A4DP0000003Z3Z3Z006R6R6R007P0069000000Ce000052866W6WA3El009n009nA400000000",
    italic: ",P6060,a8z,190,0598z,04g,593,07E,05S,08RCt,08m,WHuHuHu,W......Bz,4....8Z,B.,0.,0.,0.,0.,A90,A.,0.,0.,0.,4.,0.,0.,0.,04g,58i,466,AC0,7Cw,0.,0.,0.,8.,0.,05S,C.,0.,l",
    bold: "3-5v7-B0A1DmCW4E6_6_7YB0595x597OA-7g9p9nAA9OA88hAbA85m5mB0B0B08bF7BtBsBCD2BIAWCeEI6-9KCnAkG0D8CqA-CqCUA9AjD2BxHdCfBSAo6_7O6_B0B07q9KA68KAO8y6A91Ae5Y5R9u5PFuAo9yAIA989816EAb8tDW9C8p8E7q647qB03-5v9UAoB0BT648q7qEk8e9ZB000EkB06aB08e8e7qAU8b5I4I8e8e9ZGmGmGm8b......Gk.........D2......B0Cq.....B5AI......DQ.........9-......B09y.....A6................BAD2AO....................EIAe.........5YGIAy....A3.....6BBY8PAk5P......00D5Af......HDEg..................Aj6E.......................5Y000000B0EW0000004D4D4D00888888007Y006s000000Ek0000528L6C6CBCEq009n009nB000000000",
    boldItalic: ",M8t,9Bu,573,2GA,1B3,1AD,CALA98O,2AA,05k5kA25Z,2ANAA8M866XAk9bEc,0AU,6As,I9l,04J,2IlIlIl,6Gp,4....,F......,0.,3....,8.....A8.,0.,0.,0.,0.,0.,0.,0.,E.,0.,0.,0.,3.........5kGMBR,0.,0.AG,0.,0.,080,08Z,05Z,EHI,1.,0.,0.........,0.,0.,06X,0.,0.,0.,0.,0.,0.,0.,0.,65g,d",
  },
  "eb-garamond": {
    line: 0,
    regular: "383w5A7K6vAABq384x4x5K9E3c4I3c6F7W7W7W7W7W7W7W7W7W7W3u3a8m8s8m5uBjAq9BB6Bo8q80BPCg5K5KAf98E5COBx8eBxB97HAUBYAWEKB3929R5B6F5B7q7q386F836N7w664-6p833r3Y7L3mCA8G7l878A5E534w8F6sAj6k6s5v5u445u7q383w6c7g7w8w446G4iAP4s9J9O4IAP4i4Y9E4i4S388P9J3838434r9JAHBD9w5u......De.........Bo......9OC5.....8l7u......8j.........7d......9E7b.....7v................87Bo7w......8N5_............Cg87.........3rAe7F....7Q.....3-985E984O..C2...9XC281......EpBs..................AU5V.......................450000008cEs0000003o3o3o006Y6Y6Y006u005S000000Ak00002o4x6060B3Gg006u006s9O00000000",
    italic: ",04V,17Z,0Cs,K9E9E9E,0Bv,390,25g,0Ax,0FV,18s,17J,1AhGh,19x5f6Q5e7r,17h,184,051,14c43,04UCL,35x,46s,06N,44V,07p,69i,50000,239,000,0Ay,1A2,8........,E8A......,5....,G.,0.,073,A8A.,0.,0.,0.,0.,C.......4I.4c,08L,0..,07S,03y,0.,04a,24r,1C3,3Cz,9.,0.,0..,0.,2.,I.,3......5R,Q6P6P,0Gr,8",
    bold: "3j4Y6E7a7DA-CV3j4m4m5b9P3t4y3t6M8H8H8H8H8H8H8H8H8H8H4Q3t8T9r8T6BCDBG9oB5B-8_8YBFCX5i5oBx9AELCfBu9VBuBu7kAtBfB2FyBkAE9K5a6M5a829E3j6s8U6R8f6X5e7q8l4d4A8Y4TCd8s7t8d8O6U5e5t8d7ZBm7v7X6r5r4K5r8X3j4Y6o8u7zAD4L6x5ZAf5U979j4yAk5Z5R9O5L4d3j8l9q3_4I3v5797A5BFAK6B......ED.........B-......8RBw.....9E94......9l.........82......9O7r.....8a................92B-8f......8r6W............CX8o.........4dBT8a....91.....4q9A6L9A4Y..CN...AQCN8e......FQBw..........7c.......At66.......................4i0000009uF00000003l3l3l006t6t6t007c005r000000Bg00002-575q5qBYIP006_006-9a00000000",
    boldItalic: ",04k,18bBRDK,25e,04C514C,98J,04C9M9v9M,0CPBh9p,3BM,05w5w,1FS,19m,18E,1BMHN,1A15s,05t83,18T,18p,05_,08p5C4t,04vC_9M,18V79,19K,27Y7N65,065,14l,09k,378,19k,051B5,20000,08x,2005z9yAiBGAx,0......,5....,68-,59d,0......,5....,0.,6.....,0.....CD87,89o,08g,59K,2.,0.,0.,0.,38p......5n52.5CBq9l..,34o,0.9F5j,25M,0.,0.,0.Ah,A.,0.,0..,0.,07j,0.,36P,2.,0.,0.,0.,0.,096.,1.,0......6T,74C4C4C,07M7M7M,6By,36R6R,0IW,8",
  },
  "tex-gyre-adventor": {
    line: 0,
    regular: "4L4d4r8g8gC7Br365m5m6kBG4L5C4L818g8g8g8g8g8g8g8g8g8g4L4LBQBGBQ9FDZBa8-CjBe8O7bDeAh3Y7Y9F7EENBaDb9GDd9V7o6gAFA-F09X9G7W5S815S9U7q5tAhAgA7AjAA4wAX9Y383B7s38Eg9YAFAgAg4j645J9W8gC_7W8O6f5m3g5m9U4L4d8g8g8g8g9U9d5nBh5n6fBr5CBh7b6GBG5C5C5t9W8q3g545C5n6fC_C_C_9F......FW.........CM......9WDa.....9G8g......I5.........AF......BGAD.....Ag.................CMAj....................Ah9Y.........38AT6J....00......7E4I854i......00Ba9Y......IgHn..................0000.......................4w5C5C997qFeI86W995V5V5Y007s7a7s008f8f88000000Cm00IM466Q3x3x8gFeEu81Eu81BGBPBPBqCz",
    italic: ",_,_,_,n6L,_,fF_,8",
    bold: "4O4O5e8m8mDSAe3S6e6e7iBG4O6a4O8w8m8m8m8m8m8m8m8m8m8m4O4OBVBGBV8mBaBa94CCAy887WD8Ae4O7W9i6uE4BaD88mD894886aA0AyE4Ae9i7q6K8w6K9O7q6aAKAKA0AKA04OAK9O3m44943mEi9OA0AKAK506u4i9O8mCW8m947C6e4W6e9O4O4O8m8m8m8m9O8m7qBa5e7CCG6aBa6a6GBG5G5G6a909O4b5K5G5e7CD8D8D88m......E4.........Bc......A6D8.....8m9O......Gu.........A0......BGAK.....AK.................BcAK....................Ae9O.........3mB97p....00......6u5r7W50......00Ba9O......GaGu..................0000.......................4O6a6a9i7qFeI87e9i4O4O4O007W7W7W008m8m94000000CB00K04d7y3m3m8mFeG8ASG8ASBGBSBSBqEC",
    boldItalic: ",_,_,_,-5s,_,SFz,8",
  },
  "montserrat": {
    line: 1562,
    regular: "46445rAu9dCzAT3A5959628_3K5-3K5FAM5f8u8qAL8s9X9D9-9X3K3K8_8_8_8tG9BDBoB5CwAT9vC5Cj4k7rB79DExCjD7BED7BJ9d8-COAwHNAG9xAB4-5F4-907q9O9EAc8pAc9S5JAjAa4D4I9M4DGbAa9pAcAc6H7e6MAW8UDl8M8U7_5E4c5E8_46448p9zAyAt4c7g9OCf6H7T8_00Cf9O6Z8_6k6k9OAc9u3y9O6k6U7TG5G5G58t......G9.........C_......8_D7.....BEAS......FQ.........9E......8_9p.....Ac.......B9.B9.B9.B9...C_Ac....................CtAk.........4DBE8W....9M......9D5f9I4N......BHCjAa......HXGi..................8-6N.......................4j0000007qFe0000003K3K3K005-5-5-008Z004d000000A700003A5r4h4hCOFz009O009O8_00000000",
    italic: ",YBF,KAE,04_,4Ac,H6N,55F,05F,C90,C6V7U,A.,K.,1......FR,P.,0.,0..,0.,0.,0.,OCu,Q4j,FGj,E.,0.,06Y,D.,0.,Y4iCZ,9",
    bold: "4R4X6rBG9-DjBO3c5b5c6o9N46624668Ad689E9GAn9J9z9iAK9z46469N9N9N9DGBB-BzBKCwAV9_C3Ce588TBa9SExCeDCBSDCBV9-9gCKBgIBBAAaAV5m685m9O7q9O9fAo9FAq9t63AyAp4j4pAF4jGPApAFAoAo6l8J6pAl9MEf9J9M8V674r679N4R4X9FASAyBW4r8A9OCH6S8u9N00CH9O6Y9N6k6k9OAoAk4k9O6k6h8uGKGKGK9D......Gu.........D7......9NDC.....BSAr......Fa.........9c......9NAF.....Ao.................D7Aq....................D3A-.........4jBK9W....AF......9S779g57......COCeAp......HmGe..................9g6u.......................5N0000007qFe000000464646007o7o7o009F005c000000CU00003c6r5M5MChGM009O009O9N00000000",
    boldItalic: ",4Dk,49O,MBT,KAu,05n,4Ao,09H,F6r,1Ej,268,068,29H,66T,09O,C6i8v,9Gw.,K.,1......,0.,O.,0.,0.........,NDG,Q5T,5CT,O.,0.,070,C..,0.,Y5NCr,49O,3",
  },
  "open-sans": {
    line: 1442,
    regular: "44496FA68yCxBP3S4d4d8d8y4352475l8y8y8y8y8y8y8y8y8y8y47478y8y8y6mE19vA69sBM8i85BOBY4O4D9b8AE4BnCA9QCA9g8b8dBQ9LES928m8z585l588y6s4M8i9a7W9a8o5H8V9c3z3z8E3zEU9c9Q9a9a6P7T5b9c7qC78C7r7L5t8c5t8y44498y8y8y8y8c8294D15Y7m8y52D17q6j8y5S5S4M9hAF473U5S5s7mBbC1CB6m......Db.........BM......8yCA.....9Q9l......DV.........9O......8y9Q.....9a.................BM9c....................BY9c.........3z8a7v....8E......8A468A3z......AbBn9c......ETEr..................8d5b.......................530000007qFe0000002g2g3r005T5T6P007z005u000000CA00003c6J4j4j8yBy000000008y00000000",
    italic: ",_,08s,k5T5T,45T,2CRCE,W......,Q.,0.,0.,t4O,04W,_,C6W,O",
    bold: "444V7PA68yE5Bk4B5J5J8X8y4U524U6U8y8y8y8y8y8y8y8y8y8y4U4U8y8y8y7UE1AoAW9-Bb8n8bBLB-5C5CAP8rElCjCS9qCSAL8d94BqAAF7AR9n945C6U5C8y6S5g9T9v839v9F648rAI4o4o9j4oFMAI9i9v9v777o6pAI8vDO938v7e6B8d6B8y444V8y8y8y8y8d7c9VD15_9e8y52D17q6j8y5x5x5gALAF4U3E5x659eC_DhDE7U......Ev.........Bb......8yCS.....9qB7......EL.........9i......8y9i.....9v.................BbA9....................B-AI.........4oAN9Y....9j......8r5g8r4o......C3CjAI......FEFJ..................946p.......................5_0000007qFe0000003P3P4U006z6z820085005u000000DN00004m8C5n5n8yC5000000008y00000000",
    boldItalic: ",E6b,h6b,zD2DyDV,_,FAZ,j5t,06p,058,_,a",
  },
  "lato": {
    line: 1200,
    regular: "315N6D9494CIA_3c4i4i6G943K5R3K5r949494949494949494943y3y9494946ECsAeA7AjBn958sBUBq4p6yAf82EOBqCU9ZCUA48I9EBQAeFxA39r9m4i5t4i946A4p7x8l7J8l8C5H7_8i403-8C40Cr8i8i8e8l6J6o5r8i80B-7u807E4i4i4i94315N949494944i7t4pCU5M7F945RCU4p6D945C5C4p8iAT4H4p5C5z7FB8B8B96E......EX.........CL......94CU.....9Z9X......Cm.........8f......948i.....8e.00000000....000000000000000000000000000000009I.0000000000000000000000000000000000000000000000400000000000000000000000000000008V51..00000000000000000000000000H8DZ0000000000008a.00000000..00000000000000000000000000000000000000000000.......000000008iCr0000003K3K3K005i5i5i00940094000000BN000000004y4y94BG000000009400000000",
    italic: ",B3L,03L,_,OCV,3CV,6AU4I,3BYBYBY,_,_,_,A3M,S",
    bold: "315f6c9494CZBA3k4i4i6G943X5d3X639494949494949494949449499494946bCtB6ACAVBi8z8oBJBq4w6rAw85EYBqCW9nCWAF8P9JBOB6GNAdAF9f4i674i946A4_8C8w7T8w8N5V868v4F4D8e4FDA8v8v8s8w6P6r638v8MCN8S8M7M4i4i4i94315f949494944i7v4_CO5S7c945dCO4_6I945D5D4_8vAz4O4_5D647cB8B8B96b......Ec.........CN......94CW.....9n9x......Cw.........8u......948v.....8s.00000000....0000000000000000000000000000000093.00000000000000000000000000000000000000000000004F0000000000000000000000000000008d5J..00000000000000000000000000GwDh0000000000008g.00000000..00000000000000000000000000000000000000000000.......000000008vDA0000003X3X3X0067676700940094000000Bt00000000515194BM000000009400000000",
    boldItalic: ",_,wBYBYBY,_,_,_,A3c,S",
  },
  "poppins": {
    line: 1762,
    regular: "4B4g4aD89kBtBZ2V76767cAh368d3I7S9q508_9D9r9q9x8Y9t9s3L488hBJ8R8CFrAY9bC4B3817uCAAq3s8I9N6mDTA_CI93CK9W9B8TAZAaFG9j988T6dAI6d9rBT41AaAa9VAa9i59AaA03s3u833sG6A0A0AaAa5r8A5iA08nCq7V8p777E4Z7E874B4gAP9i8P9J4Z8_4wCO727DAA8d7z636QAk5A5C3tA59K3K4G346q7DA0AZB587......E4.........BL......A3CI.....93Af......H9.........9-......AHA0.....Aa.........0000.....BoBLAZ..........0000......00000000.........3s00000000..00....6-5n6m4d6r3x......000000......G-Gu........0000.......5l0000.......................00000000AbDr0000003R3R2w005y5y5U008Y006S00000095000000004O4OChCD000000008d00000000",
    italic: "4g,4Bk,077,_,L4g5F,9BY,_,_,I4g,GH0,s2x,05z5z5e,O",
    bold: "3K686RE8AIDcCU3T7T7T8M9q4V944Q75AC5u8x9TAbAA9z8NA89d4S5R8dAu8T8QGuBXAJBwBN8T8ZBwBR4d92Av7TEMBmCI9mCKAC9d9FB1BQGSBBAV9K7-CY7-B5CC4ZAdAd9TAd9e5eAdAY4d4c9g4dGZAY9zAdAd6i8k6MAY9oDY9C9u7m7p4Z7p9y3K689tAN91AV5z9B5lCB7L8jBD94826a7F9r5_5s45B1B44h4v3v7A8jCICrDx8Q......Ex.........BS......9zCI.....9mBu......Gj.....51515151A0......9Z9r.....Ad.........0000.....D2BSAq..........0000....By.00000000.51.51.51...5100000000BG.00..7V.8B7Q7T5z7b51..CA...000000......GdGH..AS.....0000.......6O0000.......................00000000AtEY0000004w4w4a008T8T8800AE007r000000Bu000000005H5HCSDp000000008V00000000",
    boldItalic: "3d,4Ce,44Y,b9k,g3d6R,9C4,_,_,aGj,6.,2.,0.,e4c,08a8a8C,O",
  },
  "roboto": {
    line: 1201,
    regular: "3v42519e8pBT9l2l5N5T6l8u354L486T8p8p8p8p8p8p8p8p8p8p3p3K7z8b8B7PE2AD9mABAH8v8fAgBA4G8e9q8RDgBAAm9tAm9f9I9LA99zDu9p9P9O4A6R4A6Y744s8W8o8C8q8J5S8o8d3q3m7x3qDj8f8x8o8v5J85588e7bBm7n7Q7n5J3r5JAf3v3r8a96BA8E3n9c6ZCI707M8g4LCJ7B5s8N5l5l4w8t7g463v5l787LBTC8CA7Q......Ed.........AV......8MAm.....9F9J......DD.....3u3u3u3u9B......8y8t.....91................9-AV9M....................Az8s.3u.3u.3u...3uCu7Z.3y..8j.....4z8R5V8R4F......8fAr8t......EwED.................5R9L58.......................3v000000AHCD000000393938005Y5c5P008e005I000000AT00002l514j4j8p9o000000008y00000000",
    bold: "3v4F4_9H8-BaAI2Y5U5W778X3t6B4Z5q8-8-8-8-8-8-8-8-8-8-4Q487-8-857oE1AW9_AFAA8p8bAgB34b8l9y8UDiB2AoA5AoA19e9iAKAEDh9x9i9V4L6c4L6s6z5B8O8p898p8T5c8y8n49458N49DZ8n8r8p8q5l825J8n7xBV7z7u7z5A3y5AA83v4R919JAr8P3x9r7NCI6y7q8d6BCI7r668Q5r5r5B9g7f4k4D5r7A7qBDBtCg7p......Eh.........AP......8JAn.....9Y9u......DD.....4H4H4H4H8_......8x8q.....8s................9zAP9s....................BG8_.4H.4H.4H...4HDK8D.4Q..9F.....5I8U5r8k4p......8nB18q......F8E8.................5c9i5J.......................430000009tBw0000003g3c3v006K6N6H008R005e000000Bb00002Y4_4v4l8-9u000000008h00000000",
  },
  "raleway": {
    line: 1388,
    regular: "3_3y4aAe9hBAAR354D4C516V3X6c2z9S9a6i898M8Y8X9R8N9H9A2y3D7y6s7y7SD5AaAQAkBB9X9DBCBY3u7XA397DjC4Bl9kBjAD9V9YBpAdGM9uAB9r428u428R7_3U8X9f8b9k9B5A9g973Q3X8I4GEN979J9f9f5V7Z5F9I8LCj7u8U7i433d437_3_3x8n7p8PAa3g7w59D06o8z968wD06C4A7J64663U9i9Q2z4R4G718zCSCdEI7L......F1.........BH......79Bl.....9R8d......Ea.........9Q......8P9J.....9R.................BH9k....................Bi97.........3QBP6x.3Q..8I......974w9E4a......97B-97......I1GA..................A15H.......................000000008wE5000000342-3X004y4t5N006M005V000000790000356A5W5WCXBN000000008R00000000",
    italic: ",5AV,K8X7N8X,U8T,03a9M,88O,F4W,58o,04Q,1DD,3DD,17a,13Z,24c,T7K,7......,Q.,0.,0.,m.,_,W366O,78c,3",
    bold: "3m4p69BH9wCIB83h4s4r5P6b3e6Y3XAw9c7k8q8k8x8g9V8n9S9D3t43836q837cDDAWAeAkBC9P8-BLBf4U7hAT98DXBxBq9lBpAP9b9hBkAaGTA6AK9p4y9z4y997R3_8-9w8qA59N5o9w9S3_458k4zEZ9S9U9w9w637k609g8cD78J8c7j4z4G4z8t3m4n9G8X8eB84J8K79D96yA99a9RD96Z4T7O6W6N3_AOAH3X564g6xA9DpEHFV7V......F6.........BH......7TBp.....9S8k......Ef.........9b......7_9U.....9P.................BHA5....................Bn9S.........3_C984.3_..8k......986D9I5O......9SBk9S......GzFp..................A461.......................000000009REW0000003s3l3w006o6f6m007D005h0000009Q00003h7N5c5cCUCz000000008F00000000",
    boldItalic: ",A6h,F8c7b8c,U9D,04J9m,88m,F57,590,050,1DN,3DN,17_,14I,X7d,7......,G88,8.,0.,0.,m.,_,H3x,D3m,88c,3",
  },
  "inter": {
    line: 1431,
    regular: "4Q4W7I9wA2FMA54i5j5j7rAM4X7C4X5f9t6N9Y9gA69I9j8s9h9j4X4kAMAMAM80F6AoAFBRBI9Q9FBhBe4D8xAW8sE8BoBz9_BzA4A2A6BfAoFQAhAd9r5j5f5j7O79538o9b8y9b985p9c9G3p3p8b3pDi9F9O9b9b5v8G589G8pCp8Y8p8f6h5D6hAM4Q4W8y9ZBL8c4F8v9FEJ7697AM00AR7U78AM6w6-539A9R4X4D4n7Z97CZDGDo80......FY.........BV......AMBz.....9y9f......EM.........97......AM9O.....9b................B6BV9b....................C99G.........3pD87b....8E.....5K8p5e9J3p......00Bo9F......FjFe.................5uA658.......................4x0000007qFe00000045453o006v6v6b007i008p000000DX00003V6x6161AR9Z00D200D2AM00000000",
    italic: ",5Ao,3AN,07D,26O,1A7,18t,3ANANAN,KA7,49s,15k,29c,35s,38c,19G9P,359,56i,1AN,48e,19G,2AN,17V,0AN6x,19B,498,9FZ,FAN,7......,A......AN9P,7.,0.,0.,VCA,F.,B.,0.,0.,19G,0.,0.,0.,F...,0A759,G.,0.,0.,47rFf,24j4j4j,07W7W7W,93W,39a,3AN,3",
    bold: "3j5I8eA9AFFuAW5J5v5v8mAd5E7K5E65AZ6m9sA6Ab9lAA96ABAA5E5NAdAdAd8mFvBhAMBaBJ9W9BBlBi4P99BG8sEaBxC3A8C9AHAFASBSBhGEBZBRAP5v655v7d7T5k959t9D9t9K6E9u9l4F4F954FEH9l9c9t9t6O8n5l9l9ODJ959R8z7L5q7LAd3j5I9D9_Bw8x5J8v9lEJ7GALAd00AN6t7CAd7C7O5k9q9N5E5j5E7gALDEDoEO8m......F_.........Bu......AdC3.....ATAI......EF.........9O......Ad9c.....9t................BpBu9t....................Ce9l.........4FDX8V....9B.....6C92729U4F......00Bx9l......FwFS.................6wAS5l.......................5P0000007qFe0000004t4t4X008T8K7-0098007R000000Fg00004J8a6m6mAjA100EA00EAAd00000000",
    boldItalic: ",5Aq,3Ae,07L,897,15F,0AeAeAe,59b,JAQ,15w,29t,36Q,14G,95m9m,47M,07MAe,48y,5Ae,16u,0Ae,29r9P,EG4,0....,AAe,7......ER,4....,6Ae,0....,3.,0.,0.,B.,0.,0.,0.,0.,ACf,1.,0.,0.,0.,04GDY,l.,25m,0.,0.,0.,0.,0.,0.,4.,0.,0.,05Q,27rFf,25W5W5W,0958z8z,DAk,4Ae,3",
  },
  "nunito": {
    line: 1377,
    regular: "423a689O9OEYAr3T4z4z729O3a6e3a4R9O9O9O9O9O9O9O9O9O9O3a3a9O9O9O6xEoBPAaAXBc978aBMBv41549n8VDNBaB_9vB_AT9d9QBOAnHDAA9K9D4x4R4x9O7q5a8I977F978K5D9A8u3e3i7q4eDO8u8i97975c7X5U8n83D98D827F5W495W9O423a9O9O9O9O498X7JCl576v9O6eCl7r5p9O5y5y5a9O9C3a6I5y5J6vDzEfDz6x......FL.........Bc......9OB_.....9w9d......DT.........8m......9O8i.....97.................Bc97....................CU8u.........3e9400....7q......8V578V4e......8uBa8u......GMEE..................9Q5U.......................000000007qFe0000003a3a3a006A6A6A0054008C000000Ak00003T6844449OET000000009O00000000",
    italic: ",iDO,H68,i7-,_,_,_,t",
    bold: "4F3u709O9OEnBM3p5c5c759O3u6o3u4v9O9O9O9O9O9O9O9O9O9O3u3u9O9O9O7BEsBeAmAeBw9L8oBWC54Q5YAP8oDaBiCHACCHAk9t9jBYB9HPAW9g9T5Y4v5Y9O7q5v8Z9O7O9O8U5i9S993_438O4_Dj99909O9O687e60938FDL8Y8E7Q674W679O4F3u9O9O9O9O4W8w80Cl5J7k9O6oCl8D5x9O5y5y5v9O9m3u6b5y5X7kEGF0EG7B......FX.........Bw......9OCH.....AFAD......DX.........95......9O90.....9O.................Bw9O....................Cn99.........3_9y00....8O......8o628o4_......99Bi99......GWEJ..................9j60.......................000000007qFe0000003u3u3u006x6x6x005P008C000000Bf00003p704V4V9OEw000000009O00000000",
    boldItalic: ",iDb,H6H,b81,58J,_,_,_,t",
  },
  "source-sans-3": {
    line: 1424,
    regular: "384X6g7n7nCu9X3v4l4l6Y7n3v4t3v5U7n7n7n7n7n7n7n7n7n7n3v3v7n7n7n6fDF8V9C8x9d8F7k9fAC477V937cBNA7AO8sAO8v8M8OA583CI817S8R4l5U4l7n7q8U7u8f788h7m4a7u8W3s3t7l3_Cz8Z8U8h8h5R6Z5I8W7JBF6-7J6f4l3n4l7n384X7n7n7n7n3n7n8UBe5P6j7n4t6d8U5B7n5l5l8U8o8m3v8U5l5j6jCDCeCS6f8W8W8W8W8W8WCs.........9_......7nAO.....9790......CA.........8W......7n8U.....8h.8W.8W.8W..........8z9x8o....................Aq8j.........3t8E7j7W...7l.....497c5g7q4g......C19x8Z......DFD7..................8O5I.............BE.........4F0000007WCW0000003v3v3v006g6g6g0076004m000000Eq00003v6g4F4F7n9z009h009h7n00000000",
    italic: ",_,08O,48I,W5Y,q8P8P8P8P8P8P,Q8P,08P,08P,M8J,08J,08J,08J,_,Q4Q,LE_,G",
    bold: "385K8P8G8GDPAR4i5O5O798G4i5C4i5J8G8G8G8G8G8G8G8G8G8G4i4i8G8G8G7FE68z9T969x8a8C9-AY4j7z9c86BwAPAi9KAi9b8i8iAP8iCj8t8D8T5O5J5O8G7q8h8F8z7K8z865L8M8x4K4M8a4UDP8y8h8z8z6E6x5_8u8BC882897C5O4C5O8G385K8G8G8G8G4C8G8hBk5d7W8G5C7E8h5j8G5u5u8h9I9y4i8h5u5r7WCfDECo7F......DD.........AH......8GAi.....9f9u......CD7J........8k......8G8h.....8z........7J.7J.7J.7J.9cAF8z....................BA8_.........4L9Q8g....8a.....4-86758V5d......DIAQ8y......DdCs..................8i5_.......................4v0000007WCW0000004i4i4i008P8P8P007-005P000000FI00004i8P4a4a8GAg009f009f8G00000000",
    boldItalic: ",_,08e,48Y,W5j,q......,Q.,0.,0.,M.,0.,0.,0.,_,Q57,d",
  },
  "noto-sans": {
    line: 1519,
    regular: "444D6OA68yC_BS3X4i4i8d8y4C524C5q8y8y8y8y8y8y8y8y8y8y4C4C8y8y8y6oE39_AA9uBQ8i87BOBb5J4H9h8CEBBuCD9TCD9k8b8iBR9OEY9A8s8y595q598y6y4P8n9d7W9d8q5O9d9g42428M42Ed9g9T9d9d6T7V5f9g7yCI8H7-7M5y8d5y8y444D8y8y8y8y8d8194D05b7z8y52D07q6i8y5U5U4P9lAF4C3X5U5u7zBfC3CD6o......Dn.........BQ......8yCD.....9T9t......DW.........9T......8y9T.....9d.................BQ9f....................Bb9g.........429a84....8M......8C4C8C42......AmBu9g......EWEo..................8i5f.......................560000007qFe0000002l2l3w005d5d6W0080005u000000CN00003e6O4s4s8yC5000000008y00000000",
    italic: ",_,08u,k5X5X,45X,2CbCP,W......,Q.,0.,0.,t4W,04f,_,C6g,O",
    bold: "444Q7VA68yE6Bk4A5J5J8U8y4T504P6V8y8y8y8y8y8y8y8y8y8y4P4T8y8y8y7TE2AqAPA2BS8m8bBKBz655BAO8lElCjCN9jCNAG8d91BqAAF7AU9o935B6V5B8y6R5j9N9u849u9L639uAA4h4g9i4gFFAA9n9u9u6_7s6oAA8xDO928x7j6A8d6A8y444U8y8y8u8y8d7c9HD05z9c8y50D07q6e8y5x5y5jADA84P475y629cC-DgDD7T......Eu.........BSCb.....8yCN.....9qB0......EL.........9p......8y9h.....9u.................BSA5.......9F............B-AH.........4hBI9Y..AK.9i......8l5n8r4nCb.Cb.Cb.C7CjAA......FDFI..................916o.............DU.........5_0000007qFe0000003P3P4U006z6z810081005u000000DN00004l8C5j5j8yC5000000009500000000",
    boldItalic: ",04V,65L8Y,04V534V6e,94V4V,D5E,G6e,C4h,04h,U53,7AF4V,3D2DxDV,_,FAd,Z..,3.,0.,05x,06v,057,_,C82,M",
  },
  "playfair-display": {
    line: 1410,
    regular: "3v464g9z8BBcD52z4c4c7i9B457p3y5q9O5o7V737k6V856M887z4A4T9WA79W7BDk9s9lAmBJ9X8vA_Br5J56AF9CDdB2Bb99BbA88S9jAg9sE99w9F9I4e5q4e8O9F4R7o8p7c957w5C8G9C4b4B8c4UDu9L8a958p6z6_5Y957fC2877u7S4m3U4mA93v3v7Q9Q8NA73W7y6iD-7F7sAG7pAc6S5D9L5I544R00A5484e47767rArAyBe75......DM.........BJ......7-Bb.....9498......Bf.........8g......A98a.....8l.................BJ95.................7v..Br9C.........4bA78o....8p......9C6g9C4U......9LB193......EWD3..................9j5u.......................5C0000008xDU0000003u3r45006Y6V6l005w006v000000Cj00004s7-575798GK007k007kA700000000",
    italic: "3z47,09_8dB-,15f5f7l,17u,07K,17t7b837B8F7d8W814M4V,0AN,39u,0BL9Y,0B1,05L9yAZ,1C2,09DCDAO8gAJ,09u,0AxAUAC4i7i4i,0Be508B,64k4K,A8L,08E,14o4-4o,03z,19m8vA_52,1ES,085AL7uAx,05F9x5L56,684,9E1,0........BL.,481,4.9T,0......,5....,6AH,8.,0.,0.,7.,0BL,0.,0.,0.,0.,0.,0.,0.,0.,0.,4.........4kCU9n...,79L,14q.,0.,0.,9Ey,0.,0.,0.,0.,0.,0.,0.,0.,0.,0AJ,E.,0..,0.,0.,4BOFg,A65,06z,75W5V9PHS,3AL,3",
    bold: "3f4W5n9i8-BOE23H4-4-7X8-4F7X4E5mA55_8B7e8G7B8n778n8f4Y4e9Q9x9Q7yDqARAWB1C89w9GBVCW5u5iBA9ZEVBICPA1CPAq98ASAnASF8Ap9l9Q525m528H9F4e869A7m9M7u5W8f9W4x4f994tE99c8r9O997J7E5W9U7yCJ8O877Q5D3z5DAS3f4L7pAK9dAc40957UDn7Y8vA27XAP6q4t935V5A4e00BS4M574R7K8vB5BGBm7t......Dv.........C8......7jCP.....9jAH......Bb.........8t......9v8r.....98.................C89M.................8W..CW9W.........4xBY9F....9F......9Z7r9Z4t......9cBF9P......FZCk..................AS5g.......................5W0000009QD_000000423z4F007G7B7T005s007b000000C-00005K965g5g9_Gs007k007k9x00000000",
    boldItalic: "3_4w679n9YCS,03a6C6D7a8_4V7w4N7D,18N858N7O8t7t8_8g4t4-,0AA,3Ad,3BZCg66AhBa,1Cv,0A3C_B79BAfAs,0FMBbBUAI5g7h5h,0Be548k,6524j,67M,05X,08D,08r,15f5n5f,03_4e,0AWAIC85q,07WEF8K9AA67wAj,05D9g5a5J,24X5J,07h99,9E9,4....,0.,47m,0.....AL,0......,5....,69y,8.,0.,0.,L.,0.,0.,0.,0.,0Cg,0.........52DE9_...,09G,59j,150.,0.,0.,1BH,8.......,0.,0.,0.,0....Af,0.,0.,0.,0.,0.,0.,0.,0.,0..,0.,0.,4AoFG,24I4D4V,07L7F7W,05z,4D8,3605_AEI7,3A7,3",
  },
  "merriweather": {
    line: 1732,
    regular: "3j4X7mB8ALGCBu4k6k6kA4AT3_953_67A6759J8z9e999T8w9K9U4141ATATAT7XFyB1AUAFBm9x9eBKCb5r5rBF9kFVC6BIA1BIAw9IAtBaAOFbBDA4A76p6l6mAQ7q6X8O9M7w9R8A5x9UAN54549w4sFXAN989b9F727h669s8vDC9I968W806c809Y3j4X8vBeBXC16cAW89GG78AkAT00GG7S7G9t6Z656X9nBS1o5s4-7UAkDuEYEk7X......F3.........Bm......ATBI.....A09c......D8.........94......AT98.....9M.................Bm9R....................ClAN.........54BW9g....A9......Ae6T9k5U......00BlAD......FjEd..................At66.......................5c000000CPHr0000004S4S4S007o7o7o008O006g000000CP00005T8E6K6KBDHP00A000A0AT00000000",
    italic: ",17_,34-,66J,h7L,38z,WC2,3GP,3GP,72P,d......DD,P.,0.,0.,8A6,j5L,IGx,_,76Z6Z,A",
    bold: "3j4f8BBEARGcBy4-6w6wAKAT4K904K6MAM7G9C8z9y999d9O9k9g4Q4QATATAT7fGWB2AxANBxAD9oBPCw6G6GBh9yFwCMBRALBRBI9RBDBdAjFuBLA9AC716l6vAQ7q6r8l9e7_9g8T6H9nAS5M5MA855FkAd9L9z9W7H856IA29ADT9g9H8e8I6c8IAN3j4f8xB_BpCS6cAf8fGG7VAuAT00GG7o7g9z6V6A6s9tCH2d67547lAuEDEgF27f......FC.........Bx......ATBR.....AN9p......DL.........9F......AT9L.....9e.................Bx9g....................D4AS.........5MCMAI....AQ......BJ7U9y5v......00BoAR......FvEe..................BD6I.......................5y000000CII80000004g4g4g008J8J8J008l0071000000Dk00005s916W6WBdHo00A500A5AT00000000",
    boldItalic: ",18P,2CX5C,66R,h7M,394,WCI,3GP,0B0,1GP,72n,2B0,Z......,Q.,0.,0.,8Ad,j5x,IHc,_,76w6w,A",
  },
  "lora": {
    line: 1500,
    regular: "474A5QC-8HDcAt3G4n4n888I3z7f3sAo9j5i8P8j8U8X927D8o923w478I8I8I7QCS9o9kAxBf9k8aBvCC5F5rAh92EMBwCQ9UCS9q8tA0BmADFZA99w9Y5dAo5dCtBP3y84968K9M8U5I8f9N4P458P4GD-9V999L906n7F639L7vCX8I8G7_5E3d5E8I473p8J8a8NB13p8L63Dj6P8I8I00Dk5Z6L8I615o3y9c7r3w4a4R6Z8IBrCHCS7J......Er.........Bf......8ICQ.....9KAf......C9.........8l......8I99.....91.................Bf9M....................CC9N.........4PB48U....00......926M924k......9VBw9C......F-Dp..................A063.......................5I0000009ED90000003W2k3z006G5T6j0080006H000000CI00003u6E5_5_BuGi000000008I00000000",
    italic: ",04G5a,1Df,H8q,14F,49t,JAP,0ACA19a5fCH5f,28a,6544V,04R,09d,277,28E,08X,23h,23z,18h,045,75c,74b,6......Ex,L.,1......,5....,0.,D......,Y.,0.,0.,0.,054,09Z,0.,3.,0.,0.,4.,0.,0.9d,A.,0.,0.,R.,0..,0.,0.,A34,25q,P",
    bold: "474256Dd9CE8AU2y4e4e8L8I3w7N3fAx9y6M8L8m8Z8S8_7L8y903w4B8I8I8I7tCPASALAmBt9m8xBoCd6373B89SFCC5C19_C2Ak9MAABuB4FuAxAR9S62Ax62CtD08C8C8z869K8Q5n8j9j574k9I4uEO9-8s9P8z7W7b6T9g8QCh8a8d825m435m8I473j8r8z8sBI3u8b6hEJ627j8I00EJ5s5-8I5t5j4Q9a8z3Y554M5w7jC9CRCm7j......Ed.........Bs......8IC1.....9vC3......C2.........8U......8I8s.....8z.................Bs9K....................Cd9j.........57D69r....00......9S7T9T5E......9-C59e......G4Du..................AA6T.......................5n0000008pDD0000003V3I3w006d6R720088005-000000C500004X7B5w5wCfHM000000008I00000000",
    boldItalic: ",5Aj,57P,C4E,6Ao,2Bq,39U,59O,3Ay,164CO64,0D3,08b,65O53,D8n,A3v,26M,35w60,05u,04a,13Z5A,2CQD1Dv,7.,N......,5....,C.,0.,0.,0.,0..,0.,0.,0.,E.,0.,0.,0.,5.,0.,0.,0.,05O,0AR,0.,2.,0.,0.,09U,09U5O,M.,0.,0.,0.,L.,F3X3K,T",
  },
  "carlito-or-wider": {
    line: 0,
    as: "carlito",
  },
  "noto-sans-or-wider": {
    line: 0,
    as: "noto-sans",
  },
  "liberation-sans-or-wider": {
    line: 0,
    as: "liberation-sans",
  },
  "narrowest": {
    line: 1150,
    regular: "313a4a7K6vAA9X2V4D4C516V354I2z4M7W507O737W6V7M6M7W7U2y3D7n6s7n5uBj8V8W879d7f7C8R9m3Y4D886bBNA69N859N8V756gA283CI817S7L424M426Y5p2N6F7q6N7q664M6p7q383B7738CA7q7W7q7q4j534M7q6sAj6k6s5v4339437n313a6c7g7n7n396G45AP4K6f7n4I6d4M4A7J4i4S2N8P761g38344r6f9zAW9w5u8W8W8W8W8W8WBy.........9n......79AD.....857q......8j.........7d......7n7b.....7q.8W.8W.8W..........879n7q.......5_............AH7q.........388E6J....77....6d.6m466k3V......8f9r7l......DFBJ.................4w7e4M.......................3V5C5C7q7WCDEA4P5p2g2g2w3T4y4t5E5E547p4d9E5EAR794-Fe2l4x3x3x7n9ZCF4cCF4c7n7p7p9TCz",
    italic: ",14V71,0A496,047474v6U2_4C2r4K7V,07B6t,17B,07V7H2r2-7W,07W4y,07-8O7l9I,17z9l,3B19h957t,16U,09e7mBq7g7D,03x,03w6M5h,1714v,05L,06V7e,16y,0BJ,05y6t7P,04K,16Q9l6j6L,03x,03w7W,16B7U7W7V,05y,26S7W4C6M3j43,04Z4P,07s,0042w,04p6S9U9U,04y......,0.,79c......,09k.....,789.....,36V,0.....7W5y,3.73..,0.,0.,0.........819c,1.,0.,0.,05F,0.........9k7f,07e,97o,3.6y,9.,0.,0.,08O9a7S......Cm98,5........,249,1.,0.,0.,0.,0.,0.7o.....,97FBsC1,12e2e,14q4l,27k,371,12C4L,17V9VBe,0Bf,04v7o,2",
    bold: "313u4_7a7DA-AI2Y4e4e5P6b3X4p3X4M7q5u7q7e7q7B7q777q7q3t3t7p6q7p6BBa8z8n8I9t7e7B9A9t4B5B8Z6dBwAJA78LA78p7P6aA08iCj8d887V4L4M4L6s5p2u6s8P6R8P6X4O7R8P3m407W3mCd8P7q8P8O505e4i8P7QBJ7C7Q6E4i3T4i7p313j6o7q7p7q3T6x4cAf4i7C7p4y7E4t4T7O4i4d2t8l7f2C3E3v577CA5ApAK6B......C8.........A0......7TAf.....8L8h......9l.........7q......7p7q.....8P................92A08f.......6W............AI8a.........3m9N7p.3_..7W....6l.6u5g6n48......8nA28P......DdBJ..................7m5E.......................435E6W7q7WBwBk555p3P3I3X3T6767676q5P7p5PA05EAR9Q5TFe2Y4_3m3m7q9uCF4cCF4c7p7p7p9TD6",
    boldItalic: ",14s7U,19v2T4K4K5H,03N4j394L,05p,73A3U7l,164,08Z,0879j,45A,1BaA3,37I,18gCP8X7-,04D,04D6f5h,17q5k7q5y,07K8G,03z,1CA8G7A7q7q,04z4M8G6yAR,06y664K,04K,13h6l,36u4YAW4B,14t6y4e4M,22q8D7R,03D,04i,19j,0648a8a8a8a8a8a,0.,8.,5AK,37z,07q,58r.....,371......,06n.....7q.8a,08a,08a,0.........8q,07q,0.,0.,0.,05_,0.,0.,0.,0.,0.,0.,08P,99D,0..,95e,1......8W9-8G,0.,0.,0.D1A6,5........,0.,24M,0.,0.,0.,0.,0.,0.CQ.7z.7z,0.,0.,0.3x,27GBe,23H3H,15i5i5i6Y,07o5A,29H,12F4O,29bBf,0Be,053,3",
  },
};

/**
 * The key of DOCX_FONT_METRICS of a font not measured: of each character, the
 * narrowest advance of the fonts measured but the typewriter ones
 * (Liberation Mono), in a slanted style of their slanted and upright ones (the
 * narrower of both); their lowest line.
 */
export const DOCX_NARROWEST_FONT = "narrowest";

/** The font names a document may give (w:rFonts, theme fonts), in lower case, and the font measured of the same metrics, or narrower (`as`). */
export const DOCX_FONT_ALIASES: Record<string, string> = {
  "calibri": "carlito",
  "carlito": "carlito",
  "cambria": "caladea",
  "caladea": "caladea",
  "arial": "liberation-sans",
  "helvetica": "liberation-sans",
  "arimo": "liberation-sans",
  "liberation sans": "liberation-sans",
  "times new roman": "liberation-serif",
  "times": "liberation-serif",
  "tinos": "liberation-serif",
  "liberation serif": "liberation-serif",
  "courier new": "liberation-mono",
  "courier": "liberation-mono",
  "cousine": "liberation-mono",
  "liberation mono": "liberation-mono",
  "dejavu sans": "dejavu-sans",
  "dejavu serif": "dejavu-serif",
  "georgia": "gelasio",
  "gelasio": "gelasio",
  "garamond": "eb-garamond",
  "eb garamond": "eb-garamond",
  "century gothic": "tex-gyre-adventor",
  "tex gyre adventor": "tex-gyre-adventor",
  "montserrat": "montserrat",
  "open sans": "open-sans",
  "lato": "lato",
  "poppins": "poppins",
  "roboto": "roboto",
  "raleway": "raleway",
  "inter": "inter",
  "nunito": "nunito",
  "source sans 3": "source-sans-3",
  "source sans pro": "source-sans-3",
  "noto sans": "noto-sans",
  "playfair display": "playfair-display",
  "merriweather": "merriweather",
  "lora": "lora",
  "aptos": "carlito-or-wider",
  "aptos display": "carlito-or-wider",
  "aptos semibold": "carlito-or-wider",
  "aptos extrabold": "carlito-or-wider",
  "aptos black": "carlito-or-wider",
  "calibri light": "carlito-or-wider",
  "segoe ui": "carlito-or-wider",
  "segoe ui semibold": "carlito-or-wider",
  "segoe ui bold": "carlito-or-wider",
  "tahoma": "carlito-or-wider",
  "trebuchet ms": "carlito-or-wider",
  "verdana": "noto-sans-or-wider",
  "arial black": "liberation-sans-or-wider",
};
