import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ROUTE_SEO_MARKER, SPA_TEMPLATE_FILE } from "../routeSeo";
import { readSpaTemplate } from "./static";

const directories: string[] = [];

async function distWith(files: Record<string, string>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spa-template-"));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(directory, name), content, "utf8");
  }
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("gabarit SPA servi par Express hors Vercel", () => {
  it("préfère le gabarit intact au fichier index.html pré-rendu pour l’accueil", async () => {
    const distPath = await distWith({
      "index.html": "<head><title>Accueil</title></head>",
      [SPA_TEMPLATE_FILE]: `<head>${ROUTE_SEO_MARKER}</head>`,
    });

    await expect(readSpaTemplate(distPath)).resolves.toBe(`<head>${ROUTE_SEO_MARKER}</head>`);
  });

  it("accepte index.html seulement s’il contient encore le marqueur", async () => {
    const distPath = await distWith({ "index.html": `<head>${ROUTE_SEO_MARKER}</head>` });

    await expect(readSpaTemplate(distPath)).resolves.toContain(ROUTE_SEO_MARKER);
  });

  it("refuse de servir un index.html pré-rendu avec le head d’une autre route", async () => {
    const distPath = await distWith({
      "index.html": '<head><link rel="canonical" href="https://drahmedbenlallahom.com/" /></head>',
    });

    await expect(readSpaTemplate(distPath)).rejects.toThrow(ROUTE_SEO_MARKER);
  });
});
