import type { Express } from "express";
import {
  RECRUITMENT_ONE_CLICK_UNSUBSCRIBE_PATH,
  recruitmentUnsubscribeToken,
  unsubscribeFromRecruitmentMarketing,
} from "../routers/recruitmentPreferences";
import { PUBLIC_APP_ORIGIN, safeErrorName } from "./routeHelpers";

/**
 * One-click unsubscribe of the recruitment campaigns (RGPD-19, RFC 8058). The
 * List-Unsubscribe header of each campaign email points here with the token
 * of the unsubscribe link of its body: the mail client posts
 * « List-Unsubscribe=One-Click », as a form or multipart, and the candidate
 * is unsubscribed at once, without signing in, the token being the proof.
 * The answer is never a redirect (RFC 8058). A GET, which a link scanner or a
 * client opening the address sends, unsubscribes nobody: it leads to the page
 * of the link, which asks for a confirmation.
 */
export function registerRecruitmentUnsubscribeRoute(app: Express) {
  const tokenOf = (query: unknown) =>
    recruitmentUnsubscribeToken.safeParse((query as { token?: unknown }).token);

  app.post(RECRUITMENT_ONE_CLICK_UNSUBSCRIBE_PATH, async (req, res) => {
    const token = tokenOf(req.query);
    if (!token.success) {
      res.status(400).json({ error: "Lien de désinscription invalide." });
      return;
    }
    try {
      const result = await unsubscribeFromRecruitmentMarketing(
        token.data,
        "list_unsubscribe_one_click"
      );
      if (!result) {
        res
          .status(404)
          .json({ error: "Lien de désinscription invalide ou expiré." });
        return;
      }
      res.status(200).json({
        success: true,
        alreadyUnsubscribed: result.alreadyUnsubscribed,
      });
    } catch (error) {
      console.error("[RecruitmentUnsubscribe] One-click unsubscribe failed", {
        error: safeErrorName(error),
      });
      res.status(500).json({
        error:
          "La désinscription n’a pas pu être enregistrée. Réessayez dans quelques instants.",
      });
    }
  });

  app.get(RECRUITMENT_ONE_CLICK_UNSUBSCRIBE_PATH, (req, res) => {
    const page = new URL("/recruitment/unsubscribe", PUBLIC_APP_ORIGIN);
    const token = tokenOf(req.query);
    if (token.success) page.searchParams.set("token", token.data);
    res.redirect(303, page.toString());
  });
}
