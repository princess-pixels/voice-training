import type { Difficulty } from '$lib/types';
import { m } from '$lib/paraglide/messages';

// Message functions, not strings, so each call renders in the current locale.
const LABELS: Record<Difficulty, () => string> = {
	beginner: m.common_difficulty_beginner,
	intermediate: m.common_difficulty_intermediate,
	advanced: m.common_difficulty_advanced
};

/** The difficulty's name in the current language; an unknown value is capitalised as is. */
export function difficultyLabel(difficulty: string): string {
	return (
		LABELS[difficulty as Difficulty]?.() ?? difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
	);
}
