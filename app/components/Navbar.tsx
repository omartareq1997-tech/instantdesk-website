'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useDemoModal } from '../context/DemoModal'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Testimonials', href: '#testimonials' },
]

const signupHref = '/login?mode=signup'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { open: openDemo } = useDemoModal()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'glass border-b border-white/5 py-3'
          : 'py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <img src="/assets/instantdesk-logo.png" alt="InstantDesk" className="h-8 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-white/60 hover:text-white transition-colors duration-200 font-medium"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/client-login"
            className="text-sm text-white/60 hover:text-white transition-colors font-medium px-4 py-2"
          >
            Log in
          </Link>
          <Link
            href={signupHref}
            className="rounded-lg border border-white/12 px-5 py-2.5 text-sm font-medium text-white/72 transition-colors hover:border-white/24 hover:bg-white/[0.06] hover:text-white"
          >
            Sign Up
          </Link>
          <button
            onClick={() => openDemo('navbar')}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-stone-600 text-white hover:from-orange-500 hover:to-stone-500 transition-all duration-200 shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40"
          >
            Get Demo
          </button>
        </div>

        <button
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          className="md:hidden text-white/70 hover:text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass border-t border-white/5 px-6 pb-6 pt-4"
          >
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-white/70 hover:text-white transition-colors font-medium py-1"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/client-login"
                onClick={() => setMobileOpen(false)}
                className="text-sm text-white/60 hover:text-white transition-colors font-medium py-1"
              >
                Log in
              </Link>
              <Link
                href={signupHref}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-white/12 px-5 py-3 text-center text-sm font-medium text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Sign Up
              </Link>
              <button
                onClick={() => { openDemo('navbar'); setMobileOpen(false) }}
                className="text-sm font-semibold px-5 py-3 rounded-lg bg-gradient-to-r from-orange-600 to-stone-600 text-white text-center mt-2 w-full"
              >
                Get Personalized Demo
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
