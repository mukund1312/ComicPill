// Which picture a comic shows. The reader's own cover for that comic wins, then the catalog's artwork, then a cover taken from the
// reader's own file; with none of those the screen shows a plain placeholder. Pure, so the rule is tested.
export function pickCover<T>(custom: string | undefined, catalogAsset: T | undefined, fileCover: string | undefined): { uri: string } | T | undefined {
  if (custom) return { uri: custom };
  if (catalogAsset !== undefined) return catalogAsset;
  return fileCover ? { uri: fileCover } : undefined;
}
