import type { RequestHandler } from './$types';
import { getSessionAudio } from '$lib/server/db';
import { isAudioType, openAudio } from '$lib/server/audio';
import { parseRange } from '$lib/server/range';
import { error } from '@sveltejs/kit';

/**
 * Stream a session's recording, honouring Range requests so the <audio>
 * scrubber works. Without 206 support the element can play but cannot seek.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	const session = await getSessionAudio(params.id);
	if (!session) {
		error(404, { message: 'Session not found' });
	}

	const audio = await openAudio(session.audioKey);
	if (!audio) {
		error(404, { message: 'No audio file for this session' });
	}

	// Older sessions predate the stored type, and a stored type is only trusted
	// if it is an audio type: the key's extension is the fallback either way.
	const contentType = isAudioType(session.audioType) ? session.audioType : audio.type;
	const headers: Record<string, string> = {
		'Content-Type': contentType,
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'private, max-age=3600'
	};

	const range = parseRange(request.headers.get('range'), audio.size);

	if (range.kind === 'unsatisfiable') {
		return new Response(null, {
			status: 416,
			headers: { ...headers, 'Content-Range': `bytes */${audio.size}` }
		});
	}

	if (range.kind === 'partial') {
		const { start, end } = range.range;
		headers['Content-Range'] = `bytes ${start}-${end}/${audio.size}`;
		headers['Content-Length'] = String(end - start + 1);
		return new Response(audio.stream(start, end), { status: 206, headers });
	}

	headers['Content-Length'] = String(audio.size);
	return new Response(audio.stream(), { status: 200, headers });
};
