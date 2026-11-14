import { emailsTo, expect, test } from "./support/fixtures";

// RGPD : une demande d'accès aux données, enregistrée avec son échéance, l'équipe prévenue.
test("dépose une demande d'accès RGPD, qui est enregistrée et transmise à l'équipe", async ({
  page,
  db,
}) => {
  const email = "nora.haddad@e2e.test";
  await page.goto("/gdpr");
  await page.fill("#gdpr-request-name", "Nora Haddad");
  await page.fill("#gdpr-request-email", email);
  await page.fill("#gdpr-request-phone", "+33 7 55 44 33 22");
  await page.selectOption("#gdpr-request-type", "access");
  await page.fill(
    "#gdpr-request-description",
    "Je souhaite recevoir une copie des données que vous conservez à mon sujet."
  );
  await page.locator("main form button[type=submit]").click();

  await expect(
    page.getByText("Votre demande RGPD a été reçue.", { exact: false })
  ).toBeVisible();
  const { rows } = await db.query(
    "SELECT name, email, request_type, status FROM gdpr_requests WHERE email = $1",
    [email]
  );
  expect(rows).toEqual([
    {
      name: "Nora Haddad",
      email,
      request_type: "access",
      status: expect.any(String),
    },
  ]);
  expect(
    (await emailsTo("owner@e2e.test")).some(sent =>
      `${sent.subject} ${sent.text}`.includes("Nora Haddad")
    )
  ).toBe(true);
});
