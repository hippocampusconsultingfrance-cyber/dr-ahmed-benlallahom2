/**
 * Who writes through the contact form (PUB-22): the form shows each one the
 * page made for its request (booking or health questions, application,
 * employer brief), and the owner's notification says which one it is. Never
 * stored: the contact_messages table has no column for it.
 */
export const CONTACT_CATEGORIES = ["patient", "health_professional", "institution", "press_partner"] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];
