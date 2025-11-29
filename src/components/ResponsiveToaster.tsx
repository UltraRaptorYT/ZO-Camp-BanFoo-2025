"use client";

import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";

type Position =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export function ResponsiveToaster() {
  const [position, setPosition] = useState<Position>("top-center");

  useEffect(() => {
    // Change the breakpoint however you like (e.g. 1024 for lg)
    const mq = window.matchMedia("(min-width: 1024px)");

    const updatePosition = () => {
      setPosition(mq.matches ? "bottom-right" : "top-center");
    };

    updatePosition(); // set on first load
    mq.addEventListener("change", updatePosition);

    return () => mq.removeEventListener("change", updatePosition);
  }, []);

  return <Toaster richColors position={position} />;
}
