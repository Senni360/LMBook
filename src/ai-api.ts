import { responseError } from "./response-error";

export async function aiApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: {
      "x-sennibook": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(
      await responseError(
        response,
        "The connection could not complete. Try again.",
      ),
    );
  return response.json() as Promise<T>;
}
