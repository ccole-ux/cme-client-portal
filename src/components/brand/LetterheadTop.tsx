type LetterheadTopProps = {
  className?: string;
};

export function LetterheadTop({ className }: LetterheadTopProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1440 140"
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
      className={className}
    >
      <polygon points="0,0 720,0 260,140 0,140" fill="var(--color-cme-dark-green)" />
      <polygon points="420,0 1120,0 840,140 180,140" fill="var(--color-cme-bright-green)" opacity="0.9" />
      <polygon points="1000,0 1440,0 1440,140 780,140" fill="var(--color-cme-dark-green)" />
    </svg>
  );
}
