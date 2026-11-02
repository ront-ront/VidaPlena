import type { Metadata } from 'next'
import { Inter, Poppins } from 'next/font/google'
import { AuthProvider } from '@/components/auth-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const restoreTheme = `try{document.documentElement.classList.toggle('dark',localStorage.getItem('vp-theme')==='dark')}catch{}`

export const metadata: Metadata = {
  title: 'Vida Plena',
  description: 'Vida Plena application',
  keywords: ['Vida Plena', 'application', 'well-being'],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${poppins.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script id="vp-theme-init">{restoreTheme}</script>
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ThemeToggle />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
