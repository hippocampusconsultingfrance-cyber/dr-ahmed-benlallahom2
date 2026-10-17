import { defineConfig } from "drizzle-kit";

// Source de vérité des migrations : drizzle/pg (PostgreSQL / Neon). L'ancien
// historique MySQL/TiDB (drizzle/legacy-mysql) n'est plus lu par drizzle-kit.
// Procédure complète : drizzle/MIGRATION_SOURCE_OF_TRUTH.md.
//
// `drizzle-kit generate` n'a pas besoin de base : sans DATABASE_URL, une adresse
// factice non joignable est utilisée, si bien que `drizzle-kit migrate` échoue
// au lieu de viser une base par erreur.
const connectionString = process.env.DATABASE_URL?.trim() || "postgresql://unset:unset@127.0.0.1:1/unset";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
