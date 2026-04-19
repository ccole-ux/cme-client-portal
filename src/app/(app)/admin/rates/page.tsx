import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Rates — CME Client Portal" };

export default function AdminRatesPage() {
  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-6">
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          CME CONSOLE · RATES
        </p>
        <h1 className="font-display tracking-wider text-cme-dark-green text-3xl mt-1">
          RATES
        </h1>
      </header>
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="font-display tracking-wider">
            COMING IN SESSION 3
          </CardTitle>
          <CardDescription>
            The rate escalation engine and B7 R26-003 seed land in Session 3.
            Date-effective rate rows will be editable from this screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Spec: section 7. Rates escalate 3% on January 1 each year after the
          project baseline year.
        </CardContent>
      </Card>
    </div>
  );
}
