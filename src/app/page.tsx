import { LetterheadTop } from "@/components/brand/LetterheadTop";
import { LetterheadBottom } from "@/components/brand/LetterheadBottom";
import { LogoMark } from "@/components/brand/LogoMark";

export default function LandingPage() {
  return (
    <>
      <LetterheadTop className="w-full h-24 md:h-32" />

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="flex flex-col items-center gap-8 text-center max-w-3xl">
          <LogoMark size={128} />
          <h1 className="font-display text-cme-dark-green tracking-wider text-5xl md:text-6xl">
            CME CLIENT PORTAL
          </h1>
          <p className="font-display text-cme-bright-green tracking-[0.25em] text-sm md:text-base uppercase">
            Project Management · Engineering · Client Collaboration
          </p>
          <p className="text-cme-black/70 max-w-md">
            Coming soon — check back with your invitation link.
          </p>
        </div>
      </main>

      <LetterheadBottom className="w-full h-24 md:h-32" />
    </>
  );
}
