import { useEffect } from "react";
import { shouldReduceMotionForConnection, type ConnectionPreference } from "./connectionMotion";

type NetworkInformation = ConnectionPreference & {
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

export default function ConnectionMotionPreference() {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    const sync = () => document.documentElement.classList.toggle("data-saver", shouldReduceMotionForConnection(connection));
    sync();
    connection?.addEventListener?.("change", sync);
    return () => {
      connection?.removeEventListener?.("change", sync);
      document.documentElement.classList.remove("data-saver");
    };
  }, []);

  return null;
}
