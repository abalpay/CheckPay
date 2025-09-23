"use client";

import { useEffect } from "react";
import AOS from "aos";
import "aos/dist/aos.css";

import LandingHeader from "./landing-header";
import Footer from "./footer";
import PageIllustration from "./page-illustration";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    AOS.init({
      once: true,
      disable: "phone",
      duration: 700,
      easing: "ease-out-cubic",
    });
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <PageIllustration />
      <LandingHeader />
      <main className="grow">{children}</main>
      <Footer border={true} />
    </div>
  );
}
