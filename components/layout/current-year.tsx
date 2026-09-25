"use client";

import { useEffect, useState } from "react";

function getCurrentYear() {
  return new Date().getFullYear();
}

export default function CurrentYear() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only value, set after mount on purpose to avoid a server/client hydration mismatch
    setYear(getCurrentYear());

    const intervalId = window.setInterval(() => {
      setYear(getCurrentYear());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  if (year === null) {
    return null;
  }

  return <>{year}</>;
}
