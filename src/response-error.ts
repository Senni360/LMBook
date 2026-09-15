export async function responseError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error.trim()
    )
      return body.error;
  } catch {}
  return fallback;
}
