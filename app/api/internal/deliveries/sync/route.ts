import { handleSyncDeliveries } from "@/http/handlers";
import { deps, syncSecret } from "@/runtime";

// Delivery happens in the Bitable (an operator links a package to a wish), so no
// request path can notice it. Hit this after linking to flip the wish status and
// send the one group message. Idempotent.
export async function POST(request: Request) {
  return handleSyncDeliveries(request, deps(), syncSecret());
}
