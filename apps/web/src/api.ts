import type { Envelope } from "../../../packages/contracts/index";
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  headers: Record<string, string> = {},
): Promise<T> {
  const form = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch("/api/v1" + path, {
      method,
      headers: {
        ...(body === undefined
          ? {}
          : {
              "X-SOLAIR-Client": "web",
              ...(!form ? { "Content-Type": "application/json" } : {}),
            }),
        ...headers,
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "The workspace is unreachable. Check your internet connection and that the host laptop is awake.",
      "NETWORK",
      0,
    );
  }
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      "The server did not return a valid response. Reconnect to the workspace and try again.",
      "INVALID_RESPONSE",
      response.status,
    );
  }
  if (response.status === 401 && !path.startsWith("/auth/"))
    window.dispatchEvent(new Event("solair:sign-in-required"));
  if (!response.ok)
    throw new ApiError(
      result.error?.message || "The request failed. Try again.",
      result.error?.code || "REQUEST_FAILED",
      response.status,
    );
  return (result as Envelope<T>).data;
}
