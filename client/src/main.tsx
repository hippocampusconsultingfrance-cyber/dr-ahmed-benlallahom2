import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installChunkLoadRecovery } from "./lib/chunkLoadRecovery";
import { createTrpcLinks } from "./lib/trpcLinks";
import "./fonts.css";
import "./index.css";

installChunkLoadRecovery();

const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    console.error("[API Mutation Error]", error);
  }
});

// The administration's queries and the candidate links' go as POST, their input out of the URL (lib/trpcLinks.ts).
const trpcClient = trpc.createClient({ links: createTrpcLinks() });

// Clerk (authentification admin) n'est plus monté ici : voir pages/AdminRoot.tsx,
// chargé uniquement sur /admin.
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
