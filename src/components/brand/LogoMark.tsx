type LogoMarkProps = {
  className?: string;
  size?: number;
};

export function LogoMark({ className, size = 96 }: LogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="CME — Cole Management & Engineering"
      className={className}
    >
      <polygon points="60,12 108,96 12,96" fill="var(--color-cme-dark-green)" />
      <polygon points="60,34 88,84 32,84" fill="var(--color-cme-bright-green)" />
    </svg>
  );
}
