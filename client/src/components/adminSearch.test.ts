import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementsOf, renderStateful, resetStatefulHooks } from "@/testing/statefulRender";

vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));

const { default: AdminSearchField } = await import("./AdminSearchField");
const { ADMIN_SEARCH_DELAY_MS, ADMIN_SEARCH_MAX_LENGTH, useAdminSearch } = await import("./adminSearch");

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
});

describe("ADM-02 — champ de recherche", () => {
  it("transmet le texte tapé, borne sa longueur et n’affiche la croix qu’avec du texte", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const props = { id: "test-search", label: "Recherche", placeholder: "Nom, email ou référence", onChange, onClear };

    const empty = renderToStaticMarkup(createElement(AdminSearchField, { ...props, value: "" }));
    expect(empty).toContain('<label for="test-search">Recherche</label>');
    expect(empty).toContain(`maxLength="${ADMIN_SEARCH_MAX_LENGTH}"`);
    expect(empty).toContain('role="searchbox"');
    expect(empty).not.toContain("Effacer la recherche");

    const filled = AdminSearchField({ ...props, value: "Dupont" });
    expect(renderToStaticMarkup(filled)).toContain('aria-label="Effacer la recherche"');
    const input = elementsOf(filled).find(element => element.type === "input")!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "Dupont J" } });
    expect(onChange).toHaveBeenCalledWith("Dupont J");
    const clear = elementsOf(filled).find(element => element.type === "button")!;
    (clear.props.onClick as () => void)();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
