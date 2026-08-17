import { processDueCvAnalysisJobs } from "../server/recruitmentProcessing.ts";

const result = await processDueCvAnalysisJobs(1);
console.log(JSON.stringify(result, null, 2));
