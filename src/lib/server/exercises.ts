import { upsertExercises } from './db';
import { DEFAULT_TARGET_RANGE } from '$lib/audio/utils';

// Default target range for pitch exercises
const DEFAULT_PITCH_RANGE = DEFAULT_TARGET_RANGE;

const exercises = [
	// Warmup exercises
	{
		category: 'warmup' as const,
		title: 'Lip Trills / Buzzing',
		description: 'Gentle vocal warm-up to relax your vocal cords and establish breath support.',
		instructions: `Start by relaxing your lips and face. Take a deep breath, then blow air through your lips to create a "brrr" sound (like a horse). As you do this, gently glide your pitch up and down like a siren. 

Do this for about 30 seconds to 1 minute. The lip trill helps reduce vocal tension and naturally encourages proper breath support. Focus on keeping the sound smooth and continuous without breaks.`,
		estimatedMinutes: 2,
		difficulty: 'beginner' as const
	},
	{
		category: 'warmup' as const,
		title: 'Humming Scales',
		description: 'Gentle humming to warm up your voice and feel resonance in your face.',
		instructions: `Close your lips gently and hum a comfortable pitch. Feel the vibration in your lips, nose, and face. 

Now slowly hum up and down a 5-note scale (do-re-mi-fa-sol-fa-mi-re-do). Keep the hum light and buzzy. Focus on feeling vibrations in your "mask" area (lips, nose, cheekbones). 

Repeat this 5 times, gradually extending your range higher each time while staying comfortable.`,
		estimatedMinutes: 3,
		difficulty: 'beginner' as const
	},
	{
		category: 'warmup' as const,
		title: 'Jaw and Tongue Stretches',
		description: 'Physical stretches to release tension in your jaw and tongue.',
		instructions: `Jaw stretches: Gently open your mouth as wide as comfortable, hold for 5 seconds, then release. Repeat 5 times. Next, move your jaw in circles (5 times each direction) to loosen the joint.

Tongue stretches: Stick your tongue out as far as possible, trying to touch your chin, hold for 5 seconds. Then try to touch your nose with your tongue tip. Finally, stick your tongue out and move it side to side (left to right) 10 times.

These stretches reduce muscle tension that can affect your vocal quality.`,
		estimatedMinutes: 3,
		difficulty: 'beginner' as const
	},
	{
		category: 'warmup' as const,
		title: 'Breath Support Exercise',
		description: 'Develop proper diaphragmatic breathing for sustained vocal control.',
		instructions: `Place one hand on your belly and one on your chest. Take a deep breath in through your nose, focusing on expanding your belly (not your chest). Your hand on the belly should move outward while the chest hand stays still.

Exhale slowly through pursed lips, making a "sss" sound. Try to maintain a steady, strong hiss for as long as possible. Count the seconds.

Goal: Build up to 20-30 seconds of steady hiss. Repeat 5 times. This builds the breath support needed for feminine vocal endurance.`,
		estimatedMinutes: 3,
		difficulty: 'beginner' as const
	},

	// SOVT / straw exercises
	// Semi-occluded vocal tract work. The straw creates back-pressure above the vocal
	// folds, which lets them vibrate with less collision force — so this is the
	// low-effort, low-strain way to build resonance and stamina.
	{
		category: 'sovt' as const,
		title: 'Straw Phonation — Basic Hum',
		description: 'The foundation of straw work: an easy, sustained hum through a narrow straw.',
		instructions: `You need a regular drinking straw (a narrow one — the thinner the straw, the more resistance).

Place the straw between your lips and seal your lips around it. Your tongue stays down and relaxed, jaw loose. All the air must go through the straw — nothing through the nose, nothing leaking around your lips.

Now hum a comfortable, easy pitch through the straw for about 5 seconds. It should feel almost effortless — you're aiming for a gentle buzzing sensation in your lips and face, not volume. If it feels strained or you're pushing hard, you're doing too much: back off until it's easy.

Rest, then repeat 10 times.

Why this works: the straw creates back-pressure above your vocal folds, so they vibrate more efficiently and with less impact. This is the safest way to work your voice — you genuinely cannot strain yourself doing it gently.`,
		estimatedMinutes: 3,
		difficulty: 'beginner' as const
	},
	{
		category: 'sovt' as const,
		title: 'Straw Pitch Glides',
		description: 'Sirens through the straw — build pitch range without any strain.',
		instructions: `Set up as in the basic hum: straw sealed between your lips, tongue down, jaw relaxed.

Glide your pitch slowly from your lowest comfortable note up to your highest and back down, like a siren, all through the straw. Keep it smooth — no jumps or breaks.

Because the straw takes the effort out of it, you'll often find you can reach higher through the straw than you can with an open mouth. That's the point: this is how you extend your range safely.

Do 10 glides, resting between each. If your voice breaks or flips partway up, that's normal — just keep gliding through it. It smooths out with practice.`,
		estimatedMinutes: 4,
		difficulty: 'beginner' as const
	},
	{
		category: 'sovt' as const,
		title: 'Straw-to-Voice Transfer',
		description:
			'The key exercise — carry the easy, forward feeling from the straw into open speech.',
		instructions: `This is the one that makes straw work actually change your speaking voice.

1. Hum a comfortable pitch through the straw for 5 seconds. Pay close attention to where you feel the vibration — it should be forward, in your lips and the front of your face.

2. Keeping that exact feeling, remove the straw and immediately hum the same pitch with your lips closed. Try to keep the vibration in the same place.

3. Now open into an "ee" or "oo" vowel on that same pitch, still chasing that forward buzz.

4. Finally, say a short phrase — "hello, how are you" — trying to keep that same placement.

Repeat the whole 4-step chain 8 times. The goal isn't the straw itself, it's the sensation the straw teaches you. You're learning what "easy and forward" feels like so you can find it without the straw.`,
		targetRange: DEFAULT_PITCH_RANGE,
		estimatedMinutes: 6,
		difficulty: 'intermediate' as const
	},
	{
		category: 'sovt' as const,
		title: 'Straw in Water — Bubble Phonation',
		description: 'Straw work with added resistance and visual feedback from the bubbles.',
		instructions: `Fill a glass with water. Put your straw in so the tip sits about 2–5 cm below the surface (deeper = more resistance; start shallow).

Hum through the straw so the water bubbles. Aim for a steady, even stream of bubbles — that's your feedback signal. Erratic or stuttering bubbles mean your airflow isn't steady.

Hold for 5 seconds, rest, repeat 10 times. Then try slow pitch glides while bubbling.

This adds more back-pressure than a dry straw and gives your vocal folds a gentle massage. It's a lovely thing to do when your voice feels tired or scratchy after a long practice session — or as a warm-down at the end.

Keep it gentle. You should never feel like you're forcing air.`,
		estimatedMinutes: 4,
		difficulty: 'intermediate' as const
	},

	// Pitch exercises
	{
		category: 'pitch' as const,
		title: 'Pitch Glides',
		description: 'Slide smoothly from your low range up into the feminine pitch range.',
		instructions: `Start on a comfortable low pitch and slowly slide upward like a siren, going as high as you can without straining. Hold the top briefly, then slide back down.

Use sounds like "ng" (as in "sing") or "mm" to help keep the resonance forward. Focus on the smoothness of the glide - no steps or jumps.

Target: Work toward consistently reaching 180-220 Hz comfortably. Practice 10 glides, resting between each one.`,
		targetRange: DEFAULT_PITCH_RANGE,
		estimatedMinutes: 5,
		difficulty: 'beginner' as const
	},
	{
		category: 'pitch' as const,
		title: 'Sustain Target Pitch',
		description: 'Hold a steady pitch in the feminine range to build muscle memory.',
		instructions: `Open the reference notes under the pitch graph and tap a note near the bottom of your target range (around 180-200 Hz if you are starting out). Match it with a hum or "oo" sound; the readout shows how far off you are and the line on the graph shows where the note sits.

Hold the pitch steady for 10 seconds, focusing on keeping it stable without wavering. Keep your trace on the line.

Rest, then repeat. Try to sustain 200 Hz, then gradually work up to 220 Hz over time. Do 10 repetitions, resting between each.`,
		targetRange: DEFAULT_PITCH_RANGE,
		estimatedMinutes: 5,
		difficulty: 'beginner' as const
	},
	{
		category: 'pitch' as const,
		title: 'Pitch Matching',
		description: 'Train your ear and voice to find and hold specific pitches.',
		instructions: `Use the reference notes under the pitch graph. Tap a note in your target range (the highlighted ones), then immediately sing or hum that same pitch.

Hold for 5 seconds and watch the readout: it says "On it" within 10 cents, otherwise how far sharp or flat you are. Adjust and try again if needed.

Practice with 5 different notes across your target range. This develops pitch accuracy and helps you learn what different frequencies feel like in your voice.`,
		targetRange: DEFAULT_PITCH_RANGE,
		estimatedMinutes: 5,
		difficulty: 'intermediate' as const
	},
	{
		category: 'pitch' as const,
		title: 'Staircase Pitch Steps',
		description: 'Step up through pitches in small increments to expand your range.',
		instructions: `Starting at 180 Hz, sing or hum a note for 3 seconds. Then step up 10 Hz to 190 Hz and hold for 3 seconds. Continue stepping up: 200 Hz, 210 Hz, 220 Hz.

When you reach the top, step back down the same way.

Use "ee" or "oo" vowels. Focus on keeping the quality consistent as you go higher - don't let your voice get breathy or strained. If a step feels too high, stop and work at that level until it's comfortable before proceeding.`,
		targetRange: DEFAULT_PITCH_RANGE,
		estimatedMinutes: 5,
		difficulty: 'intermediate' as const
	},

	// Resonance exercises
	{
		category: 'resonance' as const,
		title: 'Bright Resonance - "ee" Vowel',
		description: 'Focus resonance forward for a brighter, more feminine sound.',
		instructions: `Sing "ee" (as in "see") on a comfortable pitch around 200 Hz. Focus on feeling the vibration in your lips, teeth, and the front of your face (the "mask").

The "ee" vowel naturally pulls resonance forward. Avoid letting the sound drop back into your throat - keep it light and buzzy in the front.

Hold for 5 seconds, rest, and repeat 10 times. Try to make each repetition sound bright and clear, not dark or muffled.`,
		estimatedMinutes: 4,
		difficulty: 'beginner' as const
	},
	{
		category: 'resonance' as const,
		title: 'Larynx Elevation Awareness',
		description: 'Learn to feel and control your larynx position.',
		instructions: `Place your finger gently on your Adam's apple (thyroid cartilage). Swallow - feel how your larynx rises? That's the motion we want.

Now try to hold that "beginning of a swallow" position without actually swallowing. Breathe normally while keeping the larynx slightly elevated. This opens up the vocal tract for a brighter resonance.

Practice holding this position for 10 seconds at a time. Don't force it - it should feel comfortable. Once you can hold it, try humming or making "mm" sounds while maintaining the elevated position.`,
		estimatedMinutes: 5,
		difficulty: 'intermediate' as const
	},
	{
		category: 'resonance' as const,
		title: 'Big Dog, Small Dog',
		description: 'Shift between dark and bright resonance to feel the difference.',
		instructions: `Say "woof woof" like a big dog - make it deep, rumbly, and chesty. Feel the resonance in your chest and throat. This is "dark" resonance.

Now say "yip yip" like a small dog - make it high, bright, and sharp. Feel the resonance in your mouth and nose. This is "bright" resonance.

Alternate between the two, really exaggerating the difference. The small dog sound is closer to the resonance we're aiming for. Practice 10 rounds of big dog/small dog.`,
		estimatedMinutes: 3,
		difficulty: 'beginner' as const
	},
	{
		category: 'resonance' as const,
		title: 'Whisper to Voice Transition',
		description: 'Find forward resonance by starting with a whisper.',
		instructions: `Start by whispering "hello" or "how are you" - feel how the whisper naturally places the sound forward in your mouth and face.

Now gradually add voice to the whisper, turning it into a soft, breathy spoken voice while keeping that forward placement. 

Focus on maintaining the "forward" feeling as you increase volume. The whisper helps you find the right resonance placement without pitch getting in the way. Practice with 10 phrases, transitioning from whisper to soft voice.`,
		estimatedMinutes: 4,
		difficulty: 'intermediate' as const
	},

	// Oral vs nasal resonance
	// Getting sound out through the mouth rather than the nose. A nasal-sounding
	// voice reads as "thin" or "whiny" rather than feminine — this is the fix.
	{
		category: 'resonance' as const,
		title: 'Nose Pinch Test — Finding Nasal Leak',
		description: "Diagnose whether your sound is escaping through your nose when it shouldn't.",
		instructions: `In English, only three sounds are supposed to be nasal: /m/, /n/ and /ng/. Everything else should come out of your mouth. If sound is leaking through your nose on other sounds, your voice picks up a thin, whiny quality — and that's a very common thing to accidentally do when reaching for a higher pitch.

The test:

1. Sustain "ahhh" for 5 seconds.
2. While still sounding, pinch your nostrils closed with your fingers, then release, then pinch again.
3. Listen carefully. Did the sound change?

If the sound stays the same when you pinch — perfect, you're resonating orally.
If the sound changes, muffles, or buzzes against your fingers — sound is escaping through your nose.

Now test these, pinching and releasing partway through each:
- "eeee"
- "papa papa papa"
- "baby buggy bumpers"

None of those contain nasal consonants, so none should change when you pinch. Note which ones do — those are the sounds to work on.

Compare with "mmmm" — that one *should* change dramatically when you pinch, because it's supposed to be nasal. That's your reference for what nasal feels like.`,
		estimatedMinutes: 3,
		difficulty: 'beginner' as const
	},
	{
		category: 'resonance' as const,
		title: 'Nasal to Oral Redirection — /m/ into /b/',
		description: 'Use a nasal sound as a launchpad, then redirect the airflow into your mouth.',
		instructions: `This exercise teaches your soft palate to close, which is what sends sound out through your mouth instead of your nose.

1. Hum "mmmm" and feel the buzz in your nose. Put a finger lightly on the side of your nose — you should feel it vibrating. This is nasal.

2. Now go "mmmm-bahhh". As you move from the /m/ into the /b/, the vibration in your nose should stop and the sound should move forward into your mouth. Keep your finger on your nose to check.

3. Repeat with: "mmmm-bee", "mmmm-boo", "mmmm-bay".

The moment of transition is the thing you're learning — that's your soft palate lifting to seal off the nose. Do 10 of each.

Once that's reliable, drop the /m/ and just say "bah", "bee", "boo", "bay" while keeping a finger on your nose. No vibration should reach your finger.`,
		estimatedMinutes: 4,
		difficulty: 'beginner' as const
	},
	{
		category: 'resonance' as const,
		title: 'Oral Resonance Reading — Nasal-Free Passage',
		description: 'Sustained reading practice with a passage containing no nasal consonants at all.',
		instructions: `This passage deliberately contains no /m/, /n/ or /ng/ sounds. That means if you feel *any* nasal buzz while reading it, sound is going where it shouldn't.

Read it aloud slowly, with a finger resting lightly on the side of your nose:

"He was where the road stopped, cold water at his boots. It was quiet there, just the black rock at the top of the hill. He looked to the west a while, took a breath, gathered his bag off the grass, turned about, and left."

Your finger should feel nothing at all. If you feel buzzing, slow down and find which word caused it.

Read it three times: first slowly and carefully, then at a normal pace, then once more at your target pitch with forward resonance. Keeping it clean at your target pitch is the hard part — raising pitch tends to pull sound into the nose, so this is exactly where the work is.`,
		estimatedMinutes: 5,
		difficulty: 'intermediate' as const
	},

	// Intonation exercises
	{
		category: 'intonation' as const,
		title: 'Question Intonation Patterns',
		description: 'Practice rising pitch at the end of sentences for feminine speech patterns.',
		instructions: `Read these statements as questions, rising at the end:
- "You're coming with us?"
- "You like this?"
- "We should go?"

Focus on letting the pitch rise in the last 2-3 words. Don't overdo it - a subtle rise sounds natural, while an exaggerated rise sounds like Valley Girl.

Record yourself and listen back. The rise should be about 10-20 Hz higher at the end. Practice with 10 different questions.`,
		estimatedMinutes: 5,
		difficulty: 'beginner' as const
	},
	{
		category: 'intonation' as const,
		title: 'Expressive Sentence Practice',
		description: 'Add variety and musicality to your speech patterns.',
		instructions: `Read the following sentence with different emotions, noticing how your pitch and inflection change:
"I can't believe you did that."

Try it: Happy, Surprised, Disappointed, Playful, Sarcastic

Feminine speech tends to have more pitch variation and expressiveness. Practice exaggerating the ups and downs slightly (without becoming sing-songy). Record yourself and aim for at least 20 Hz of variation within a single sentence.`,
		estimatedMinutes: 5,
		difficulty: 'intermediate' as const
	},
	{
		category: 'intonation' as const,
		title: 'Melodic Speech Patterns',
		description: 'Develop flowing, musical speech rather than monotone delivery.',
		instructions: `Read this passage focusing on making it sound melodic and flowing:

"The sun was setting behind the mountains, painting the sky in brilliant shades of orange and pink. Birds were singing their evening songs as a gentle breeze rustled through the trees."

Avoid reading in a flat, monotone voice. Let your pitch rise and fall naturally with the content - up for new information, down for completion. Think of it like telling a story to a friend, not reading a grocery list.

Record yourself and listen. There should be clear pitch movement throughout. Practice 3 times.`,
		estimatedMinutes: 5,
		difficulty: 'intermediate' as const
	},

	// Reading exercises
	{
		category: 'reading' as const,
		title: 'Short Passage Reading',
		description: 'Practice sustained feminine voice with a longer text.',
		instructions: `Read the following passage aloud, maintaining your target pitch (180-220 Hz), forward resonance, and expressive intonation throughout:

"The old bookstore on the corner had always been my favorite place in the city. The owner, Mrs. Patterson, knew exactly which books I would love before I even asked. Every Saturday morning, I would spend hours browsing the dusty shelves, discovering stories that would stay with me for weeks. The smell of old paper and the quiet creak of wooden floors made it feel like a second home."

Focus on consistency - don't let your pitch drop or resonance move backward as you get distracted by the content. Check that the Average readout stays in range. Record and review.`,
		estimatedMinutes: 5,
		difficulty: 'intermediate' as const
	},
	{
		category: 'reading' as const,
		title: 'Conversational Practice Prompts',
		description: 'Practice natural conversation with self-response.',
		instructions: `Ask yourself these questions aloud, then answer them in full sentences, maintaining your feminine voice throughout:

1. "What did you do this weekend?"
2. "How do you feel about your voice progress?"
3. "What's your favorite movie and why?"
4. "Describe your ideal vacation."

Speak for at least 30 seconds for each answer. Don't rush - take time to think and respond naturally. The goal is to maintain good pitch, resonance, and intonation while your brain is also engaged in forming thoughts.

Record the whole session and listen for any moments where your voice slips.`,
		estimatedMinutes: 5,
		difficulty: 'advanced' as const
	},
	{
		category: 'reading' as const,
		title: 'Tongue Twisters for Clarity',
		description: 'Improve articulation and clarity in your feminine voice.',
		instructions: `Say each tongue twister 3 times, focusing on clear, crisp articulation while maintaining your target pitch:

1. "She sells seashells by the seashore."
2. "Unique New York, Unique New York."
3. "Red leather, yellow leather."
4. "The sixth sheik's sixth sheep's sick."

Start slowly and clearly, then gradually speed up while maintaining clarity. If your pitch drops or you get muddled, slow down again.

Feminine speech often has clearer consonants and more precise articulation. Focus on the tip of your tongue working actively.`,
		estimatedMinutes: 5,
		difficulty: 'intermediate' as const
	}
];

/**
 * Sync the exercise library into the database.
 *
 * Upserts by title rather than bailing when the table is non-empty, so that
 * exercises added in a later version reach installs that were seeded earlier.
 * Matching on title keeps existing documents' _id values stable, which matters
 * because recorded sessions reference exercises by _id.
 *
 * Exercises removed from this file are intentionally left in the database —
 * deleting them would orphan the sessions that point at them.
 */
export async function seedExercises(): Promise<void> {
	const { added, updated } = await upsertExercises(exercises);
	console.log(
		added > 0
			? `Exercise library synced: ${added} added, ${updated} updated`
			: `Exercise library up to date (${exercises.length} exercises)`
	);
}
