import { getFieldsToCorrectCopy } from "./publicFormCopy";

/** A field the visitor has to complete or correct before a form can be sent (A11Y-03). */
export type FieldToCorrect = {
  /** Name listed in the message, as the form shows it; left out when `detail` says what is wrong. */
  label?: string;
  /** Sentence shown after the list, such as why the attached CV is refused. */
  detail?: string;
  /** Id of the control that takes focus; none for a check the visitor cannot type into (anti-bot). */
  focusId?: string;
};

/**
 * Text of a form's alert, which names in plain words each field to correct in the order given
 * (the order of the form). Leaves focus where it is.
 */
export function fieldsToCorrectMessage(fields: readonly FieldToCorrect[], language: string): string {
  const copy = getFieldsToCorrectCopy(language);
  const labels = fields.flatMap(field => field.label ? [field.label] : []);
  const details = fields.flatMap(field => field.detail ? [field.detail] : []);
  return [...(labels.length ? [copy.list.replace("{fields}", labels.join(copy.separator))] : []), ...details].join(copy.sentenceSeparator);
}

/**
 * Called when a form refuses to send. Returns the text of the form's alert (fieldsToCorrectMessage)
 * and puts focus on the first field to correct once that alert has rendered.
 */
export function reportFieldsToCorrect(fields: readonly FieldToCorrect[], language: string): string {
  const focusId = fields.find(field => field.focusId)?.focusId;
  if (focusId) window.requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  return fieldsToCorrectMessage(fields, language);
}
