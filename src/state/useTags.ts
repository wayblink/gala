import { useCallback, useEffect, useState } from 'react'
import { getAllTags, setPhotoTags as setPhotoTagsCmd } from '../desktop/photos'
import type { Tag } from '../types/photos'

export type UseTags = {
  tags: Tag[]
  refresh: () => Promise<void>
  setForPhoto: (photoId: string, tags: string[]) => Promise<string[]>
}

export function useTags(): UseTags {
  const [tags, setTags] = useState<Tag[]>([])

  const refresh = useCallback(async () => {
    setTags(await getAllTags())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setForPhoto = useCallback(
    async (photoId: string, nextTags: string[]) => {
      const updated = await setPhotoTagsCmd(photoId, nextTags)
      await refresh()
      return updated
    },
    [refresh],
  )

  return { tags, refresh, setForPhoto }
}
