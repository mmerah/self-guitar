import { endpoint } from '$lib/server/endpoint';

export const { GET, PUT } = endpoint('/api/songs/[id]/progress');
