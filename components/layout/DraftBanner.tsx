/** Legal pages banner: text is a draft until reviewed. */
export function DraftBanner() {
  return (
    <p role="note" className="rounded-card border border-warn bg-surface-2 p-3 text-sm text-text">
      Borrador: revisa este texto antes de publicar.
    </p>
  );
}
