"use client";

import { useEffect, useState } from "react";

/** Avoid SSR/client HTML drift for wallet-dependent UI. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
