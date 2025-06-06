import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Paradigm Docs - AI Research Assistant',
  description: 'Transform any text editor into an intelligent writing companion with @Paradigm triggers',
  keywords: ['AI', 'research', 'assistant', 'writing', 'productivity'],
  authors: [{ name: 'Paradigm Team' }],
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        {children}
      </body>
    </html>
  )
} 