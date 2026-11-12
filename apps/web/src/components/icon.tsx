export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: `${size}px` }}
      className={`material-symbols-outlined select-none leading-none ${className}`}
    >
      {name}
    </span>
  );
}
