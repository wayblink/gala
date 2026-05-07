import { ContextPanel } from './components/ContextPanel'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { TopBar } from './components/TopBar'

export default function App() {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace-grid">
        <LeftRail />
        <PhotoSurface />
        <ContextPanel />
      </div>
    </div>
  )
}
