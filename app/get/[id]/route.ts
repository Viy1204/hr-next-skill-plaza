import { handleTake } from "@/http/handlers";
import { deps } from "@/runtime";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleTake(request, deps(), id);
}
