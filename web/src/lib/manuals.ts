/** Manual task ids are slugs of the reference, e.g. "TSM 32-42-00-810-923-A" -> "tsm-32-42-00-810-923-a". */
export function manualSlug(ref: string): string {
  return ref.trim().toLowerCase().replace(/\s+/g, "-");
}

export function manualRef(slug: string): string {
  const [doc, ...rest] = slug.split("-");
  return `${doc.toUpperCase()} ${rest.join("-").toUpperCase()}`;
}
