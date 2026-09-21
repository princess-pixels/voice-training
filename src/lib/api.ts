/**
 * The pages' side of the JSON API: one request helper that turns a non-2xx
 * reply into an ApiError carrying the server's message, so every call site
 * stops decoding error bodies by hand.
 */

export class ApiError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

/** The message the server put in a failed reply, or a plain HTTP line. */
async function failureMessage(response: Response): Promise<string> {
	const text = await response.text().catch(() => '');
	try {
		const body = JSON.parse(text) as { message?: unknown } | null;
		if (body && typeof body.message === 'string' && body.message) return body.message;
	} catch {
		// not JSON
	}
	return text.trim() || `Request failed (HTTP ${response.status})`;
}

/**
 * fetch + decode. JSON bodies are sent as JSON; a FormData body goes through
 * as multipart. Throws ApiError on a non-2xx reply. `T` is what a 2xx reply
 * decodes to; pass `void` for replies whose body does not matter.
 */
export async function request<T>(
	url: string,
	init: Omit<RequestInit, 'body'> & { body?: FormData | object | null } = {}
): Promise<T> {
	const { body, headers, ...rest } = init;
	const isForm = body instanceof FormData;
	const response = await fetch(url, {
		...rest,
		headers: {
			...(body != null && !isForm ? { 'Content-Type': 'application/json' } : {}),
			...(headers as Record<string, string> | undefined)
		},
		body: body == null ? undefined : isForm ? body : JSON.stringify(body)
	});
	if (!response.ok) throw new ApiError(response.status, await failureMessage(response));
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export function deleteSession(id: string): Promise<void> {
	return request<void>(`/api/sessions/${id}`, { method: 'DELETE' });
}

/** What to show for an error thrown by request(), or anything else. */
export function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error && err.message ? err.message : fallback;
}
