"use client";

import { useEffect, useState } from "react";

function getCurrentYear() {
  return new Date().getFullYear();
}

export default function CurrentYear() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
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
