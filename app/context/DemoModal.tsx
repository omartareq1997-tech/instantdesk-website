'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import DemoModal from '../components/DemoModal'

type Source = 'hero' | 'cta' | 'navbar' | 'pricing' | 'general'

type DemoModalContextValue = {
  open: (source?: Source) => void
  close: () => void
}

const DemoModalContext = createContext<DemoModalContextValue>({
  open: () => {},
  close: () => {},
})

export function DemoModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [source, setSource] = useState<Source>('general')

  const open = (s: Source = 'general') => {
    setSource(s)
    setIsOpen(true)
  }

  const close = () => setIsOpen(false)

  return (
    <DemoModalContext.Provider value={{ open, close }}>
      {children}
      <DemoModal isOpen={isOpen} onClose={close} source={source} />
    </DemoModalContext.Provider>
  )
}

export function useDemoModal() {
  return useContext(DemoModalContext)
}
