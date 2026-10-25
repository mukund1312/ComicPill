export class ComicOpenError extends Error {
  constructor(message: string, readonly code?: 'no-pages') { super(message); }
}
