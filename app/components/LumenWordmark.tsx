/**
 * Brand wordmark — capital L optically matched to the x-height of “umen”.
 * Single-line; parent keeps two-line header (title + subtitle) structure.
 */
export default function LumenWordmark({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`lumen-wordmark ${className}`.trim()}
      aria-label="Lumen"
    >
      <span className="lumen-wordmark__l" aria-hidden="true">
        L
      </span>
      <span className="lumen-wordmark__rest" aria-hidden="true">
        umen
      </span>
    </span>
  );
}
