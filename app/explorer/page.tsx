import { Suspense } from "react";
import Composer from "@/components/Composer";

export const metadata = { title: "Explorateur — Compo LoL" };

export default function ExplorerPage() {
  return (
    <Suspense>
      <Composer />
    </Suspense>
  );
}
