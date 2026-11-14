// @vitest-environment happy-dom
import { createElement, type ReactElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ADM-10 — une action de l’administration qui échoue le dit, même quand son
// écran n’a pas de gestionnaire d’erreur : un seul message, jamais deux, et
// rien sur les pages publiques, qui parlent à leurs visiteurs dans leur
// langue. Le vrai client tRPC de l’application, ses liens et sa QueryClient ;
// seul le serveur est remplacé par un refus.

const view = vi.hoisted(() => ({ toasts: [] as string[] }));
vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => view.toasts.push(message),
    success: vi.fn(),
  },
}));

const { trpc } = await import("./trpc");
const { createTrpcLinks } = await import("./trpcLinks");
const { createQueryClient } = await import("./queryClient");

const EXPIRED = "Validation de sécurité administrateur requise (10003)";

/** The server refuses every call of the batch, as adminProcedure does once the security session has expired. */
function refuseEveryCall(message: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const calls = decodeURIComponent(
        new URL(String(input)).pathname.split("/api/trpc/")[1]!
      ).split(",");
      return new Response(
        JSON.stringify(
          calls.map(path => ({
            error: {
              json: {
                message,
                code: -32603,
                data: { code: "FORBIDDEN", httpStatus: 403, path },
              },
            },
          }))
        ),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    })
  );
}

function mount(element: ReactElement) {
  const queryClient = createQueryClient();
  const client = trpc.createClient({
    links: createTrpcLinks("http://localhost/api/trpc"),
  });
  return render(
    createElement(trpc.Provider, {
      client,
      queryClient,
      children: createElement(
        QueryClientProvider,
        { client: queryClient },
        element
      ),
    })
  );
}

function MarkRead({
  ownOnError,
}: {
  ownOnError?: (error: { message: string }) => void;
}) {
  const markRead = trpc.admin.contacts.markRead.useMutation(
    ownOnError ? { onError: ownOnError } : {}
  );
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { type: "button", onClick: () => markRead.mutate({ id: 1 }) },
      "Lu"
    ),
    markRead.error
      ? createElement("p", { role: "status" }, markRead.error.message)
      : null
  );
}

function RejectQuestion() {
  const reject = trpc.medicalQuestions.admin.reject.useMutation();
  return createElement(
    "button",
    { type: "button", onClick: () => reject.mutate({ id: 7 }) },
    "Classer"
  );
}

function Unsubscribe() {
  const unsubscribe = trpc.recruitmentPreferences.unsubscribe.useMutation();
  return createElement(
    "div",
    null,
    createElement(
      "button",
      {
        type: "button",
        onClick: () => unsubscribe.mutate({ token: "t".repeat(32) }),
      },
      "Se désinscrire"
    ),
    unsubscribe.error
      ? createElement("p", { role: "status" }, "Lien invalide")
      : null
  );
}

beforeEach(() => {
  view.toasts = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ADM-10 — message par défaut d’une action de l’administration qui échoue", () => {
  it("affiche le refus d’une action sans gestionnaire d’erreur, une fois, et laisse l’erreur à l’écran qui l’a lancée", async () => {
    refuseEveryCall(EXPIRED);
    mount(createElement(MarkRead));
    fireEvent.click(screen.getByRole("button", { name: "Lu" }));

    // The refusal of an expired security session stays readable by the screen (ADM-05) and is said once.
    expect((await screen.findByRole("status")).textContent).toBe(EXPIRED);
    expect(view.toasts).toEqual([EXPIRED]);
  });

  it("ne double pas le message d’une action qui a son propre gestionnaire d’erreur", async () => {
    refuseEveryCall("Message introuvable.");
    const ownOnError = vi.fn((error: { message: string }) =>
      view.toasts.push(`propre : ${error.message}`)
    );
    mount(createElement(MarkRead, { ownOnError }));
    fireEvent.click(screen.getByRole("button", { name: "Lu" }));

    await waitFor(() => expect(ownOnError).toHaveBeenCalledTimes(1));
    await screen.findByRole("status");
    expect(view.toasts).toEqual(["propre : Message introuvable."]);
  });

  it("couvre aussi les actions des questions santé de l’administration", async () => {
    refuseEveryCall("Question introuvable.");
    mount(createElement(RejectQuestion));
    fireEvent.click(screen.getByRole("button", { name: "Classer" }));

    await waitFor(() => expect(view.toasts).toEqual(["Question introuvable."]));
  });

  it("laisse les pages publiques dire leurs erreurs elles-mêmes, sans le texte français du serveur", async () => {
    refuseEveryCall("Lien de désinscription invalide.");
    mount(createElement(Unsubscribe));
    fireEvent.click(screen.getByRole("button", { name: "Se désinscrire" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Lien invalide"
    );
    expect(view.toasts).toEqual([]);
  });
});
