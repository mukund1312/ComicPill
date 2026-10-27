// Identity of a source file for spotting duplicates: same name (any letter case) and exact same size.
export const sourceKeyOf = (name: string, size: number): string => `${name.toLowerCase()}|${size}`;
