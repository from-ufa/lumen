/** Brand name: always lowercase «lumen». */
export default function LumenWordmark({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`font-semibold leading-none tracking-[-0.035em] ${className}`.trim()}
      aria-label="lumen"
    >
      lumen
    </span>
  );
}
