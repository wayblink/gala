import { useEffect, useState } from 'react'
import { ContextPanel } from './components/ContextPanel'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { TopBar } from './components/TopBar'
import { type DesktopEnvironment, getDesktopEnvironment } from './desktop/environment'

export default function App() {
  const [desktopEnvironment, setDesktopEnvironment] = useState<DesktopEnvironment>({
    runtime: 'web',
    platform: 'browser',
    engine: 'mock',
  })

  useEffect(() => {
    void getDesktopEnvironment().then(setDesktopEnvironment)
  }, [])

  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace-grid">
        <LeftRail />
        <PhotoSurface />
        <ContextPanel desktopEnvironment={desktopEnvironment} />
      </div>
    </div>
  )
}
