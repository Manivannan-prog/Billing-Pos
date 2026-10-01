/**
 * DM Billing Service brand mark.
 *
 * The D and the M share a single vertical stroke at x=13, so the two letters
 * read as one merged monogram rather than two initials sitting side by side.
 */
export function BrandMark({ className = "h-6 w-6", badge = false }) {
  const letters = (
    <g
      fill="none"
      stroke={badge ? "#ffffff" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* D — its bowl closes onto the shared stem */}
      <path d="M6 8h4c3 0 3 12 0 12H6V8" />
      {/* M — rises from that same stem */}
      <path d="M13 20V8l3.5 6L20 8v12" />
    </g>
  );

  return (
    <svg viewBox="0 0 26 28" className={className} aria-hidden="true">
      {badge && <rect x="0" y="0" width="26" height="28" rx="7" fill="currentColor" />}
      {letters}
    </svg>
  );
}

/**
 * Sits at the bottom-right of every page. Kept in the document flow rather
 * than pinned, so it never covers the mobile cart bar or a modal.
 */
export function BrandFooter({ className = "" }) {
  return (
    <div
      className={`print-hidden mt-8 flex items-center justify-end gap-1.5 pb-2 text-text-muted ${className}`}
    >
      <BrandMark className="h-4 w-4 opacity-70" />
      <span className="text-[11px] font-medium tracking-wide">DM Billing Service</span>
    </div>
  );
}

export default BrandMark;
