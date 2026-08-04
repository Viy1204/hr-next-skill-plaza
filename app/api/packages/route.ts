import { handleSubmitPackage } from "@/http/handlers";
import { deps } from "@/runtime";

export async function POST(request: Request) {
  return handleSubmitPackage(request, deps());
}
