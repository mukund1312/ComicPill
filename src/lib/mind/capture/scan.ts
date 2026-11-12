// Album watching was removed so the app asks for no gallery permission (pictures come from the system photo picker and the camera).
// These stay as inert stand-ins so the Mind Space screens keep compiling and old settings are harmless.
import type { MindStore } from '../store';

export type Access = 'granted' | 'limited' | 'denied';

export async function galleryAccess(): Promise<Access> { return 'denied'; }
export async function requestGalleryAccess(): Promise<Access> { return 'denied'; }
export async function listAlbumTitles(): Promise<string[]> { return []; }
export async function scanNewScreenshots(_store: MindStore, _since?: number): Promise<number> { return 0; }
