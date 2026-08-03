import { handleCreateWish } from "@/http/handlers";
import { deps } from "@/runtime";

export async function POST(request: Request) {
  return handleCreateWish(request, deps());
}
