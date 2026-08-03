import { handleEndorse } from "@/http/handlers";
import { deps } from "@/runtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleEndorse(request, deps(), id);
}
