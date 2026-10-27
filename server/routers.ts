// The tRPC API, assembled from one router per domain (server/routers/, the
// admin dashboard's under server/routers/admin/). The client reads the
// AppRouter type from here; the server and the tests read appRouter and the
// helpers re-exported below.
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { candidatePortalRouter } from "./candidatePortalRouter";
import { medicalQuestionsRouter } from "./medicalQuestionsRouter";
import { adminSecurityRouter } from "./routers/adminSecurity";
import { authRouter } from "./routers/auth";
import { contactRouter } from "./routers/contact";
import { gdprRouter } from "./routers/gdpr";
import { testimonialsRouter } from "./routers/testimonials";
import { appointmentsRouter } from "./routers/appointments";
import { blogRouter } from "./routers/blog";
import { availabilityRouter } from "./routers/availability";
import { recruitmentPreferencesRouter } from "./routers/recruitmentPreferences";
import { adminAppointmentsRouter } from "./routers/admin/appointments";
import { adminRecruitmentRouter } from "./routers/admin/recruitment";
import { adminClientBriefsRouter } from "./routers/admin/clientBriefs";
import { adminCandidateDocumentsRouter } from "./routers/admin/candidateDocuments";
import { adminContactsRouter } from "./routers/admin/contacts";
import { adminGdprRequestsRouter } from "./routers/admin/gdprRequests";
import { adminPersonalDataRouter } from "./routers/admin/personalData";
import { adminStatsProcedure } from "./routers/admin/stats";
import { adminAttentionProcedure } from "./routers/admin/attention";
import { adminTestimonialsRouter } from "./routers/admin/testimonials";
import { adminBlogRouter } from "./routers/admin/blog";
import { adminAvailabilityRouter } from "./routers/admin/availability";

export { BOOKING_RATE_LIMIT_MESSAGE, PUBLIC_FORM_RATE_LIMITS, PUBLIC_FORM_SECURITY_CHECK_FAILED_MESSAGE, PUBLIC_FORM_SECURITY_CHECK_UNAVAILABLE_MESSAGE, createPublicTrackingId } from "./routers/publicForms";
export { parisDateKey, parseAppointmentDate, isNightRateForParis, isWithinAvailability, isBookableAppointmentTime } from "./routers/parisTime";
export {
  getStripeClient,
  MAX_ACTIVE_APPOINTMENT_HOLDS_PER_EMAIL,
  ACTIVE_APPOINTMENT_HOLDS_LIMIT_MESSAGE,
  CONSULTATION_CHECKOUT_PRODUCT_NAME,
  BOOKING_PAYMENT_UNAVAILABLE_MESSAGE,
  BOOKING_SECURITY_CHECK_MESSAGE,
  BOOKING_SECURITY_CHECK_UNAVAILABLE_MESSAGE,
  consultationCheckoutProductData,
} from "./routers/appointments";
export { recruitmentPoolFiltersInput } from "./routers/admin/recruitmentPool";
export { reanalysisOutcome, driveRetryOutcome } from "./routers/admin/recruitment";
export { MISSION_MATCHING_MAX_CANDIDATES } from "./routers/admin/clientBriefs";

export const appRouter = router({
  system: systemRouter,
  candidatePortal: candidatePortalRouter,
  medicalQuestions: medicalQuestionsRouter,
  adminSecurity: adminSecurityRouter,
  auth: authRouter,
  contact: contactRouter,
  gdpr: gdprRouter,
  testimonials: testimonialsRouter,
  appointments: appointmentsRouter,
  blog: blogRouter,
  availability: availabilityRouter,
  recruitmentPreferences: recruitmentPreferencesRouter,

  // Admin Dashboard Procedures
  admin: router({
    appointments: adminAppointmentsRouter,
    recruitment: adminRecruitmentRouter,
    clientBriefs: adminClientBriefsRouter,
    candidateDocuments: adminCandidateDocumentsRouter,
    contacts: adminContactsRouter,
    gdprRequests: adminGdprRequestsRouter,
    personalData: adminPersonalDataRouter,
    stats: adminStatsProcedure,
    attention: adminAttentionProcedure,
    testimonials: adminTestimonialsRouter,
    blog: adminBlogRouter,
    availability: adminAvailabilityRouter,
  }),
});

export type AppRouter = typeof appRouter;
