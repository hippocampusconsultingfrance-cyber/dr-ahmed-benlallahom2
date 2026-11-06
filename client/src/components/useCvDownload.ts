import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** « CV » button of the admin: opens the candidate's CV through a short-lived signed link (download logged). */
export function useCvDownload() {
  return trpc.admin.recruitment.getDownloadUrl.useMutation({
    onSuccess: ({ url, fileName }) => {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = fileName;
      link.click();
    },
    onError: mutationError => toast.error(mutationError.message),
  });
}
