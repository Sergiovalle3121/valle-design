/** One-release escape hatch. Disabled unless explicitly enabled. */
export async function exchangeLegacyPlatformToken(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_LEGACY_PLATFORM_AUTH_ENABLED !== "true" || typeof window === "undefined") return false;
  const token = window.localStorage.getItem("axos_access_token");
  if (!token) return false;
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000"}/v1/legacy/platform-auth/exchange`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${token}` } });
    return response.ok;
  } finally {
    window.localStorage.removeItem("axos_access_token");
  }
}
