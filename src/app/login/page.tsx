import { LetterheadTop } from "@/components/brand/LetterheadTop";
import { LetterheadBottom } from "@/components/brand/LetterheadBottom";
import { LogoMark } from "@/components/brand/LogoMark";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in — CME Client Portal",
};

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next, error } = await searchParams;

  return (
    <>
      <LetterheadTop className="w-full h-20 md:h-28" />
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          <LogoMark size={96} />
          <div className="text-center">
            <h1 className="font-display text-cme-dark-green tracking-wider text-3xl md:text-4xl">
              CME CLIENT PORTAL
            </h1>
            <p className="mt-2 text-sm text-cme-black/60">
              Sign in with your invited email to continue.
            </p>
          </div>
          <LoginForm next={next} initialError={error} />
        </div>
      </main>
      <LetterheadBottom className="w-full h-20 md:h-28" />
    </>
  );
}
