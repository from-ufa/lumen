/** Brand wordmark — equal letter height (capital L matched to the rest). */
export default function LumenWordmark({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center leading-none ${className}`}
      aria-label="Lumen"
    >
      {/* Scale L to x-height of “umen” so the word reads as one optical height */}
      <span
        className="inline-block font-[inherit] font-semibold leading-none"
        style={{
          fontSize: "0.76em",
          lineHeight: 1,
          transform: "translateY(0.05em)",
        }}
      >
        L
      </span>
      <span className="font-[inherit] font-semibold leading-none">umen</span>
    </span>
  );
}
