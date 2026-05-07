import { useEffect, useState } from 'react'
import { ContextPanel } from './components/ContextPanel'
import { LeftRail } from './components/LeftRail'
import { PhotoSurface } from './components/PhotoSurface'
import { TopBar } from './components/TopBar'
import { type DesktopEnvironment, getDesktopEnvironment } from './desktop/environment'
import { getLibrarySummary, pickPhotoFolder, scanPhotoSource } from './desktop/library'
import type { LibrarySummary } from './types/library'

export default function App() {
  const [desktopEnvironment, setDesktopEnvironment] = useState<DesktopEnvironment>({
    runtime: 'web',
    platform: 'browser',
    engine: 'mock',
  })
  const [librarySummary, setLibrarySummary] = useState<LibrarySummary>({
    sources: [],
    totalPhotos: 0,
  })
  const [isScanning, setIsScanning] = useState(false)

  useEffect(() => {
    void getDesktopEnvironment().then(setDesktopEnvironment)
    void getLibrarySummary().then(setLibrarySummary)
  }, [])

  const handleAddFolder = async () => {
    const path = await pickPhotoFolder()
    if (!path) return

    setIsScanning(true)
    try {
      const result = await scanPhotoSource(path)
      if (result) {
        setLibrarySummary((prev) => ({
          sources: [...prev.sources.filter((s) => s.id !== result.source.id), result.source],
          totalPhotos: prev.totalPhotos + result.indexedCount,
        }))
      }
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="app-shell">
      <TopBar onAddFolder={handleAddFolder} isScanning={isScanning} />
      <div className="workspace-grid">
        <LeftRail />
        <PhotoSurface />
        <ContextPanel desktopEnvironment={desktopEnvironment} librarySummary={librarySummary} />
      </div>
    </div>
  )
}
