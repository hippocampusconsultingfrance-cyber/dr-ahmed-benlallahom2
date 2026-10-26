import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SEARCH_MAX_LENGTH } from "@shared/adminSearchLimits";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const { default: AdminSearchField } = await import("./AdminSearchField");
const { ADMIN_SEARCH_DELAY_MS, adminSearchStatus, useAdminSearch } = await import("./adminSearch");

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetStatefulHooks();
  vi.useRealTimers();
});

describe("ADM-02 — délai de frappe de la recherche admin", () => {
  it("n’envoie que le dernier terme, une fois la frappe arrêtée, sans les espaces autour", () => {
    let search = renderStateful(useAdminSearch);
    expect(search).toMatchObject({ text: "", search: undefined });

    for (const typed of ["D", "Du", "Dupont "]) {
      search.setText(typed);
      search = renderStateful(useAdminSearch);
      vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS - 50);
      search = renderStateful(useAdminSearch);
      expect(search.search).toBeUndefined();
    }
    expect(search.text).toBe("Dupont ");
    vi.advanceTimersByTime(50);
    search = renderStateful(useAdminSearch);
    expect(search.search).toBe("Dupont");

    // Spaces added at the end: same term, nothing new to send.
    search.setText("Dupont  ");
    search = renderStateful(useAdminSearch);
    vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
    expect(renderStateful(useAdminSearch).search).toBe("Dupont");
  });

  it("efface tout de suite le texte et la recherche, sans attendre ni renvoyer l’ancien terme", () => {
    let search = renderStateful(useAdminSearch);
    search.setText("APT1");
    search = renderStateful(useAdminSearch);
    vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
    search = renderStateful(useAdminSearch);
    expect(search.search).toBe("APT1");

    search.setText("APT12");
    search = renderStateful(useAdminSearch);
    search.clear();
    search = renderStateful(useAdminSearch);
    expect(search).toMatchObject({ text: "", search: undefined });
    vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS * 2);
    expect(renderStateful(useAdminSearch).search).toBeUndefined();

    // Spaces only: no search.
    search.setText("   ");
    renderStateful(useAdminSearch);
    vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
    expect(renderStateful(useAdminSearch).search).toBeUndefined();
  });

  it("n’envoie ni accent isolé ni caractère invisible ou de contrôle, et n’annonce pas « pour « ́ » »", () => {
    const typed = (text: string) => {
      renderStateful(useAdminSearch).setText(text);
      renderStateful(useAdminSearch);
      vi.advanceTimersByTime(ADMIN_SEARCH_DELAY_MS);
      return renderStateful(useAdminSearch).search;
    };
    const loaded = { isLoading: false, error: null, shown: 50, total: 302 };

    // A lone combining accent, or Arabic harakat alone: nothing to search, the whole list.
    for (const text of ["́", " ́ ّ ", "​"]) {
      expect(typed(text)).toBeUndefined();
      expect(adminSearchStatus(typed(text), loaded, "réservation(s)")).toBe("");
    }
    // Pasted with a zero-width space or a control character: the name alone, accents kept.
    expect(typed("​dupont")).toBe("dupont");
    expect(typed("du\u0000pont\u0007")).toBe("dupont");
    expect(typed(" Hélène ​  Dupont ́")).toBe("Hélène Dupont");
    expect(adminSearchStatus(typed("​dupont"), { ...loaded, total: 121 }, "réservation(s)")).toBe("50 sur 121 réservation(s) pour « dupont »");
  });
});

describe("ADM-02 — champ de recherche", () => {
  it("transmet le texte tapé, borne sa longueur et n’affiche la croix qu’avec du texte", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const props = { id: "test-search", label: "Recherche", placeholder: "Nom, email ou référence", onChange, onClear };

    const empty = renderToStaticMarkup(createElement(AdminSearchField, { ...props, value: "" }));
    expect(empty).toContain('<label for="test-search" class="block">Recherche</label>');
    expect(empty).toContain(`maxLength="${ADMIN_SEARCH_MAX_LENGTH}"`);
    expect(empty).toContain('role="searchbox"');
    expect(empty).not.toContain("Effacer la recherche");

    const filled = renderStateful(() => AdminSearchField({ ...props, value: "Dupont" }));
    expect(renderToStaticMarkup(filled)).toContain('aria-label="Effacer la recherche"');
    const input = elementsOf(filled).find(element => element.type === "input")!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "Dupont J" } });
    expect(onChange).toHaveBeenCalledWith("Dupont J");
  });

  it("rend le focus au champ quand la croix efface la recherche (la croix disparaît avec le texte)", () => {
    const onClear = vi.fn();
    const filled = renderStateful(() => AdminSearchField({ id: "test-search", label: "Recherche", placeholder: "Nom", value: "Dupont", onChange: vi.fn(), onClear }));
    // No DOM here: the field's ref receives a fake input.
    const focus = vi.fn();
    (elementsOf(filled).find(element => element.type === "input")!.props.ref as { current: unknown }).current = { focus };

    (elementsOf(filled).find(element => element.type === "button")!.props.onClick as () => void)();

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(onClear.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]!);
  });

  it("annonce le résultat d’une recherche dans une zone lue par les lecteurs d’écran, présente dès l’affichage", () => {
    const props = { id: "test-search", label: "Recherche", placeholder: "Nom", value: "", onChange: vi.fn(), onClear: vi.fn() };
    expect(renderToStaticMarkup(createElement(AdminSearchField, props))).toContain('<p role="status" class="sr-only"></p>');
    expect(renderToStaticMarkup(createElement(AdminSearchField, { ...props, value: "dupont", status: "3 candidature(s) pour « dupont »" })))
      .toContain('<p role="status" class="sr-only">3 candidature(s) pour « dupont »</p>');

    const loaded = { isLoading: false, error: null, shown: 50, total: 65 };
    expect(adminSearchStatus("dupont", loaded, "candidature(s)")).toBe("50 sur 65 candidature(s) pour « dupont »");
    expect(adminSearchStatus("dupont", { ...loaded, shown: 0, total: 0 }, "candidature(s)")).toBe("Aucun résultat pour « dupont »");
    // Nothing to announce without search, nor while the first page loads or fails.
    expect(adminSearchStatus(undefined, loaded, "candidature(s)")).toBe("");
    expect(adminSearchStatus("dupont", { ...loaded, isLoading: true }, "candidature(s)")).toBe("");
    expect(adminSearchStatus("dupont", { ...loaded, error: { message: "Erreur" } }, "candidature(s)")).toBe("");
  });
});
