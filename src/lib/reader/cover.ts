// Shelf covers are small thumbnails, not the full first page: a page is 1.5 MB or more, a thumbnail about 40 KB. For a library of
// thousands of comics that is the difference between a gigabyte and tens of gigabytes.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { File, type Directory } from 'expo-file-system';

export const COVER_WIDTH = 480;

/** Save a thumbnail of `pageUri` into `dir` and return its address. If the image can't be resized, the page itself is copied instead. */
export async function saveCover(pageUri: string, dir: Directory): Promise<string> {
  try {
    const small = await (await ImageManipulator.manipulate(pageUri).resize({ width: COVER_WIDTH }).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
    const target = new File(dir, 'cover.jpg');
    if (target.exists) target.delete();
    await new File(small.uri).move(target);
    return target.uri;
  } catch {
    const page = new File(pageUri);
    const copy = new File(dir, `cover.${page.extension.replace('.', '') || 'jpg'}`);
    if (copy.exists) copy.delete();
    await page.copy(copy);
    return copy.uri;
  }
}
