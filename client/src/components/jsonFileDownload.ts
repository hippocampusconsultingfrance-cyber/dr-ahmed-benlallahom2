/** Saves a JSON document prepared by the server (export of a person's data, RGPD-12) under its file name. */
export function downloadJsonFile(input: { filename: string; content: string }) {
  const url = URL.createObjectURL(new Blob([input.content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = input.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Safari et iOS lisent parfois le blob bien après le clic : URL gardée 40 s, comme pour la facture.
  window.setTimeout(() => URL.revokeObjectURL(url), 40_000);
}
