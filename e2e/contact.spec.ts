import { emailsTo, expect, test } from "./support/fixtures";

// Contact : le message laissé depuis l'accueil, enregistré et transmis à l'équipe.
test("envoie un message depuis l'accueil, qui est enregistré et transmis à l'équipe", async ({
  page,
  db,
}) => {
  const email = "paul.lefevre@e2e.test";
  await page.goto("/#contact");
  const form = page.locator("#contact form");
  await form.scrollIntoViewIfNeeded();
  await page.fill("#contact-name", "Paul Lefèvre");
  await page.fill("#contact-phone", "+33 6 11 22 33 44");
  await page.fill("#contact-email", email);
  await page.fill(
    "#contact-message",
    "Bonjour, je souhaite organiser une intervention pour une conférence sur l'anesthésie."
  );
  await page.check("#gdprConsent");
  await form.locator("button[type=submit]").click();

  await expect(
    page.getByText("Message envoyé !", { exact: true })
  ).toBeVisible();
  const { rows } = await db.query(
    "SELECT name, email, gdpr_consent FROM contact_messages WHERE email = $1",
    [email]
  );
  expect(rows).toEqual([{ name: "Paul Lefèvre", email, gdpr_consent: 1 }]);
  expect(
    (await emailsTo("owner@e2e.test")).some(sent =>
      `${sent.subject} ${sent.text}`.includes("Paul Lefèvre")
    )
  ).toBe(true);
});
