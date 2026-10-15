"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/state/AppStateProvider";

export default function Home() {
  const router = useRouter();
  const { state } = useApp();
  useEffect(() => {
    router.replace(state.roadmaps[0] ? `/roadmaps/${state.roadmaps[0].id}` : "/roadmaps");
  }, [router, state.roadmaps]);
  return null;
}
