declare global {
	/** package.json version, injected by the define in vite.config.ts. */
	const __APP_VERSION__: string;

	namespace App {
		interface Error {
			message: string;
		}
		interface Locals {}
		interface PageData {}
		interface PageState {}
		interface Platform {}
	}
}

export {};
