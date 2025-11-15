import { Suspense } from "react";
import IceBreakerClient from "./IceBreakerClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8">Loading icebreaker…</div>}>
      <IceBreakerClient />
    </Suspense>
  );
}
