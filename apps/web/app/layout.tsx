import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Influencer App — Creator Dashboard',
  description: 'Upload and manage your fitness content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
