import { lazy } from "react";

// The recruitment tabs are the heaviest of the dashboard. They are loaded when
// first opened, so the dashboard file keeps within its budget (80 KiB gzip,
// PERFORMANCE_BUDGET.md) while the booking and medical tabs stay in it and open
// at once. Each one is then measured as its own on-demand file (30 KiB).
export const RecruitmentTab = lazy(() => import("@/components/RecruitmentTab"));
export const CandidateDocumentsAdminTab = lazy(() => import("@/components/CandidateDocumentsAdminTab"));
export const VivierTab = lazy(() => import("@/components/VivierTab"));
export const MailingTab = lazy(() => import("@/components/MailingTab"));
export const EmployerBriefsTab = lazy(() => import("@/components/EmployerBriefsTab"));
