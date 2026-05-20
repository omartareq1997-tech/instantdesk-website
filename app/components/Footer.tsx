'use client'

import { Zap, Mail, Phone, MapPin } from 'lucide-react'

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

const footerLinks = {
  Product: ['AI Receptionist', 'Website Chatbot', 'WhatsApp Automation', 'Booking Systems', 'Review Automation'],
  Company: ['About', 'Blog', 'Careers', 'Press', 'Contact'],
  Industries: ['Healthcare', 'Real Estate', 'Law Firms', 'Trades', 'Fitness'],
  Legal: ['Privacy Policy', 'Terms of Service', 'GDPR', 'Cookie Policy'],
}

export default function Footer() {
  return (
    <footer className="relative border-t border-white/5 pt-20 pb-12 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-64 bg-gradient-to-t from-violet-950/10 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 mb-16">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight text-white">
                Instant<span className="text-gradient-blue">Desk</span>
              </span>
            </div>
            <p className="text-sm text-white/35 leading-relaxed mb-6 max-w-xs">
              AI automation systems that turn missed leads into booked clients. Built for ambitious businesses.
            </p>
            <div className="flex flex-col gap-2.5 text-sm text-white/35">
              <a href="mailto:hello@instantdesk.pl" className="flex items-center gap-2 hover:text-white/70 transition-colors">
                <Mail className="w-3.5 h-3.5" />
                hello@instantdesk.pl
              </a>
              <a href="tel:+48000000000" className="flex items-center gap-2 hover:text-white/70 transition-colors">
                <Phone className="w-3.5 h-3.5" />
                +48 000 000 000
              </a>
              <span className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                Warsaw, Poland
              </span>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h4 className="text-xs font-bold tracking-widest uppercase text-white/30 mb-5">{group}</h4>
              <ul className="flex flex-col gap-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-white/40 hover:text-white/80 transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/5">
          <p className="text-sm text-white/20">
            © {new Date().getFullYear()} InstantDesk. All rights reserved. Registered in Poland.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" aria-label="X (Twitter)" className="text-white/25 hover:text-white/60 transition-colors">
              <XIcon className="w-4 h-4" />
            </a>
            <a href="#" aria-label="LinkedIn" className="text-white/25 hover:text-white/60 transition-colors">
              <LinkedInIcon className="w-4 h-4" />
            </a>
            <a href="#" aria-label="Facebook" className="text-white/25 hover:text-white/60 transition-colors">
              <FacebookIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
