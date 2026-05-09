import type { TimelinePhoto } from '../types/photos'

export type TimelinePhotoGroup = {
  key: string
  title: string
  count: number
  photos: TimelinePhoto[]
}

const monthFormatter = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function getPhotoTime(photo: TimelinePhoto): number | null {
  if (!photo.capturedAt) {
    return null
  }

  const time = new Date(photo.capturedAt).getTime()
  return Number.isNaN(time) ? null : time
}

function getGroupTitle(date: Date): string {
  return monthFormatter.format(date)
}

export function groupTimelinePhotos(photos: TimelinePhoto[]): TimelinePhotoGroup[] {
  const datedPhotos = [...photos].sort((a, b) => {
    const aTime = getPhotoTime(a)
    const bTime = getPhotoTime(b)

    if (aTime === null && bTime === null) return 0
    if (aTime === null) return 1
    if (bTime === null) return -1

    return bTime - aTime
  })
  const groups = new Map<string, TimelinePhotoGroup>()

  for (const photo of datedPhotos) {
    const time = getPhotoTime(photo)
    const date = time === null ? null : new Date(time)
    const key = date
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      : 'undated'
    const title = date ? getGroupTitle(date) : 'Undated'
    const existing = groups.get(key)

    if (existing) {
      existing.photos.push(photo)
      existing.count += 1
      continue
    }

    groups.set(key, {
      key,
      title,
      count: 1,
      photos: [photo],
    })
  }

  return Array.from(groups.values())
}
