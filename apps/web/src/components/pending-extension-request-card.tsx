import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDeviceDisplayName } from "@warden/shared";
import { Check, X, Clock } from "lucide-react";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/lib/format-relative-time";

export type PendingExtensionRequest = {
  id: string;
  requestedMinutes: number;
  createdAt: Date | string;
  child: { id: string; displayName: string };
  device: {
    id: string;
    machineName: string | null;
    displayName: string | null;
  };
};

type PendingExtensionRequestCardProps = {
  request: PendingExtensionRequest;
  onApprove: () => void;
  onDeny: () => void;
  busy?: boolean;
};

export function PendingExtensionRequestCard({
  request,
  onApprove,
  onDeny,
  busy = false,
}: PendingExtensionRequestCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 min-w-0">
            <Clock className="w-5 h-5 shrink-0" />
            <span className="truncate">{request.child.displayName}</span>
          </CardTitle>
          <Badge variant="warning">Pending</Badge>
        </div>
        <CardDescription>
          Requesting +{request.requestedMinutes} minutes on{" "}
          {getDeviceDisplayName(request.device)} ·{" "}
          <time
            dateTime={new Date(request.createdAt).toISOString()}
            title={formatAbsoluteTime(request.createdAt)}
          >
            {formatRelativeTime(request.createdAt)}
          </time>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-3">
        <Button
          className="w-full sm:w-auto"
          onClick={onApprove}
          disabled={busy}
        >
          <Check className="w-4 h-4 mr-2" />
          Approve
        </Button>
        <Button
          variant="destructive"
          className="w-full sm:w-auto"
          onClick={onDeny}
          disabled={busy}
        >
          <X className="w-4 h-4 mr-2" />
          Deny
        </Button>
      </CardContent>
    </Card>
  );
}
