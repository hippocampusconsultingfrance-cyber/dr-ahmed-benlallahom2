import { E2E_ENVIRONMENT } from "./support/settings";
import { CV_LINES, cvPdf } from "./support/cv";
import { doublesState, emailsTo, expect, test } from "./support/fixtures";

// Candidature : un CV et des données personnelles confiés au site, gardés dans le coffre
// (Vercel Blob), accusés par email, puis lus par la tâche planifiée et analysés par l'IA.
test("dépose une candidature avec son CV, qui est gardé, accusé, puis lu et analysé par la tâche planifiée", async ({ page, db, request }) => {
  const email = "ines.moreau@e2e.test";
  await page.goto("/recruitment/standard");
  await page.fill("#recruitment-firstName", "Inès");
  await page.fill("#recruitment-lastName", "Moreau");
  await page.fill("#recruitment-email", email);
  await page.selectOption("#recruitment-specialty", "Anesthésie-réanimation");
  const diplomaCountry = page.getByRole("combobox", { name: "Pays d’obtention du diplôme" });
  await diplomaCountry.fill("France");
  await page.getByRole("option", { name: /^France/ }).click();
  await page.check("#recruitment-target-country-0");
  await page.setInputFiles("#recruitment-cv", { name: "cv-ines-moreau.pdf", mimeType: "application/pdf", buffer: await cvPdf(CV_LINES) });
  await page.check("#recruitment-gdpr-consent");
  await page.getByRole("button", { name: "Envoyer ma candidature" }).click();

  await expect(page.getByRole("heading", { name: "Candidature reçue" })).toBeVisible();
  const { rows: [application] } = await db.query("SELECT id, tracking_id, specialty, diploma_country, file_validation_status, analysis_status, cv_file_key FROM cv_applications WHERE email = $1", [email]);
  expect(application).toMatchObject({ specialty: "Anesthésie-réanimation", diploma_country: "France", file_validation_status: "quarantined", analysis_status: "queued" });
  await expect(page.getByText(application.tracking_id)).toBeVisible();
  expect((await doublesState()).blobs).toContain(application.cv_file_key);
  const [acknowledgement] = await emailsTo(email);
  expect(`${acknowledgement!.subject} ${acknowledgement!.text}`).toContain(application.tracking_id);

  // The night's job, called as Vercel Cron calls it: the CV read from Blob, then analysed.
  const processing = await request.get("/api/scheduled/recruitment-processing", { headers: { authorization: `Bearer ${E2E_ENVIRONMENT.CRON_SECRET}` } });
  expect(processing.status()).toBe(200);
  const { rows: [analysed] } = await db.query("SELECT file_validation_status, analysis_status, analysis_model, analysis_last_error FROM cv_applications WHERE id = $1", [application.id]);
  expect(analysed).toMatchObject({ file_validation_status: "accepted", analysis_status: expect.stringMatching(/^(?:completed|needs_review)$/), analysis_last_error: null });
  const calls = (await doublesState()).calls;
  expect(calls.filter(call => call.host === "ai-gateway.vercel.sh")).not.toHaveLength(0);
});
