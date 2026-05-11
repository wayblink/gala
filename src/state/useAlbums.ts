import { useCallback, useEffect, useState } from 'react'
import {
  addPhotoToAlbum,
  addPhotosToAlbumBatch,
  createAlbum,
  deleteAlbum,
  getAlbums,
  removePhotoFromAlbum,
  removePhotosFromAlbumBatch,
  renameAlbum,
} from '../desktop/photos'
import type { Album } from '../types/photos'

export type UseAlbums = {
  albums: Album[]
  refresh: () => Promise<void>
  create: (name: string) => Promise<Album | null>
  remove: (albumId: string) => Promise<void>
  rename: (albumId: string, newName: string) => Promise<void>
  addPhoto: (albumId: string, photoId: string) => Promise<void>
  removePhoto: (albumId: string, photoId: string) => Promise<void>
  addBatch: (albumId: string, photoIds: string[]) => Promise<void>
  removeBatch: (albumId: string, photoIds: string[]) => Promise<void>
}

export function useAlbums(): UseAlbums {
  const [albums, setAlbums] = useState<Album[]>([])

  const refresh = useCallback(async () => {
    setAlbums(await getAlbums())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (name: string) => {
      const created = await createAlbum(name)
      if (created) await refresh()
      return created
    },
    [refresh],
  )

  const remove = useCallback(
    async (albumId: string) => {
      await deleteAlbum(albumId)
      await refresh()
    },
    [refresh],
  )

  const rename = useCallback(
    async (albumId: string, newName: string) => {
      await renameAlbum(albumId, newName)
      await refresh()
    },
    [refresh],
  )

  const addPhoto = useCallback(
    async (albumId: string, photoId: string) => {
      await addPhotoToAlbum(albumId, photoId)
      await refresh()
    },
    [refresh],
  )

  const removePhoto = useCallback(
    async (albumId: string, photoId: string) => {
      await removePhotoFromAlbum(albumId, photoId)
      await refresh()
    },
    [refresh],
  )

  const addBatch = useCallback(
    async (albumId: string, photoIds: string[]) => {
      await addPhotosToAlbumBatch(albumId, photoIds)
      await refresh()
    },
    [refresh],
  )

  const removeBatch = useCallback(
    async (albumId: string, photoIds: string[]) => {
      await removePhotosFromAlbumBatch(albumId, photoIds)
      await refresh()
    },
    [refresh],
  )

  return { albums, refresh, create, remove, rename, addPhoto, removePhoto, addBatch, removeBatch }
}
