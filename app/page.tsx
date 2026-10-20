import type { Metadata } from "next";
import { WhiteboardStudioLoader } from "./whiteboard-studio-loader";

export const metadata: Metadata = {
  title: "Whiteboard Studio",
  description: "An interactive lab for diagrams, text and custom shapes.",
};

export default function Home() {
  return <WhiteboardStudioLoader />;
}
