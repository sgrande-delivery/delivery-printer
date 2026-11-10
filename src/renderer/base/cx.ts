/** Joins class names, dropping falsy ones. Avoids a dependency for this. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
