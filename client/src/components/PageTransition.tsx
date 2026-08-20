import { type ReactNode } from "react";
import { useLocation } from "wouter";

/** Transition courte de contenu, automatiquement neutralisée par les préférences de réduction de mouvement. */
export default function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <div key={location} className="page-transition">{children}</div>;
}
