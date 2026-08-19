export function withCsvUtf8Bom(csv: string) {
  return `\uFEFF${csv}`;
}

export function downloadRecruitmentCsv(input: { filename: string; csv: string }) {
  const blob = new Blob([withCsvUtf8Bom(input.csv)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = input.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
