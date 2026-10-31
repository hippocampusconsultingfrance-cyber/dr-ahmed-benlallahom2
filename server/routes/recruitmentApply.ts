import { RECRUITMENT_CV_ACCEPTED_EXTENSIONS, RECRUITMENT_CV_ACCEPTED_MIME_TYPES, RECRUITMENT_CV_MAX_BYTES } from "../../shared/recruitmentCvLimits";
import type { Express } from "express";
import multer from "multer";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { secureReference } from "../_core/secureReference";
import { storageDelete, storagePut } from "../storage";
import { RECRUITMENT_CV_FORMAT_MESSAGE, recruitmentCvValidationMessage, validateCvFile } from "../recruitmentFileValidation";
import { cvApplications } from "../../drizzle/schema";
import { createCandidateInvitationToken } from "../candidateAuth";
import { SITE_LANGUAGES } from "../emailLanguage";
import { isSameRecruitmentSubmission } from "../recruitmentSubmissionDeduplication";
import { sendTrackedCvApplicationConfirmationEmail } from "../recruitmentEmailTrace";
import { CV_APPLICATION_SUBMISSION_UNIQUE_INDEX, isUniqueViolation } from "../databaseConstraints";
import { PUBLIC_APP_ORIGIN, safeErrorName, safeFileName } from "./routeHelpers";

function safeErrorMetadata(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const candidate = error as Record<string, unknown>;
  const safeText = (value: unknown) => typeof value === "string" ? value.slice(0, 120) : undefined;
  const safeNumber = (value: unknown) => typeof value === "number" ? value : undefined;
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: safeText(candidate.code),
    status: safeNumber(candidate.status),
    constraint: safeText(candidate.constraint),
  };
}

// 4 MB (Vercel function bodies are limited to 4.5 MB); PDF or DOCX only.
const RECRUITMENT_MAX_FILE_SIZE = RECRUITMENT_CV_MAX_BYTES;
const RECRUITMENT_MAX_TARGET_COUNTRIES = 18;
const RECRUITMENT_ALLOWED_MIME_TYPES = new Set<string>(RECRUITMENT_CV_ACCEPTED_MIME_TYPES);

const recruitmentUpload = multer({
  storage: multer.memoryStorage(),
  // Browsers send the file name in UTF-8: read as latin1, each accented
  // letter of « Diplôme » became two characters, then two "_" once stored.
  defParamCharset: "utf8",
  limits: { fileSize: RECRUITMENT_MAX_FILE_SIZE, files: 1, fields: 20 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split(".").pop() ?? "";
    const allowedExtension = (RECRUITMENT_CV_ACCEPTED_EXTENSIONS as readonly string[]).includes(extension);
    if (!allowedExtension || !RECRUITMENT_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error(RECRUITMENT_CV_FORMAT_MESSAGE));
      return;
    }
    callback(null, true);
  },
});

const recruitmentApplicationSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).optional().default(""),
  specialty: z.string().trim().min(1).max(160),
  diplomaCountry: z.string().trim().min(1).max(100),
  targetCountries: z.array(z.string().trim().min(1).max(80)).min(1).max(RECRUITMENT_MAX_TARGET_COUNTRIES),
  languages: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  yearsExperience: z.number().int().min(0).max(70).optional(),
  availability: z.string().trim().max(100).optional().default(""),
  mobility: z.string().trim().max(150).optional().default(""),
  certifications: z.string().trim().max(1000).optional().default(""),
  message: z.string().trim().max(5000).optional().default(""),
  gdprConsent: z.literal("1"),
  marketingConsent: z.enum(["0", "1"]).default("0"),
  website: z.string().max(200).optional().default(""),
  turnstileToken: z.string().min(20).max(4096),
  // Language shown by the form (EN-02); missing or unknown values mean French
  // and never refuse an application.
  language: z.enum(SITE_LANGUAGES).catch("fr"),
});

function parseListField(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(item => typeof item === "string");
  } catch {
    // FormData callers must use JSON arrays; invalid values fail schema validation.
  }
  return [];
}

