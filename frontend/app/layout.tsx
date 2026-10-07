import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/martian-mono';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Project Management & AI Workspace',
  description: 'High-speed keyboard-first project management system with LangGraph agentic runtime',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="h-full antialiased dark font-sans"
    >
      <body className="min-h-full flex flex-col bg-[#08090a] text-[#f7f8f8] font-sans antialiased">
        {children}
        <Toaster position="bottom-right" richColors={false} closeButton />
      </body>
    </html>
  );
}

