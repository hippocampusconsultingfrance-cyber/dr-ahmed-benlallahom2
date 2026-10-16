type MainTarget = Pick<HTMLElement, "id" | "tabIndex" | "focus">;

export function getMainContentTarget(root: { querySelector: (selector: string) => MainTarget | null }) {
  const main = root.querySelector('main, [role="main"]');
  if (!main) return null;
  if (!main.id) main.id = "main-content";
  main.tabIndex = -1;
  return main;
}

export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only z-[100] rounded-md bg-cyan-400 px-4 py-3 font-semibold text-slate-950 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      onClick={event => {
        const main = getMainContentTarget(document);
        if (!main) return;
        event.preventDefault();
        main.focus({ preventScroll: false });
      }}
    >
      Aller au contenu principal
    </a>
  );
}
