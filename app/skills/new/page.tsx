import { listWishes } from "@/app/use-cases";
import { deps } from "@/runtime";
import SubmitPackageForm from "./form";

export const dynamic = "force-dynamic";

export default async function NewPackagePage() {
  let wishes: { id: string; title: string }[] = [];
  let wishesUnavailable = false;
  try {
    // 已交付的许愿不再需要人做，别摆进来让作者误选。
    wishes = (await listWishes(deps()))
      .filter((wish) => wish.status !== "已交付")
      .map((wish) => ({ id: wish.id, title: wish.title }));
  } catch (error) {
    wishesUnavailable = true;
    console.error("failed to load wishes for package submission", { error });
  }

  return <SubmitPackageForm wishes={wishes} wishesUnavailable={wishesUnavailable} />;
}
