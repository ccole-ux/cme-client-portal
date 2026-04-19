type LetterheadBottomProps = {
  className?: string;
};

export function LetterheadBottom({ className }: LetterheadBottomProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1440 140"
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
      className={className}
    >
      <polygon points="0,0 260,0 720,140 0,140" fill="var(--color-cme-dark-green)" />
      <polygon points="180,0 840,0 1120,140 420,140" fill="var(--color-cme-bright-green)" opacity="0.9" />
      <polygon points="780,0 1440,0 1440,140 1000,140" fill="var(--color-cme-dark-green)" />
    </svg>
  );
}
