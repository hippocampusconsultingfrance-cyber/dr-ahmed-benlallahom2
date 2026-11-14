import type { APIRequestContext } from "@playwright/test";
import { CV_LINES, cvPdf } from "./support/cv";
import { E2E } from "./support/doubles";
import {
  adminSessionToken,
  doublesState,
  emailsTo,
  expect,
  test,
  trpc,
  TURNSTILE_TOKEN,
} from "./support/fixtures";

/** The administrator's Clerk session, past its security code sent by email, as in admin.spec.ts. */
async function verifiedAdminSession(request: APIRequestContext) {
  const session = { authorization: `Bearer ${adminSessionToken()}` };
  const codeEmails = async () =>
    (await doublesState()).emails.filter(
      sent =>
        [sent.to ?? []].flat().includes(E2E.ownerEmail) &&
        /Code : \d{6}/.test(sent.text ?? "")
    );
  const before = (await codeEmails()).length;
  expect(
    (await trpc(request, "adminSecurity.begin", undefined, session)).data
  ).toEqual({ success: true });
  await expect
    .poll(async () => (await codeEmails()).length, {
      message: "security code email",
    })
    .toBe(before + 1);
  const code = /Code : (\d{6})/.exec((await codeEmails()).at(-1)!.text!)![1];
  expect(
    (await trpc(request, "adminSecurity.verify", { code }, session)).data
  ).toEqual({ success: true });
  return session;
}

/** The link of the site an email carries, as a path of the site under test (the invitation names the public origin). */
function linkIn(text: string | undefined, path: string) {
  const link = new RegExp(
    `https?://[^\\s]+${path.replace(/[.?]/g, "\\$&")}[^\\s]*`
  ).exec(text ?? "")?.[0];
  expect(link, `link to ${path}`).toBeTruthy();
  const url = new URL(link!);
  return `${url.pathname}${url.search}`;
}

// Espace candidat : l'invitation envoyée par l'administration à un candidat, qui crée son accès
// depuis ce lien, l'active par l'email de confirmation en choisissant son mot de passe, puis
// dépose un document dans son coffre : chiffré dans Vercel Blob, relu en clair par lui seul.
test("invite un candidat dans son espace, qui l'active depuis ses emails et dépose un document chiffré dans son coffre", async ({
  page,
  request,
  db,
}) => {
  const email = "lea.garnier@e2e.test";
  const application = await request.post("/api/recruitment/apply", {
    multipart: {
      firstName: "Léa",
      lastName: "Garnier",
      email,
      specialty: "Anesthésie-réanimation",
      diplomaCountry: "France",
      targetCountries: JSON.stringify(["France"]),
      languages: JSON.stringify([]),
      language: "fr",
      gdprConsent: "1",
      marketingConsent: "0",
      turnstileToken: TURNSTILE_TOKEN,
      website: "",
      cv: {
        name: "cv-lea-garnier.pdf",
        mimeType: "application/pdf",
        buffer: await cvPdf(
          CV_LINES.map(line => line.replace("Inès Moreau", "Léa Garnier"))
        ),
      },
    },
  });
  expect(application.status(), await application.text()).toBe(201);
  await emailsTo(email);
  const {
    rows: [{ id: applicationId }],
  } = await db.query("SELECT id FROM cv_applications WHERE email = $1", [
    email,
  ]);

  // The administration invites the candidate; the invitation reaches their address.
  const session = await verifiedAdminSession(request);
  const sent = await trpc(
    request,
    "admin.recruitment.candidate.sendPortalInvitation",
    { id: applicationId },
    session
  );
  expect(sent.error).toBeNull();
  const invitation = (await emailsTo(email, 2)).find(message =>
    message.text?.includes("/candidate/access?invite=")
  );

  // From the invitation, the access page prefilled with the application's identity.
  await page.goto(linkIn(invitation?.text, "/candidate/access?invite="));
  await expect(
    page.getByText("Créer mon espace candidat", { exact: true })
  ).toBeVisible();
  await expect(page.locator("#candidate-email")).toHaveValue(email);
  await expect(page.locator("#candidate-first-name")).toHaveValue("Léa");
  for (const consent of await page.getByRole("checkbox").all())
    await consent.click();
  await page.getByRole("button", { name: "Créer mon accès" }).click();
  await expect(page.getByRole("status")).toHaveText(
    /^Votre demande d’accès a été enregistrée\./
  );

  // The activation link, then the password chosen on the page it opens, which signs in.
  const activation = (await emailsTo(email, 3)).find(message =>
    message.text?.includes("/candidate/verify?")
  );
  await page.goto(linkIn(activation?.text, "/candidate/verify?"));
  await expect(
    page.getByRole("heading", { name: "Activez votre espace candidat" })
  ).toBeVisible();
  const password = "Un coffre pour mes diplômes, 2026 !";
  await page.fill("#candidate-activation-password", password);
  await page.fill("#candidate-activation-password-confirmation", password);
  await page.getByRole("button", { name: "Activer mon espace" }).click();
  await page.waitForURL(/\/candidate\/portal$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Bonjour Léa"
  );
  const {
    rows: [account],
  } = await db.query(
    "SELECT id, email_verified_at FROM candidate_accounts WHERE email = $1",
    [email]
  );
  expect(account.email_verified_at).not.toBeNull();

  // A diploma in the vault: encrypted in Blob, listed, and given back as sent to its owner.
  const diploma = await cvPdf([
    "Diplôme de docteur en médecine",
    "Léa Garnier",
    "Université Claude Bernard Lyon 1, 2016",
  ]);
  await page.locator("#candidate-document-category").click();
  await page.getByRole("option", { name: "Diplôme" }).click();
  await page.setInputFiles("#candidate-document-file", {
    name: "diplome-lea-garnier.pdf",
    mimeType: "application/pdf",
    buffer: diploma,
  });
  await page
    .getByRole("button", { name: "Envoyer de façon sécurisée" })
    .click();
  await expect(page.locator("#candidate-document-upload-message")).toHaveText(
    "Document reçu. Il sera vérifié par notre équipe."
  );
  await expect(page.getByText("diplome-lea-garnier.pdf")).toBeVisible();
  const {
    rows: [document],
  } = await db.query(
    "SELECT id, category, storage_key, encryption_algorithm FROM candidate_documents WHERE candidate_id = $1",
    [account.id]
  );
  expect(document).toMatchObject({
    category: "diploma",
    encryption_algorithm: "aes-256-gcm",
  });
  expect((await doublesState()).blobs).toContain(document.storage_key);
  const download = await page.request.get(
    `/api/candidate/documents/${document.id}/download`
  );
  expect(download.status()).toBe(200);
  expect(Buffer.from(await download.body()).equals(diploma)).toBe(true);
  // Another browser, without the candidate's session, gets nothing.
  expect(
    (
      await request.get(`/api/candidate/documents/${document.id}/download`)
    ).status()
  ).toBe(401);
});
