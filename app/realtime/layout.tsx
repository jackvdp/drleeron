import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dr Leeron | RANZCP MEQ Voice Tutor",
  description: "AI-powered voice tutor for RANZCP MEQ exam preparation using Socratic questioning methodology",
};

export default function RealtimeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
