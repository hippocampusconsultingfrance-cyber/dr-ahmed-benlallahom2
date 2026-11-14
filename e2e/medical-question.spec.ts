import { emailsTo, expect, test } from "./support/fixtures";

// Question santé : des données de santé confiées au site, avec l'accord de la personne,
// enregistrées puis accusées par email, l'équipe prévenue.
test("envoie une question santé, reçoit sa référence et son accusé, et l'équipe est prévenue", async ({
  page,
  db,
}) => {
  const email = "louise.bernard@e2e.test";
  await page.goto("/questions-anesthesie");
  await page.fill("#medical-question-firstName", "Louise");
  await page.fill("#medical-question-lastName", "Bernard");
  await page.fill("#medical-question-email", email);
  await page.fill("#medical-question-phone", "+33 6 98 76 54 32");
  await page.fill(
    "#medical-question-text",
    "Combien de temps faut-il rester à jeun avant une anesthésie générale pour une opération du genou ?"
  );
  await page.check("#medical-question-privacy");
  await page.check("#medical-question-urgency");
  await page.getByRole("button", { name: "Envoyer ma question" }).click();

  await expect(
    page.getByRole("heading", { name: "Votre question a bien été reçue" })
  ).toBeVisible();
  const reference = (await page.locator("p.font-mono").textContent())!.trim();

  const { rows } = await db.query(
    "SELECT email, privacy_consent, status FROM medical_questions WHERE tracking_id = $1",
    [reference]
  );
  expect(rows).toEqual([
    { email, privacy_consent: 1, status: expect.any(String) },
  ]);
  const [acknowledgement] = await emailsTo(email);
  expect(`${acknowledgement!.subject} ${acknowledgement!.text}`).toContain(
    reference
  );
  expect(
    (await emailsTo("owner@e2e.test")).some(sent =>
      `${sent.subject} ${sent.text}`.includes(reference)
    )
  ).toBe(true);
});
