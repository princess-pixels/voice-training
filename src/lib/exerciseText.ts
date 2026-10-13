/**
 * Exercise titles and routine step purposes in the current language.
 *
 * The database keeps the library in English: the English title is an
 * exercise's identity (seeding upserts on it, import matches on it, and
 * practice days store it), so translations are laid over the stored text when
 * it is shown, never written back. Titles and purposes live here, shared,
 * because the practice page renders them from stored practice days on both
 * server and client; the long descriptions and instructions stay server-side
 * in $lib/server/exerciseContent.ts.
 *
 * `locale` is only for tests; callers leave it undefined.
 */
import { m } from '$lib/paraglide/messages';
import { getLocale, type Locale } from '$lib/paraglide/runtime';

/** The stored English purposes of the four routine slots (see $lib/server/routine.ts). */
export const PURPOSES = {
	warmup: 'Wake the voice up and release tension',
	sovt: 'Straw work — easy, low-strain resonance',
	focus: "Today's technical focus",
	speech: 'Put it into real speech — worth recording'
} as const;

// Message functions, not strings, so each call renders in the current locale.
const PURPOSE_MESSAGES: Record<string, () => string> = {
	[PURPOSES.warmup]: m.practice_purpose_warmup,
	[PURPOSES.sovt]: m.practice_purpose_sovt,
	[PURPOSES.focus]: m.practice_purpose_focus,
	[PURPOSES.speech]: m.practice_purpose_speech
};

/** Translated titles by English title. A locale without an entry shows the English. */
export const EXERCISE_TITLES: Partial<Record<Locale, Record<string, string>>> = {
	nb: {
		'Lip Trills / Buzzing': 'Leppetrill / brumming',
		'Humming Scales': 'Nynning i skala',
		'Jaw and Tongue Stretches': 'Tøying av kjeve og tunge',
		'Breath Support Exercise': 'Pustestøtte',
		'Straw Phonation — Basic Hum': 'Sugerørsfonasjon — enkel nynning',
		'Straw Pitch Glides': 'Glid i tonehøyde gjennom sugerør',
		'Straw-to-Voice Transfer': 'Fra sugerør til stemme',
		'Straw in Water — Bubble Phonation': 'Sugerør i vann — boblefonasjon',
		'Pitch Glides': 'Glid i tonehøyde',
		'Sustain Target Pitch': 'Hold måltonen',
		'Pitch Matching': 'Treff tonen',
		'Staircase Pitch Steps': 'Trappetrinn i tonehøyde',
		'Bright Resonance - "ee" Vowel': 'Lys resonans — «i»-vokalen',
		'Larynx Elevation Awareness': 'Kjenn at strupehodet løfter seg',
		'Big Dog, Small Dog': 'Stor hund, liten hund',
		'Whisper to Voice Transition': 'Fra hvisking til stemme',
		'Nose Pinch Test — Finding Nasal Leak': 'Neseklypetesten — finn nasal lekkasje',
		'Nasal to Oral Redirection — /m/ into /b/': 'Fra nese til munn — /m/ over i /b/',
		'Oral Resonance Reading — Nasal-Free Passage': 'Lesing med munnresonans — tekst uten nasaler',
		'Question Intonation Patterns': 'Spørsmålsintonasjon',
		'Expressive Sentence Practice': 'Uttrykksfulle setninger',
		'Melodic Speech Patterns': 'Melodisk tale',
		'Short Passage Reading': 'Høytlesing av en kort tekst',
		'Conversational Practice Prompts': 'Samtaleøvelse med spørsmål',
		'Tongue Twisters for Clarity': 'Tungekrøllere for tydelig tale'
	}
};

export function exerciseTitle(englishTitle: string, locale: Locale = getLocale()): string {
	return EXERCISE_TITLES[locale]?.[englishTitle] ?? englishTitle;
}

export function stepPurpose(storedPurpose: string): string {
	return PURPOSE_MESSAGES[storedPurpose]?.() ?? storedPurpose;
}
