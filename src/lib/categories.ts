import type { ExerciseCategory } from '$lib/types';
import { m } from '$lib/paraglide/messages';

// Single source of truth for how exercise categories are ordered, named and coloured.
// Order is roughly the order you'd work through them in a session.
export { CATEGORY_ORDER } from '$lib/constants';
import { CATEGORY_ORDER } from '$lib/constants';

// 'sovt' would render as "Sovt" if we just capitalised, hence the explicit map.
// Message functions, not strings, so each call renders in the current locale.
const LABELS: Record<ExerciseCategory, () => string> = {
	warmup: m.common_category_warmup,
	sovt: m.common_category_sovt,
	pitch: m.common_category_pitch,
	resonance: m.common_category_resonance,
	intonation: m.common_category_intonation,
	reading: m.common_category_reading
};

// Badge styling for exercise cards.
const BADGE_CLASSES: Record<ExerciseCategory, string> = {
	warmup: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
	sovt: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
	pitch: 'bg-primary-500/20 text-primary-400 border-primary-500/30',
	resonance: 'bg-accent-500/20 text-accent-400 border-accent-500/30',
	intonation: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
	reading: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
};

// Solid fills for dashboard bars and legend dots.
const FILL_CLASSES: Record<ExerciseCategory, string> = {
	warmup: 'bg-amber-500',
	sovt: 'bg-teal-500',
	pitch: 'bg-primary-500',
	resonance: 'bg-accent-500',
	intonation: 'bg-sky-500',
	reading: 'bg-emerald-500'
};

const FALLBACK_BADGE = 'bg-surface-700 text-surface-300 border-surface-600';
const FALLBACK_FILL = 'bg-surface-500';

export function categoryLabel(category: string): string {
	return LABELS[category as ExerciseCategory]?.() ?? category;
}

export function categoryBadgeClass(category: string): string {
	return BADGE_CLASSES[category as ExerciseCategory] ?? FALLBACK_BADGE;
}

export function categoryFillClass(category: string): string {
	return FILL_CLASSES[category as ExerciseCategory] ?? FALLBACK_FILL;
}
