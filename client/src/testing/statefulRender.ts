/**
 * TEST-ONLY: calls a component as a plain function and keeps its useState and
 * useEffect from one call to the next, so that a behavioural test can type and
 * click through the props of the returned elements, then call it again — the
 * test environment has no DOM. A test file routes React's two hooks here with
 *   vi.mock("react", async importOriginal => (await import("@/testing/statefulRender")).withStatefulHooks(await importOriginal()));
 * Outside renderStateful (for example while react-dom/server renders the
 * returned tree), React's own hooks answer. Never imported by production code.
 */
import type * as React from "react";

type Effect = { deps?: readonly unknown[]; cleanup?: () => void };
type Element = { type: unknown; props: Record<string, unknown> };

const store = {
  active: false,
  states: [] as unknown[],
  stateCursor: 0,
  effects: [] as Effect[],
  effectCursor: 0,
  pending: [] as Array<() => void>,
};

const sameDeps = (left?: readonly unknown[], right?: readonly unknown[]) =>
  Boolean(left && right && left.length === right.length && left.every((dep, index) => Object.is(dep, right[index])));

export function withStatefulHooks<T extends typeof React>(react: T): T {
  function useState(initial: unknown) {
    if (!store.active) return react.useState(initial);
    const index = store.stateCursor++;
    if (!(index in store.states)) store.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    const setState = (next: unknown) => {
      store.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(store.states[index]) : next;
    };
    return [store.states[index], setState];
  }
  function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
    if (!store.active) return react.useEffect(effect, deps);
    const index = store.effectCursor++;
    const previous = store.effects[index];
    if (previous && sameDeps(previous.deps, deps)) return;
    store.effects[index] = { deps, cleanup: previous?.cleanup };
    store.pending.push(() => {
      store.effects[index]!.cleanup?.();
      const cleanup = effect();
      store.effects[index]!.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    });
  }
  return { ...react, useState, useEffect } as T;
}

/** One render: the component's result, after the effects it scheduled have run. */
export function renderStateful<T>(component: () => T): T {
  store.active = true;
  store.stateCursor = 0;
  store.effectCursor = 0;
  let result: T;
  try {
    result = component();
  } finally {
    store.active = false;
  }
  for (const run of store.pending.splice(0)) run();
  return result;
}

/** Unmounts: runs the effects' cleanups and forgets every state. */
export function resetStatefulHooks() {
  for (const effect of store.effects) effect?.cleanup?.();
  store.states = [];
  store.effects = [];
  store.pending = [];
}

/** Every element of a returned tree (components are not expanded), to reach their props. */
export function elementsOf(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (!node || typeof node !== "object" || !("props" in node) || !("type" in node)) return [];
  const element = node as Element;
  return [element, ...elementsOf(element.props.children)];
}
