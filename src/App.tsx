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
    console.log('Add folder clicked, isScanning:', isScanning)
    const path = await pickPhotoFolder()
    console.log('Picked folder path:', path)
    if (!path) {
      console.warn('No folder selected or Tauri not available')
      return
    }

    setIsScanning(true)
    try {
      console.log('Starting scan for:', path)
      const result = await scanPhotoSource(path)
      console.log('Scan result:', result)
      if (result) {
        setLibrarySummary((prev) => ({
          sources: [...prev.sources.filter((s) => s.id !== result.source.id), result.source],
          totalPhotos: prev.totalPhotos + result.indexedCount,
        }))
      }
    } catch (error) {
      console.error('Scan error:', error)
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
