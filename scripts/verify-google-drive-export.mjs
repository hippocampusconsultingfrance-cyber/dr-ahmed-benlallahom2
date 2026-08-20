import { enqueueCvGoogleDriveExport, processDueCvGoogleDriveExports } from "../server/googleDriveExport.ts";

const applicationId = 150001;

await enqueueCvGoogleDriveExport(applicationId, new Date());
const result = await processDueCvGoogleDriveExports(1);

console.log(JSON.stringify({ applicationId, result }, null, 2));
