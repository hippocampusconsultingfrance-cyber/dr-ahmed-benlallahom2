export type ConnectionPreference = { saveData?: boolean } | undefined;

export function shouldReduceMotionForConnection(connection: ConnectionPreference) {
  return connection?.saveData === true;
}
