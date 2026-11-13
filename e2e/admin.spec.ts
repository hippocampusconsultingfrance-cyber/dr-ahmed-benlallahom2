import { CV_LINES, cvPdf } from "./support/cv";
import { E2E } from "./support/doubles";
import { E2E_ENVIRONMENT } from "./support/settings";
import { adminSessionToken, doublesState, emailsTo, expect, test, trpc, TURNSTILE_TOKEN } from "./support/fixtures";

// Administration : connexion Clerk puis double authentification par code envoyé par email,
// connexion de Google Drive, et un dossier de candidature suivi jusqu'à son export dans
// Drive, par l'API que l'administration appelle. L'interface d'administration charge Clerk
// depuis son instance, qui n'a pas de double : elle n'est pas ouverte ici.
test("connecte l'administrateur avec sa double authentification, relie Google Drive et y exporte une candidature analysée", async ({ request, db }) => {
  // Without a session, then with one but before the security code: refused.
  expect((await trpc(request, "admin.recruitment.dashboard")).error?.code).toBe("FORBIDDEN");
  const session = { authorization: `Bearer ${adminSessionToken()}` };
  expect(await trpc(request, "adminSecurity.status", undefined, session)).toMatchObject({ status: 200, data: { verified: false, email: E2E.ownerEmail } });
  const beforeCode = await trpc(request, "admin.recruitment.dashboard", undefined, session);
  expect(beforeCode.error).toEqual({ code: "FORBIDDEN", message: "Validation de sécurité administrateur requise (10003)" });

  // The security code, sent by email, unlocks the administration for this browser.
  expect((await trpc(request, "adminSecurity.begin", undefined, session)).data).toEqual({ success: true });
  const [codeEmail] = await emailsTo(E2E.ownerEmail);
  const code = /Code : (\d{6})/.exec(codeEmail!.text ?? "")?.[1];
  expect(code).toMatch(/^\d{6}$/);
  expect(await trpc(request, "adminSecurity.verify", { code }, session)).toMatchObject({ status: 200, data: { success: true } });
  expect((await trpc(request, "adminSecurity.status", undefined, session)).data).toMatchObject({ verified: true });

  // Google Drive: the consent screen is Google's; its double gives a code for this state.
  const connect = await request.get("/api/google-drive/oauth/connect", { headers: session, maxRedirects: 0 });
  expect(connect.status()).toBe(302);
  const consent = new URL(connect.headers().location!);
  expect(consent.origin).toBe("https://accounts.google.com");
  const state = consent.searchParams.get("state")!;
  // The state cookie is `__Host-` and Secure: sent here by hand, as the browser sends it over
  // HTTPS, beside the security code's own cookie.
  const mfaCookie = (await request.storageState()).cookies.find(cookie => cookie.name === "admin_mfa_session")!;
  const callback = await request.get(`/api/google-drive/oauth/callback?code=e2e-authorization-code&state=${encodeURIComponent(state)}`, {
    headers: { ...session, cookie: `admin_mfa_session=${mfaCookie.value}; __Host-google_drive_oauth_state=${encodeURIComponent(state)}` },
    maxRedirects: 0,
  });
  expect(callback.headers().location, await callback.text()).toBe("/admin?googleDrive=connected");
  expect((await db.query("SELECT count(*)::int AS connections FROM google_drive_connections")).rows).toEqual([{ connections: 1 }]);

  // A candidate applies (as the form posts it), then the night's job analyses the CV and exports it to Drive.
  const email = "yanis.benali@e2e.test";
  const application = await request.post("/api/recruitment/apply", {
    multipart: {
      firstName: "Yanis",
      lastName: "Benali",
      email,
      specialty: "Anesthésie-réanimation",
      diplomaCountry: "Algérie",
      targetCountries: JSON.stringify(["France"]),
      languages: JSON.stringify([]),
      language: "fr",
      gdprConsent: "1",
      marketingConsent: "0",
      turnstileToken: TURNSTILE_TOKEN,
      website: "",
      cv: { name: "cv-yanis-benali.pdf", mimeType: "application/pdf", buffer: await cvPdf(CV_LINES.map(line => line.replace("Inès Moreau", "Yanis Benali"))) },
    },
  });
  expect(application.status(), await application.text()).toBe(201);
  await emailsTo(email);
  const processing = await request.get("/api/scheduled/recruitment-processing", { headers: { authorization: `Bearer ${E2E_ENVIRONMENT.CRON_SECRET}` } });
  expect(processing.status()).toBe(200);
  const { rows: [exported] } = await db.query("SELECT a.tracking_id, a.analysis_status, j.status AS drive_status FROM cv_applications a JOIN cv_google_drive_export_jobs j ON j.application_id = a.id WHERE a.email = $1", [email]);
  expect(exported).toMatchObject({ analysis_status: expect.stringMatching(/^(?:completed|needs_review)$/), drive_status: "completed" });
  expect((await doublesState()).calls.filter(call => call.host === "www.googleapis.com" && call.method === "POST")).toHaveLength(1);

  // The administration lists the application with its reference.
  const listed = await trpc<{ items?: Array<{ trackingId: string }> } | Array<{ trackingId: string }>>(request, "admin.recruitment.list", { search: email }, session);
  expect(listed.error).toBeNull();
  const items = Array.isArray(listed.data) ? listed.data : listed.data?.items ?? [];
  expect(items.map(item => item.trackingId)).toEqual([exported.tracking_id]);
});
