import { listWishes } from "@/app/use-cases";
import { deps } from "@/runtime";
import SubmitPackageForm from "./form";

export const dynamic = "force-dynamic";

export default async function NewPackagePage() {
  // 已交付的许愿不再需要人做，别摆进来让作者误选。
  const wishes = (await listWishes(deps())).filter((wish) => wish.status !== "已交付");

  return <SubmitPackageForm wishes={wishes.map((wish) => ({ id: wish.id, title: wish.title }))} />;
}
