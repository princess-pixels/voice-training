/**
 * The exercise library's descriptions and instructions in other languages,
 * keyed by English title (the exercise's identity; see $lib/exerciseText).
 * Laid over the stored English when a page loads, never written back, so
 * export, import and seeding keep working on the English library.
 *
 * Spoken material is written for the language, not translated: the
 * nasal-free passage has no nasals in Norwegian, the tongue twisters are
 * Norwegian ones, and the intonation work respects Norwegian tonal accents.
 */
import type { Exercise } from '$lib/types';
import { exerciseTitle } from '$lib/exerciseText';
import { getLocale, type Locale } from '$lib/paraglide/runtime';

interface ExerciseText {
	description: string;
	instructions: string;
}

/** The passage in the nasal-free exercise; exported so a test can prove it has no m, n or ng. */
export const NB_NASAL_FREE_PASSAGE =
	'Det var tidlig, og tåka lå tett over elva. Jeg sto på brygga, kald og trøtt, og hørte bare fugler et sted bortover. Det luktet vått gress og vedrøyk, og alt var stille. Så tok jeg på jakka og gikk sakte tilbake opp lia til huset vårt.';

export const EXERCISE_CONTENT: Partial<Record<Locale, Record<string, ExerciseText>>> = {
	nb: {
		'Lip Trills / Buzzing': {
			description: 'Rolig oppvarming som løsner opp stemmebåndene og gir god pustestøtte.',
			instructions: `Begynn med å slappe av i leppene og ansiktet. Trekk pusten dypt, og blås luft gjennom leppene så det blir en «brrr»-lyd (som en hest). Mens du gjør det, glir du rolig opp og ned i tonehøyde, som en sirene.

Hold på i 30 sekunder til ett minutt. Leppetrillen reduserer spenningen i stemmen og gir helt naturlig god pustestøtte. Prøv å holde lyden jevn og sammenhengende, uten brudd.`
		},
		'Humming Scales': {
			description: 'Lett nynning som varmer opp stemmen og lar deg kjenne resonansen i ansiktet.',
			instructions: `Lukk leppene lett og nynn på en tone som er behagelig. Kjenn vibrasjonen i leppene, nesen og ansiktet.

Nynn så sakte opp og ned en skala på fem toner (do-re-mi-fa-so-fa-mi-re-do). Hold nynningen lett og summende. Kjenn etter vibrasjoner i «masken» (lepper, nese, kinnben).

Gjenta fem ganger, og strekk deg litt høyere hver gang så lenge det fortsatt er behagelig.`
		},
		'Jaw and Tongue Stretches': {
			description: 'Fysisk tøying som løser opp spenninger i kjeven og tungen.',
			instructions: `Kjeven: Åpne munnen så vidt det er behagelig, hold i fem sekunder og slipp. Gjenta fem ganger. Beveg så kjeven i sirkler (fem ganger hver vei) for å løsne opp leddet.

Tungen: Rekk tungen så langt ut du kan, som om du prøver å nå haka, og hold i fem sekunder. Prøv så å nå nesen med tungespissen. Til slutt rekker du tungen ut og beveger den fra side til side ti ganger.

Tøyingen reduserer muskelspenninger som kan påvirke stemmekvaliteten.`
		},
		'Breath Support Exercise': {
			description: 'Øv opp mellomgulvspusten som gir deg kontroll over stemmen over tid.',
			instructions: `Legg den ene hånden på magen og den andre på brystet. Pust dypt inn gjennom nesen, og la magen utvide seg (ikke brystet). Hånden på magen skal bevege seg utover, mens hånden på brystet ligger stille.

Pust sakte ut gjennom spisse lepper med en «sss»-lyd. Prøv å holde en jevn, kraftig susing så lenge du kan. Tell sekundene.

Mål: Jobb deg opp til 20–30 sekunder med jevn susing. Gjenta fem ganger. Dette bygger pustestøtten du trenger for å holde ut med en feminin stemme.`
		},
		'Straw Phonation — Basic Hum': {
			description: 'Grunnlaget for sugerørsarbeid: en lett, lang nynning gjennom et smalt sugerør.',
			instructions: `Du trenger et vanlig sugerør (et smalt et — jo tynnere sugerør, jo mer motstand).

Sett sugerøret mellom leppene og lukk leppene tett rundt det. Tungen ligger nede og avslappet, kjeven er løs. All luften skal gå gjennom sugerøret — ingenting gjennom nesen, og ingenting som lekker ut rundt leppene.

Nynn så en behagelig, lett tone gjennom sugerøret i omtrent fem sekunder. Det skal kjennes nesten uanstrengt ut — du er ute etter en lett summende følelse i leppene og ansiktet, ikke volum. Kjennes det anstrengt, eller presser du, gjør du for mye: trekk deg tilbake til det er lett.

Hvil, og gjenta ti ganger.

Hvorfor dette virker: sugerøret gir mottrykk over stemmebåndene, så de vibrerer mer effektivt og slår mindre hardt mot hverandre. Dette er den tryggeste måten å jobbe med stemmen på — gjør du det rolig, kan du rett og slett ikke overbelaste deg.`
		},
		'Straw Pitch Glides': {
			description: 'Sirener gjennom sugerøret — utvid omfanget uten noen belastning.',
			instructions: `Gjør klar som i den enkle nynningen: sugerøret tett mellom leppene, tungen nede, kjeven avslappet.

Gli sakte fra den laveste behagelige tonen din opp til den høyeste og ned igjen, som en sirene, hele tiden gjennom sugerøret. Hold det jevnt — ingen hopp eller brudd.

Fordi sugerøret tar bort anstrengelsen, merker du ofte at du kommer høyere gjennom sugerøret enn med åpen munn. Det er hele poenget: slik utvider du omfanget på en trygg måte.

Gjør ti glid, og hvil mellom hvert. Brekker stemmen eller slår over på vei opp, er det helt normalt — bare fortsett å gli gjennom det. Det jevner seg ut med øving.`
		},
		'Straw-to-Voice Transfer': {
			description:
				'Nøkkeløvelsen — ta med den lette, fremre følelsen fra sugerøret over i vanlig tale.',
			instructions: `Det er denne øvelsen som gjør at sugerørsarbeidet faktisk endrer talestemmen din.

1. Nynn en behagelig tone gjennom sugerøret i fem sekunder. Legg godt merke til hvor du kjenner vibrasjonen — den skal sitte langt frem, i leppene og fremst i ansiktet.

2. Hold på akkurat den følelsen, ta ut sugerøret og nynn straks den samme tonen med lukkede lepper. Prøv å holde vibrasjonen på samme sted.

3. Åpne nå til en «i»- eller «o»-vokal på samme tone, og jakt fortsatt på den fremre summingen.

4. Til slutt sier du en kort frase — «hei, hvordan har du det?» — og prøver å holde den samme plasseringen.

Gjenta hele rekken på fire steg åtte ganger. Målet er ikke sugerøret i seg selv, men følelsen sugerøret lærer deg. Du lærer hvordan «lett og langt frem» kjennes, så du kan finne det igjen uten sugerør.`
		},
		'Straw in Water — Bubble Phonation': {
			description: 'Sugerørsarbeid med ekstra motstand og synlig tilbakemelding fra boblene.',
			instructions: `Fyll et glass med vann. Sett sugerøret ned så tuppen er omtrent 2–5 cm under overflaten (dypere gir mer motstand; begynn grunt).

Nynn gjennom sugerøret så det bobler i vannet. Sikt mot en jevn, rolig strøm av bobler — det er tilbakemeldingen din. Ujevne eller hakkete bobler betyr at luftstrømmen ikke er stabil.

Hold i fem sekunder, hvil, og gjenta ti ganger. Prøv så rolige glid i tonehøyde mens det bobler.

Dette gir mer mottrykk enn et tørt sugerør og gir stemmebåndene en lett massasje. Det er deilig å gjøre når stemmen kjennes sliten eller rusten etter en lang økt — eller som nedtrapping til slutt.

Hold det rolig. Du skal aldri kjenne at du presser luften.`
		},
		'Pitch Glides': {
			description: 'Gli jevnt fra det lave registeret ditt opp i det feminine tonehøydeområdet.',
			instructions: `Begynn på en behagelig lav tone og gli sakte oppover som en sirene, så høyt du kommer uten å anstrenge deg. Hold toppen kort, og gli ned igjen.

Bruk lyder som «ng» (som i «synge») eller «mm» for å holde resonansen langt frem. Konsentrer deg om at glidet er jevnt — ingen trinn eller hopp.

Mål: Jobb mot å nå 180–220 Hz komfortabelt hver gang. Gjør ti glid, og hvil mellom hvert.`
		},
		'Sustain Target Pitch': {
			description: 'Hold en stø tone i det feminine området for å bygge muskelhukommelse.',
			instructions: `Åpne referansetonene under tonehøydegrafen, og trykk på en tone nederst i målområdet ditt (rundt 180–200 Hz hvis du er ny). Treff den med nynning eller en «o»-lyd; visningen sier hvor langt unna du er, og streken i grafen viser hvor tonen ligger.

Hold tonen stø i ti sekunder, og konsentrer deg om at den ikke vakler. Hold kurven din på streken.

Hvil, og gjenta. Prøv å holde 200 Hz, og jobb deg gradvis opp mot 220 Hz over tid. Gjør ti repetisjoner, og hvil mellom hver.`
		},
		'Pitch Matching': {
			description: 'Tren øret og stemmen til å finne og holde bestemte toner.',
			instructions: `Bruk referansetonene under tonehøydegrafen. Trykk på en tone i målområdet ditt (de som lyser), og syng eller nynn den samme tonen med en gang.

Hold i fem sekunder og følg med på visningen: den sier «Midt i blinken» innenfor 10 cent, ellers hvor mye for høy eller for lav du ligger. Juster og prøv igjen ved behov.

Øv med fem ulike toner spredt over målområdet. Det gjør deg mer treffsikker og lærer deg hvordan ulike frekvenser kjennes i stemmen din.`
		},
		'Staircase Pitch Steps': {
			description: 'Gå opp i tonehøyde i små trinn for å utvide omfanget.',
			instructions: `Begynn på 180 Hz og syng eller nynn en tone i tre sekunder. Gå så opp 10 Hz til 190 Hz og hold i tre sekunder. Fortsett oppover: 200 Hz, 210 Hz, 220 Hz.

Når du er på toppen, går du ned igjen på samme måte.

Bruk vokalene «i» eller «o». Konsentrer deg om at klangen holder seg lik når du går høyere — ikke la stemmen bli luftig eller anstrengt. Kjennes et trinn for høyt, stopper du og øver på det nivået til det er behagelig før du går videre.`
		},
		'Bright Resonance - "ee" Vowel': {
			description: 'Flytt resonansen frem for en lysere, mer feminin klang.',
			instructions: `Syng «i» (som i «vi») på en behagelig tone rundt 200 Hz. Kjenn etter vibrasjonen i leppene, tennene og fremst i ansiktet («masken»).

«i» drar helt naturlig resonansen fremover. Ikke la lyden falle bakover i halsen — hold den lett og summende fremme.

Hold i fem sekunder, hvil, og gjenta ti ganger. Prøv å få hver repetisjon til å låte lys og klar, ikke mørk eller dempet.`
		},
		'Larynx Elevation Awareness': {
			description: 'Lær å kjenne og styre hvor strupehodet ligger.',
			instructions: `Legg en finger lett på kulen på strupehodet (skjoldbrusken, foran på halsen). Svelg — kjenner du at strupehodet løfter seg? Det er den bevegelsen vi er ute etter.

Prøv nå å holde stillingen fra «starten av en svelging» uten å svelge. Pust vanlig mens strupehodet holdes litt hevet. Det åpner taleapparatet for en lysere resonans.

Øv på å holde stillingen i ti sekunder av gangen. Ikke press — det skal kjennes behagelig. Når du klarer å holde den, prøver du å nynne eller lage «mm»-lyder mens du holder strupehodet hevet.`
		},
		'Big Dog, Small Dog': {
			description: 'Veksle mellom mørk og lys resonans for å kjenne forskjellen.',
			instructions: `Si «voff voff» som en stor hund — dypt, rumlende og fra brystet. Kjenn resonansen i brystet og halsen. Dette er «mørk» resonans.

Si så «vipp vipp» som en liten hund — høyt, lyst og skarpt. Kjenn resonansen i munnen og nesen. Dette er «lys» resonans.

Veksle mellom de to, og overdriv forskjellen skikkelig. Den lille hunden ligger nærmest resonansen vi sikter mot. Øv ti runder med stor hund / liten hund.`
		},
		'Whisper to Voice Transition': {
			description: 'Finn resonansen langt frem ved å begynne med hvisking.',
			instructions: `Begynn med å hviske «hei» eller «hvordan har du det?» — kjenn hvordan hviskingen helt naturlig legger lyden langt frem i munnen og ansiktet.

Legg så gradvis stemme til hviskingen, så den blir en myk, litt luftig talestemme, mens du holder på den fremre plasseringen.

Konsentrer deg om å holde på den «fremre» følelsen mens du øker volumet. Hviskingen hjelper deg å finne riktig plassering av resonansen uten at tonehøyden kommer i veien. Øv med ti fraser, fra hvisking til myk stemme.`
		},
		'Nose Pinch Test — Finding Nasal Leak': {
			description: 'Finn ut om lyden slipper ut gjennom nesen når den ikke skal.',
			instructions: `På norsk er det bare tre lyder som skal være nasale: /m/, /n/ og ng-lyden (som i «synge»). Alt annet skal komme ut gjennom munnen. Lekker lyden ut gjennom nesen på andre lyder, får stemmen en tynn, sutrete klang — og det er veldig lett å gjøre uten å merke det når du strekker deg etter en høyere tone.

Testen:

1. Hold en «aaa» i fem sekunder.
2. Mens du fortsatt lager lyden, klyper du igjen neseborene med fingrene, slipper, og klyper igjen.
3. Lytt nøye. Endret lyden seg?

Er lyden lik når du klyper — perfekt, da har du munnresonans.
Endrer lyden seg, blir dempet eller summer mot fingrene — da slipper lyden ut gjennom nesen.

Test så disse, og klyp og slipp midt i hver:
- «iiii»
- «papa papa papa»
- «pappa pusset pipa»

Ingen av dem har nasale konsonanter, så ingen skal endre seg når du klyper. Merk deg hvilke som gjør det — det er de lydene du skal jobbe med.

Sammenlign med «mmmm» — den *skal* endre seg tydelig når du klyper, fordi den skal være nasal. Den er referansen din for hvordan nasal klang kjennes.`
		},
		'Nasal to Oral Redirection — /m/ into /b/': {
			description: 'Bruk en nasal lyd som startrampe, og send så luftstrømmen ut gjennom munnen.',
			instructions: `Denne øvelsen lærer den myke ganen å lukke, og det er den som sender lyden ut gjennom munnen i stedet for nesen.

1. Nynn «mmmm» og kjenn summingen i nesen. Legg en finger lett på siden av nesen — du skal kjenne at den vibrerer. Dette er nasalt.

2. Si nå «mmmm-baaa». Når du går fra /m/ over i /b/, skal vibrasjonen i nesen stoppe, og lyden flytte seg frem i munnen. Hold fingeren på nesen for å sjekke.

3. Gjenta med «mmmm-bii», «mmmm-buu» og «mmmm-bee».

Selve overgangen er det du lærer — det er den myke ganen som løfter seg og stenger av mot nesen. Gjør ti av hver.

Når det sitter, dropper du /m/ og sier bare «ba», «bi», «bu», «be» med en finger på nesen. Ingen vibrasjon skal nå fingeren.`
		},
		'Oral Resonance Reading — Nasal-Free Passage': {
			description: 'Høytlesing over tid med en tekst helt uten nasale konsonanter.',
			instructions: `Denne teksten har med vilje ingen /m/, /n/ eller ng-lyder. Kjenner du *noe* nasal summing mens du leser den, går lyden dit den ikke skal.

Les den høyt og sakte, med en finger lett mot siden av nesen:

«${NB_NASAL_FREE_PASSAGE}»

Fingeren skal ikke kjenne noe som helst. Kjenner du summing, senker du tempoet og finner ordet som gjorde det.

Les den tre ganger: først sakte og nøye, så i vanlig tempo, og en siste gang på måltonehøyden din med resonansen langt frem. Det vanskelige er å holde den ren på måltonehøyden — en høyere tone drar gjerne lyden opp i nesen, så det er akkurat her jobben ligger.`
		},
		'Question Intonation Patterns': {
			description: 'Øv på stigende tonehøyde på slutten av setninger, typisk for feminin tale.',
			instructions: `Les disse påstandene som spørsmål, med stigning på slutten:
- «Du blir med oss?»
- «Du liker dette?»
- «Vi skal gå nå?»

Konsentrer deg om å la tonehøyden stige på de to–tre siste ordene. Ikke overdriv — en liten stigning høres naturlig ut, mens en overdreven stigning lett blir karikatur.

Behold tonelagene i ordene (forskjellen på «bønder» og «bønner»): stigningen legger seg oppå dem, den erstatter dem ikke.

Ta opp deg selv og lytt etterpå. Stigningen bør være omtrent 10–20 Hz høyere på slutten. Øv med ti ulike spørsmål.`
		},
		'Expressive Sentence Practice': {
			description: 'Gi talen din mer variasjon og musikalitet.',
			instructions: `Les denne setningen med ulike følelser, og legg merke til hvordan tonehøyden og tonefallet endrer seg:
«Jeg kan ikke tro at du gjorde det.»

Prøv: glad, overrasket, skuffet, leken, sarkastisk

Feminin tale har gjerne mer variasjon i tonehøyde og mer uttrykk. Øv på å overdrive opp- og nedturene litt (uten at det blir syngete). Ta opp deg selv og sikt mot minst 20 Hz variasjon i én og samme setning.`
		},
		'Melodic Speech Patterns': {
			description: 'Utvikle en flytende, musikalsk tale i stedet for monoton opplesning.',
			instructions: `Les denne teksten og konsentrer deg om å få den til å låte melodisk og flytende:

«Sola gikk ned bak fjellene og malte himmelen i sterke farger av oransje og rosa. Fuglene sang kveldssangene sine mens en lett bris suste gjennom trærne.»

Unngå å lese med flat, monoton stemme. La tonehøyden stige og synke naturlig med innholdet — opp for ny informasjon, ned når noe avsluttes. Tenk at du forteller en historie til en venn, ikke at du leser opp en handleliste. Tonelagene i ordene er en del av melodien i norsk; la dem være med.

Ta opp deg selv og lytt. Det skal være tydelig bevegelse i tonehøyden hele veien. Øv tre ganger.`
		},
		'Short Passage Reading': {
			description: 'Øv på å holde den feminine stemmen gjennom en lengre tekst.',
			instructions: `Les denne teksten høyt, og hold måltonehøyden (180–220 Hz), resonansen langt frem og et levende tonefall hele veien:

«Den gamle bokhandelen på hjørnet hadde alltid vært favorittstedet mitt i byen. Innehaveren, fru Paulsen, visste nøyaktig hvilke bøker jeg ville like før jeg rakk å spørre. Hver lørdag formiddag ble jeg gående i timevis mellom de støvete hyllene og fant historier som ble sittende i meg i ukevis. Lukten av gammelt papir og den stille knirkingen i tregulvet fikk det til å føles som et andre hjem.»

Konsentrer deg om å være stø — ikke la tonehøyden falle eller resonansen gli bakover når innholdet tar oppmerksomheten. Sjekk at gjennomsnittet holder seg i målområdet. Ta opp og lytt gjennom.`
		},
		'Conversational Practice Prompts': {
			description: 'Øv på naturlig samtale ved å svare deg selv.',
			instructions: `Still deg selv disse spørsmålene høyt, og svar med hele setninger mens du holder på den feminine stemmen hele veien:

1. «Hva gjorde du i helgen?»
2. «Hvordan synes du det går med stemmen?»
3. «Hva er favorittfilmen din, og hvorfor?»
4. «Beskriv drømmeferien din.»

Snakk i minst 30 sekunder på hvert svar. Ikke stress — ta deg tid til å tenke og svare naturlig. Målet er å holde god tonehøyde, resonans og intonasjon mens hjernen samtidig er opptatt med å formulere tanker.

Ta opp hele økten, og lytt etter øyeblikk der stemmen sklir.`
		},
		'Tongue Twisters for Clarity': {
			description: 'Gjør uttalen klarere og tydeligere med den feminine stemmen.',
			instructions: `Si hver tungekrøller tre ganger, med klar og presis uttale, mens du holder måltonehøyden:

1. «Sju sjøsyke sjømenn skjøt seks sjøsyke skjærer.»
2. «Bare barn bader bare.»
3. «Rødt lær, gult lær.»
4. «Kari kokte kaffe på kjøkkenet.»

Begynn sakte og tydelig, og øk tempoet gradvis mens du holder uttalen klar. Faller tonehøyden, eller begynner du å snuble, senker du tempoet igjen.

Feminin tale har ofte klarere konsonanter og mer presis artikulasjon. Konsentrer deg om at tungespissen jobber aktivt.`
		}
	}
};

/** The exercise with its title, description and instructions in the current language. */
export function localizeExercise<
	T extends Pick<Exercise, 'title' | 'description' | 'instructions'>
>(exercise: T, locale: Locale = getLocale()): T {
	const text = EXERCISE_CONTENT[locale]?.[exercise.title];
	return {
		...exercise,
		title: exerciseTitle(exercise.title, locale),
		...(text ?? {})
	};
}
