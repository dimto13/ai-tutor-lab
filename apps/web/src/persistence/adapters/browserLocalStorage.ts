export function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}
