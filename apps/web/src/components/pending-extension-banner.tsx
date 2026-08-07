import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PendingExtensionBannerProps = {
  count: number;
  href?: string;
};

export function PendingExtensionBanner({
  count,
  href = "/dashboard/activity",
}: PendingExtensionBannerProps) {
  if (count <= 0) return null;

  return (
    <Card className="border-yellow-500/50 bg-yellow-500/5">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              {count} extension request{count === 1 ? "" : "s"} waiting
            </p>
            <p className="text-sm text-muted-foreground">
              Review and approve or deny extra screen time
            </p>
          </div>
        </div>
        <Link href={href} className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto" variant="outline">
            Review requests
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
