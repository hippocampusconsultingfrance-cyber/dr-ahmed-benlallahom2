import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  ENV: { forgeApiKey: "test-forge-key", forgeApiUrl: "" },
}));

const {
  invokeLLM,
  LLM_CALL_BUDGET_MS,
  LLM_REQUEST_MINIMUM_MS,
  LLM_REQUEST_TIMEOUT_MS,
} = await import("./llm");
const { ProcessingDeadlineError, runWithProcessingDeadline } = await import(
  "../processingDeadline"
);

const call = () =>
  invokeLLM({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: "Bonjour" }],
  });
const answer = () =>
  new Response(
    JSON.stringify({
      id: "r",
      created: 0,
      model: "gpt-5-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
    })
  );

// Each request's timeout, and a way to make it fire: the request then fails as fetch does when its signal aborts.
let timeouts: number[];
let signals: AbortController[];
const fetchMock = vi.fn<typeof fetch>();

function hangUntilTimeout() {
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(
            new DOMException(
              "The operation was aborted due to timeout",
              "TimeoutError"
            )
          )
        );
      })
  );
}

/** Lets the request in flight run until its own timeout, then fires it. */
async function timeOut(request: number) {
  await vi.advanceTimersByTimeAsync(timeouts[request]!);
  signals[request]!.abort();
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  timeouts = [];
  signals = [];
  vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
    // As Node's own: a delay with a fraction is refused, and no request is sent.
    if (!Number.isInteger(ms))
      throw new RangeError(
        `The value of "delay" is out of range. It must be an integer. Received ${ms}`
      );
    timeouts.push(ms);
    const controller = new AbortController();
    signals.push(controller);
    return controller.signal;
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("appel à l’IA borné dans le temps (EXPL-12)", () => {
  it("coupe une requête qui ne répond pas après 30 s, et la nouvelle tentative s’arrête avec le budget de 45 s de l’appel", async () => {
    hangUntilTimeout();
    const startedAt = Date.now();
    const result = call().catch(error => error as Error);

    await vi.advanceTimersByTimeAsync(0);
    expect(timeouts).toEqual([LLM_REQUEST_TIMEOUT_MS]);
    await timeOut(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(timeouts).toHaveLength(2);
    expect(timeouts[1]).toBeLessThanOrEqual(
      LLM_CALL_BUDGET_MS - LLM_REQUEST_TIMEOUT_MS
    );
    expect(timeouts[1]).toBeGreaterThanOrEqual(LLM_REQUEST_MINIMUM_MS);
    await timeOut(1);

    expect(await result).toMatchObject({ name: "TimeoutError" });
    // No third request: it would have ended after the call's budget.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Date.now() - startedAt).toBeLessThanOrEqual(
      LLM_CALL_BUDGET_MS + 1_000
    );
  });

  it("fait au plus 2 nouvelles tentatives, chacune après 5 s au plus, même quand le fournisseur demande d’attendre 2 minutes", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response("busy", { status: 503, headers: { "retry-after": "120" } })
    );
    const startedAt = Date.now();
    const result = call().catch(error => error as Error);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(await result).toMatchObject({
      message: expect.stringContaining("LLM invoke failed: 503"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Date.now() - startedAt).toBe(10_000);
  });

  it("dans un travail planifié, donne à la requête au plus le temps qui lui reste", async () => {
    fetchMock.mockImplementation(async () => answer());

    const result = await runWithProcessingDeadline(Date.now() + 20_000, call);

    expect(result.choices[0]?.message.content).toBe("ok");
    expect(timeouts).toEqual([20_000]);
  });

  it("n’envoie aucune requête quand le travail planifié n’a plus le temps minimum : la tâche peut être rendue à la file", async () => {
    await expect(
      runWithProcessingDeadline(Date.now() + LLM_REQUEST_MINIMUM_MS - 1, call)
    ).rejects.toBeInstanceOf(ProcessingDeadlineError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refait la requête après un refus passager quand il reste moins de 30 s au travail planifié, l’attente tirée au hasard comprise", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.371);
    fetchMock
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockImplementation(async () => answer());
    const result = runWithProcessingDeadline(Date.now() + 25_000, call).catch(
      error => error as Error
    );

    await vi.advanceTimersByTimeAsync(10_000);

    expect(await result).toMatchObject({
      choices: [{ message: { content: "ok" } }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timeouts).toHaveLength(2);
    expect(timeouts[1]).toBeGreaterThanOrEqual(LLM_REQUEST_MINIMUM_MS);
    expect(timeouts[1]).toBeLessThan(25_000);
  });

  it("refait une requête coupée par son délai de 30 s, hors travail planifié, dans ce qui reste du budget de l’appel", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.629);
    hangUntilTimeout();
    const result = call().catch(error => error as Error);

    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockImplementation(async () => answer());
    await timeOut(0);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await result).toMatchObject({
      choices: [{ message: { content: "ok" } }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timeouts[1]).toBeGreaterThanOrEqual(LLM_REQUEST_MINIMUM_MS);
    expect(timeouts[1]).toBeLessThanOrEqual(
      LLM_CALL_BUDGET_MS - LLM_REQUEST_TIMEOUT_MS
    );
  });

  it("ne refait pas une requête coupée par la fin du travail planifié : l’échec est celui du fournisseur", async () => {
    hangUntilTimeout();
    const result = runWithProcessingDeadline(Date.now() + 25_000, call).catch(
      error => error as Error
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(timeouts).toEqual([25_000]);
    await timeOut(0);
    await vi.advanceTimersByTimeAsync(5_000);

    const error = await result;
    expect(error).toMatchObject({ name: "TimeoutError" });
    expect(error).not.toBeInstanceOf(ProcessingDeadlineError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
