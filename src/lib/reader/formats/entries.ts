import { naturalCompare } from './naturalSort';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'avif', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'jxl'] as const;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Page images in an archive: images only, junk skipped, natural order, full path compared. */
export function selectImageEntries(names: string[]): string[] {
  return names
    .filter((name) => {
      if (name.endsWith('/')) return false;
      const parts = name.split('/');
      if (parts.some((p) => p === '__MACOSX' || p.startsWith('.'))) return false;
      return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
    })
    .sort(naturalCompare);
}