/** Public recruitment application: multipart form with the CV, parsed by Multer. */
export function registerRecruitmentApplyRoute(app: Express) {
  app.post("/api/recruitment/apply", (req, res, next) => {
    recruitmentUpload.single("cv")(req, res, async uploadError => {
      if (uploadError) {
        const tooLarge = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE";
        const message = tooLarge
          ? "Le CV ne doit pas dépasser 4 Mo. Compressez-le ou enregistrez-le en PDF, puis réessayez."
          : uploadError.message || "Le fichier CV n’a pas pu être reçu.";
        // The forms translate these two refusals by their code; any other upload error stays generic there.
        const code = tooLarge ? "recruitment_cv_too_large" : uploadError.message === RECRUITMENT_CV_FORMAT_MESSAGE ? "recruitment_cv_format_refused" : undefined;
        res.status(400).json({ error: message, ...(code ? { code } : {}) });
        return;
      }

      let recruitmentStage = "request-validation";
      // Set once this application counts towards the per-IP cap, so that a failure on our side gives it
      // back, and cleared as soon as the request has a lasting effect (stored CV, confirmation sent).
      let releaseIpAttempt: (() => Promise<void>) | null = null;
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Le CV est requis.", code: "recruitment_cv_required" });
          return;
        }

        const parsed = recruitmentApplicationSchema.safeParse({
          ...req.body,
          diplomaCountry: req.body.diplomaCountry,
          targetCountries: parseListField(req.body.targetCountries),
          languages: parseListField(req.body.languages),
          yearsExperience: req.body.yearsExperience === "" || req.body.yearsExperience === undefined
            ? undefined
            : Number(req.body.yearsExperience),
        });

        if (!parsed.success) {
          // Names of the refused fields and the kind of issue only, never the submitted values.
          const rejectedFields = Array.from(new Set(parsed.error.issues.map(issue => `${issue.path.map(String).join(".")}:${issue.code}`)));
          console.warn("Recruitment application rejected:", rejectedFields.join(", "));
          const targetCountriesTooMany = parsed.error.issues.some(issue => issue.path[0] === "targetCountries" && issue.code === "too_big");
          res.status(400).json({
            error: targetCountriesTooMany
              ? `Vous pouvez sélectionner jusqu’à ${RECRUITMENT_MAX_TARGET_COUNTRIES} pays ciblés.`
              : "Les informations de candidature sont invalides.",
            code: targetCountriesTooMany ? "recruitment_target_countries_too_many" : "recruitment_application_invalid",
          });
          return;
        }

        if (parsed.data.website.trim()) {
          res.status(400).json({ error: "La candidature n’a pas pu être traitée." });
          return;
        }

        recruitmentStage = "security-protection";
        const { verifyCandidateTurnstile } = await import("../candidateTurnstile");
        const { enforcePersistentRateLimit, hashSecurityValue, logSecurityEvent } = await import("../candidateSecurity");
        const { countPublicFormDailyVolume, enforcePublicEmailIpRateLimit, releasePublicEmailIpRateLimit } = await import("../publicFormRateLimit");
        const clientIp = req.ip || "unknown";
        const ipHash = hashSecurityValue(clientIp);
        const refuseProtection = async (protectionError: unknown) => {
          await logSecurityEvent({ actorKind: "anonymous", actorReference: parsed.data.email, category: "public_recruitment_apply_protection", outcome: "blocked", severity: "warning", ipHash })
            .catch(securityLogError => console.error("Recruitment protection log error:", safeErrorName(securityLogError)));
          console.warn("Recruitment protection rejected:", safeErrorName(protectionError));
          const rateLimited = protectionError instanceof Error && protectionError.message === "candidate_security_rate_limited";
          res.status(400).json({
            error: rateLimited
              ? "Trop de tentatives ont été effectuées. Patientez une heure avant de réessayer."
              : "La vérification de sécurité doit être renouvelée avant l’envoi.",
            code: rateLimited ? "recruitment_rate_limited" : "recruitment_security_check_required",
          });
        };
        try {
          await verifyCandidateTurnstile({ token: parsed.data.turnstileToken, remoteIp: clientIp });
          await enforcePersistentRateLimit({ action: "public_recruitment_apply", subject: `${clientIp}:${parsed.data.email}`, maxAttempts: 10, windowMs: 24 * 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
        } catch (protectionError) {
          await refuseProtection(protectionError);
          return;
        }

        recruitmentStage = "file-validation";
        const trackingId = secureReference("CV", 16);
        const originalName = safeFileName(file.originalname);
        let fileValidation;
        try {
          fileValidation = validateCvFile({
            buffer: file.buffer,
            mimeType: file.mimetype,
            originalName,
            size: file.size,
          });
        } catch (validationError) {
          const code = validationError instanceof Error ? validationError.message : "cv_validation_failed";
          res.status(400).json({ error: recruitmentCvValidationMessage(code), code });
          return;
        }
        recruitmentStage = "database-connect";
        const db = await (await import("../db")).getDb();
        if (!db) {
          res.status(503).json({ error: "Le service de candidature est temporairement indisponible.", code: "recruitment_service_unavailable" });
          return;
        }

        // MAIL-01: only an application that passed every check counts towards the
        // per-IP cap; a refused CV or anti-bot check leaves the budget untouched.
        recruitmentStage = "ip-rate-limit";
        const emailIpHash = req.ip ? ipHash : null;
        try {
          await enforcePublicEmailIpRateLimit("recruitmentApply", emailIpHash);
        } catch (protectionError) {
          if (!(protectionError instanceof Error && protectionError.message === "candidate_security_rate_limited")) throw protectionError;
          await refuseProtection(protectionError);
          return;
        }
        releaseIpAttempt = () => releasePublicEmailIpRateLimit("recruitmentApply", emailIpHash);

        // The application already received from this candidate for the same
        // pathway, target countries and CV file, if any.
        const findSameSubmission = async () => {
          const sameFile = await db.select({
            id: cvApplications.id,
            trackingId: cvApplications.trackingId,
            email: cvApplications.email,
            specialty: cvApplications.specialty,
            targetCountries: cvApplications.targetCountries,
          }).from(cvApplications).where(eq(cvApplications.fileChecksum, fileValidation.checksum)).limit(20);
          return sameFile.find(candidate => isSameRecruitmentSubmission(candidate, parsed.data)) ?? null;
        };
        // A repeated sending stores nothing new: the candidate gets the stored application's reference and confirmation.
        const answerAlreadyReceived = async (duplicate: { id: number; trackingId: string }) => {
          const candidatePortalInviteUrl = `${PUBLIC_APP_ORIGIN}/candidate/access?invite=${encodeURIComponent(createCandidateInvitationToken(Number(duplicate.id)))}`;
          // ABUS-01: beyond the day's volume, no confirmation goes to the typed address.
          if (await countPublicFormDailyVolume("recruitmentApply")) {
            await sendTrackedCvApplicationConfirmationEmail({
              applicationId: Number(duplicate.id),
              candidateEmail: parsed.data.email,
              candidateFirstName: parsed.data.firstName,
              trackingId: duplicate.trackingId,
              candidatePortalInviteUrl,
              language: parsed.data.language,
            });
          }
          // This application keeps its place in the per-IP cap (its confirmation may be skipped beyond the day's volume).
          releaseIpAttempt = null;
          await logSecurityEvent({ actorKind: "anonymous", actorReference: parsed.data.email, category: "public_recruitment_apply_duplicate_file", outcome: "allowed", severity: "info", ipHash });
          res.status(200).json({ success: true, duplicate: true, trackingId: duplicate.trackingId });
        };

        recruitmentStage = "duplicate-check";
        const duplicate = await findSameSubmission();
        if (duplicate) {
          await answerAlreadyReceived(duplicate);
          return;
        }
        // A long analysis queue never refuses a candidate: the dossier is
        // stored and queued, and the owner is alerted (at most once a day).
        recruitmentStage = "queue-backlog-check";
        try {
          const { countWaitingCvAnalyses, notifyOwnerOfAnalysisBacklog, RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD } = await import("../recruitmentProcessingWorker");
          const waitingAnalyses = await countWaitingCvAnalyses(RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD);
          // Counted up to the threshold only: the figure is a lower bound.
          if (waitingAnalyses >= RECRUITMENT_ANALYSIS_BACKLOG_ALERT_THRESHOLD) await notifyOwnerOfAnalysisBacklog(waitingAnalyses, { atLeast: true });
        } catch (backlogError) {
          console.error("Recruitment backlog check error:", safeErrorName(backlogError));
        }

        recruitmentStage = "storage-upload";
        const storageResult = await storagePut(
          `recruitment/quarantine/${trackingId}-${originalName}`,
          file.buffer,
          file.mimetype,
        );
        // The CV is now stored: a later failure (e.g. a refused INSERT) no longer gives the attempt back,
        // otherwise each such request would leave a file in quarantine without using up the cap.
        releaseIpAttempt = null;
        const retentionUntil = new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + 2);

        recruitmentStage = "application-insert";
        const storedTargetCountries = JSON.stringify(parsed.data.targetCountries);
        let insertResult: Awaited<ReturnType<typeof db.execute>>;
        try {
          insertResult = await db.execute(sql`INSERT INTO cv_applications (
            tracking_id, first_name, last_name, email, phone, specialty, diploma_country,
            target_countries, languages, years_experience, availability, mobility, certifications, message,
            cv_file_key, cv_original_name, cv_mime_type, cv_size_bytes,
            file_validation_status, file_checksum, file_validation_notes,
            gdpr_consent, marketing_consent, status, consent_at, retention_until, language
          ) VALUES (
            ${trackingId}, ${parsed.data.firstName}, ${parsed.data.lastName}, ${parsed.data.email},
            ${parsed.data.phone || null}, ${parsed.data.specialty}, ${parsed.data.diplomaCountry}, ${storedTargetCountries},
            ${JSON.stringify(parsed.data.languages)}, ${parsed.data.yearsExperience ?? null},
            ${parsed.data.availability || null}, ${parsed.data.mobility || null}, ${parsed.data.certifications || null},
            ${parsed.data.message || null}, ${storageResult.key}, ${originalName}, ${file.mimetype}, ${file.size},
            'quarantined', ${fileValidation.checksum}, ${fileValidation.notes}, 1,
            ${parsed.data.marketingConsent === "1" ? 1 : 0}, 'new', NOW(), ${retentionUntil}, ${parsed.data.language}
          ) RETURNING id`);
        } catch (insertError) {
          // DATA-11: a simultaneous sending of the same application was stored
          // first (unique index of drizzle/pg/0004). Answered like a repeated
          // sending; this request's copy of the CV is not kept.
          if (!isUniqueViolation(insertError, CV_APPLICATION_SUBMISSION_UNIQUE_INDEX)) throw insertError;
          // Found with the index's own expressions: PostgreSQL's lower() and
          // isSameRecruitmentSubmission differ on a few letters (Turkish İ),
          // so the copy the index refused may not be the same for the latter.
          const [stored] = await db.select({ id: cvApplications.id, trackingId: cvApplications.trackingId }).from(cvApplications).where(and(
            sql`lower(${cvApplications.email}) = lower(${parsed.data.email})`,
            sql`lower(${cvApplications.specialty}) = lower(${parsed.data.specialty})`,
            eq(cvApplications.fileChecksum, fileValidation.checksum),
            sql`md5(${cvApplications.targetCountries}) = md5(${storedTargetCountries})`,
          )).limit(1);
          if (!stored) throw insertError;
          await storageDelete([storageResult.key]).catch(deleteError => console.error("Recruitment duplicate CV cleanup error:", safeErrorName(deleteError)));
          await answerAlreadyReceived(stored);
          return;
        }

        const insertedId = Number((insertResult.rows[0] as { id?: number } | undefined)?.id || 0);

        recruitmentStage = "notifications";
        const candidateName = `${parsed.data.firstName} ${parsed.data.lastName}`;
        const candidatePortalInviteUrl = insertedId
          ? `${PUBLIC_APP_ORIGIN}/candidate/access?invite=${encodeURIComponent(createCandidateInvitationToken(Number(insertedId)))}`
          : undefined;
        // ABUS-01: beyond the day's volume the application is kept without the
        // candidate's confirmation, the owner's email or the AI analysis.
        const withinDailyVolume = await countPublicFormDailyVolume("recruitmentApply");
        if (withinDailyVolume) await Promise.allSettled([
          (async () => {
            await sendTrackedCvApplicationConfirmationEmail({
              applicationId: insertedId,
              candidateEmail: parsed.data.email,
              candidateFirstName: parsed.data.firstName,
              trackingId,
              candidatePortalInviteUrl,
              language: parsed.data.language,
            });
          })(),
          notifyOwner({
            title: `Nouvelle candidature recrutement — ${candidateName}`,
            content: `**Référence:** ${trackingId}\n**Email:** ${parsed.data.email}\n**Spécialité:** ${parsed.data.specialty}\n**Pays du diplôme:** ${parsed.data.diplomaCountry}\n**Pays ciblés:** ${parsed.data.targetCountries.join(", ")}\n**CV:** reçu et stocké de manière privée`,
          }),
        ]);

        recruitmentStage = "follow-up-queues";
        if (insertedId) {
          const { deferCvAnalysisForDailyVolume, enqueueCvAnalysis } = await import("../recruitmentProcessing");
          const { enqueueCvGoogleDriveExport } = await import("../googleDriveExport");
          const queueResults = await Promise.allSettled([
            withinDailyVolume ? enqueueCvAnalysis(Number(insertedId)) : deferCvAnalysisForDailyVolume(Number(insertedId)),
            enqueueCvGoogleDriveExport(Number(insertedId)),
          ]);
          for (const queueResult of queueResults) {
            if (queueResult.status === "rejected") {
              console.error("Recruitment follow-up queue error:", safeErrorName(queueResult.reason));
            }
          }
        }

        recruitmentStage = "response";
        res.status(201).json({ success: true, trackingId });
      } catch (error) {
        console.error("Recruitment application error:", {
          stage: recruitmentStage,
          ...safeErrorMetadata(error),
        });
        if (releaseIpAttempt) {
          await releaseIpAttempt().catch(releaseError => console.error("Recruitment rate limit release error:", safeErrorName(releaseError)));
        }
        res.status(500).json({ error: "La candidature n’a pas pu être enregistrée." });
      }
    });
  });
}
