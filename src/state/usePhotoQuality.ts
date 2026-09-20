import { useEffect, useState } from 'react'

const STORAGE_KEY = 'gala:photo-quality-enabled'

export function usePhotoQuality() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return typeof window.localStorage?.getItem === 'function'
      ? window.localStorage.getItem(STORAGE_KEY) === 'true'
      : false
  })

  useEffect(() => {
    if (typeof window.localStorage?.setItem === 'function') {
      window.localStorage.setItem(STORAGE_KEY, String(enabled))
    }
  }, [enabled])

  return { enabled, setEnabled }
}
