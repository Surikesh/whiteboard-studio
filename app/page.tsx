import type { Metadata } from "next";
import { TldrawLabLoader } from "./tldraw-lab-loader";

export const metadata: Metadata = {
  title: "Tldraw Lab",
  description: "An interactive lab for diagrams, text and custom shapes.",
};

export default function Home() {
  return <TldrawLabLoader />;
}
