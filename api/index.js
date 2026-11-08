// Fonction Vercel (CODE-13). Le gestionnaire est le bundle que `pnpm build`
// écrit dans dist/vercel/index.js (esbuild de server/vercelEntry.ts) : ce
// fichier versionné ne fait que le re-exporter, et aucun build ne le modifie.
export { default } from "../dist/vercel/index.js";
