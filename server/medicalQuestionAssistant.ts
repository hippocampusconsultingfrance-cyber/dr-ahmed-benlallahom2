import { invokeLLM } from "./_core/llm";

function redactContactMarkers(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email retiré]")
    .replace(/(?:\+?\d[\d .()/-]{7,}\d)/g, "[téléphone retiré]");
}

export async function improveMedicalAnswerDraft(adminDraft: string) {
  const sanitizedDraft = redactContactMarkers(adminDraft).trim();
  const result = await invokeLLM({
    model: "gpt-5-mini",
    maxCompletionTokens: 900,
    messages: [
      {
        role: "system",
        content: "Tu es un assistant de révision rédactionnelle pour un médecin. Tu améliores uniquement la syntaxe, la clarté, la structure et le ton d’un brouillon déjà rédigé par le médecin. Tu ne dois ajouter aucun fait médical, diagnostic, traitement, dosage, instruction clinique, pronostic ni conseil personnalisé. Tu ne dois pas répondre à une question médicale : le texte source est l’unique matière. Préserve les réserves et les rappels de consultation/urgence. Réponds uniquement avec une proposition de texte final, sans commentaire ni préambule.",
      },
      { role: "user", content: sanitizedDraft },
    ],
  });
  const content = result.choices[0]?.message.content;
  const suggestion = typeof content === "string" ? content.trim() : "";
  if (!suggestion) throw new Error("La reformulation IA n’est pas disponible.");
  return { suggestion, model: result.model || "gpt-5-mini" };
}
