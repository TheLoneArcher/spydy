import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'ResponSys — Civic Issue Reporting',
  description: 'AI-powered civic infrastructure issue reporting and coordination platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-[#0A0E17]">
      <body className={`${inter.variable} font-sans bg-[#0A0E17] text-[#F1F5F9] min-h-screen flex flex-col w-full overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}
