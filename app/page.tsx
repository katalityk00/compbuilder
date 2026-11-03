import { Suspense } from "react";
import TeamBuilder from "@/components/TeamBuilder";

export default function Home() {
  return (
    <Suspense>
      <TeamBuilder />
    </Suspense>
  );
}
