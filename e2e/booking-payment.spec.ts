import { doublesState, emailsTo, expect, test } from "./support/fixtures";

// Réservation et paiement : le parcours qui rapporte de l'argent, du formulaire à la
// facture, Stripe Checkout remplacé par sa page de paiement de test.
test("réserve un créneau, paie sur Stripe Checkout et reçoit la confirmation, la facture et l'alerte du propriétaire", async ({
  page,
  db,
}) => {
  const email = "camille.martin@e2e.test";
  await page.goto("/booking");
  await page.fill("#booking-name", "Camille Martin");
  await page.fill("#booking-email", email);
  await page.fill("#booking-phone", "+33 6 12 34 56 78");
  // The third day offered: never within the two hours of notice, whatever the time of the run.
  const day = await page
    .locator("#booking-day option:not([value=''])")
    .nth(2)
    .getAttribute("value");
  await page.selectOption("#booking-day", day!);
  await page.locator("#booking-slots label").first().click();
  await page.fill(
    "#booking-details",
    "Préparation d'une anesthésie programmée"
  );
  await expect(page.getByText("Total:").locator("..")).toContainText("100");
  await page.locator("form button[type=submit]").click();

  // Stripe Checkout's double, then back to the site as Stripe sends the patient back.
  await page.waitForURL(/\/checkout\/cs_test_local_\w+$/);
  await expect(page.getByText("100,00 €")).toBeVisible();
  await page.getByRole("button", { name: "Payer" }).click();
  await page.waitForURL(
    /\/booking\/confirmation\?status=success&trackingId=APT\w+&session_id=cs_test_local_\w+$/
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Votre consultation est confirmée"
  );
  const trackingId = new URL(page.url()).searchParams.get("trackingId")!;

  const {
    rows: [appointment],
  } = await db.query(
    "SELECT payment_status, appointment_status, final_price, customer_email FROM appointments WHERE tracking_id = $1",
    [trackingId]
  );
  expect(appointment).toEqual({
    payment_status: "completed",
    appointment_status: "confirmed",
    final_price: "100.00",
    customer_email: email,
  });

  // The patient's confirmation and invoice, the owner's alert, the invoice kept in Blob.
  const patientEmails = await emailsTo(email, 2);
  expect(patientEmails.map(sent => sent.subject).sort()).toEqual([
    `Confirmation de réservation - ${trackingId}`,
    `Facture - Consultation ${trackingId}`,
  ]);
  const invoice = patientEmails.find(sent =>
    sent.subject?.startsWith("Facture")
  )!;
  expect(invoice.attachments?.map(attachment => attachment.filename)).toEqual([
    expect.stringMatching(/^Facture-FAC-\d{4}-\d{6}\.pdf$/),
  ]);
  const ownerAlerts = await emailsTo("owner@e2e.test");
  expect(ownerAlerts.some(sent => sent.subject?.includes(trackingId))).toBe(
    true
  );
  expect(
    (await doublesState()).blobs.some(
      key =>
        key.includes("invoice") ||
        key.includes("facture") ||
        key.includes("FAC-")
    )
  ).toBe(true);
});
