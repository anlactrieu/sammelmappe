import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/ui'
import Home from './pages/Home'
import Collection from './pages/Collection'
import Scan from './pages/Scan'
import Add from './pages/Add'
import Wishlist from './pages/Wishlist'
import Settings from './pages/Settings'
import { SetDetail, SetList } from './pages/Sets'
import { Icon } from './components/Icon'
import { syncIfDue } from './services/priceSync'

const tab = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' on' : ''}`

function Shell() {
  const { pathname } = useLocation()
  useEffect(() => {
    const run = () => { if (document.visibilityState === 'visible') syncIfDue().catch(() => undefined) }
    run()
    navigator.storage?.persist?.().catch(() => undefined) // iOS/Safari darf lokale Daten sonst bei Platzmangel räumen
    document.addEventListener('visibilitychange', run); window.addEventListener('online', run)
    return () => { document.removeEventListener('visibilitychange', run); window.removeEventListener('online', run) }
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  useEffect(() => { // Folienglanz folgt dem Finger/Zeiger
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('.tile-img.foil') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--hx', `${((e.clientX - r.left) / r.width) * 100}%`)
      el.style.setProperty('--hy', `${((e.clientY - r.top) / r.height) * 100}%`)
    }
    document.addEventListener('pointermove', move, { passive: true })
    return () => document.removeEventListener('pointermove', move)
  }, [])
  const scanning = pathname === '/scan'
  return (
    <>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/add" element={<Add />} />
          <Route path="/sets" element={<SetList />} />
          <Route path="/sets/:lang/:id" element={<SetDetail />} />
          <Route path="/sets/:id" element={<SetDetail />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <nav className={`tabbar${scanning ? ' dark' : ''}`} aria-label="Hauptnavigation">
        <NavLink to="/" end className={tab}><Icon name="home" />Start</NavLink>
        <NavLink to="/collection" className={tab}><Icon name="stack" />Sammlung</NavLink>
        <NavLink to="/scan" className="scan-btn" aria-label="Scannen"><Icon name="camera" size={30} /></NavLink>
        <NavLink to="/wishlist" className={tab}><Icon name="heart" />Wünsche</NavLink>
        <NavLink to="/settings" className={tab}><Icon name="user" />Profil</NavLink>
      </nav>
      <NavLink to="/add" className={`fab${pathname === '/collection' ? '' : ' hide'}`} aria-label="Karte oder Produkt hinzufügen"><Icon name="plus" size={28} /></NavLink>
    </>
  )
}

export default function App() {
  return <HashRouter><ToastProvider><Shell /></ToastProvider></HashRouter>
}
