"use client";

import dynamic from "next/dynamic";

const AppLaunchClient = dynamic(() => import("./AppLaunchClient"), {
  ssr: false,
});

export default function AppLaunchPage() {
  return <AppLaunchClient />;
}
