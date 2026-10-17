import type { Request, Response } from "express";
import { reportCriticalProductionEnvironment } from "./_core/env";
import { createApp } from "./_core/index";

// Démarrage à froid de la fonction Vercel : startServer() (et donc
// assertCriticalProductionEnvironment) n'y est jamais appelé. On journalise
// bruyamment les variables critiques manquantes sans faire planter la fonction,
// pour que le site continue de répondre ; la liste reste consultable sur
// GET /api/health et dans le tableau de bord admin.
reportCriticalProductionEnvironment();

const appPromise = createApp();

export default async function handler(req: Request, res: Response) {
  const app = await appPromise;
  return app(req, res);
}
