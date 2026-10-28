import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({ File: class {} }));
vi.mock('./client', () => ({ authHeaders: async () => ({}) }));
vi.mock('./servers', () => ({ listServers: () => [] }));

import { isOpdsSource, opdsSourceFor, parseOpdsSource } from './source';

describe('where a comic on a comic server is remembered', () => {
  it('keeps the address on the server without the host, so a new server address needs no re-adding', () => {
    const source = opdsSourceFor('s1', 'http://192.168.1.5:25600/komga/api/v1/opds/v1.2/catalog', 'http://192.168.1.5:25600/komga/api/v1/books/abc/file');
    expect(source).toBe('opds:s1|/komga/api/v1/books/abc/file');
    expect(parseOpdsSource(source)).toEqual({ serverId: 's1', path: '/komga/api/v1/books/abc/file' });
  });
  it('keeps a full address when the file lives on another host', () => {
    const source = opdsSourceFor('s1', 'http://nas.local:8080/opds', 'https://files.example.com/x.cbz');
    expect(parseOpdsSource(source).path).toBe('https://files.example.com/x.cbz');
  });
  it('tells these comics from cloud-app links', () => {
    expect(isOpdsSource('opds:s1|/a')).toBe(true);
    expect(isOpdsSource('bookmark:abc|x')).toBe(false);
    expect(isOpdsSource(null)).toBe(false);
  });
});
