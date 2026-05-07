import type { PhotoItem, TimelineGroup } from '../types'

const monthFormatter = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' })

function getTimelineDate(photo: PhotoItem) {
  return new Date(photo.capturedAt ?? photo.importedAt)
}

export function groupPhotosByTimeline(photos: PhotoItem[]): TimelineGroup[] {
  const sorted = [...photos].sort(
    (a, b) => getTimelineDate(b).getTime() - getTimelineDate(a).getTime(),
  )
  const groups = new Map<string, TimelineGroup>()

  for (const photo of sorted) {
    const date = getTimelineDate(photo)
    const year = String(date.getUTCFullYear())
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const key = `${year}-${month}`
    const existing = groups.get(key)

    if (existing) {
      existing.photos.push(photo)
      existing.count += 1
      existing.dateBasis =
        existing.dateBasis === 'imported' || !photo.capturedAt ? 'imported' : 'captured'
      continue
    }

    groups.set(key, {
      key,
      year,
      monthLabel: monthFormatter.format(date),
      count: 1,
      dateBasis: photo.capturedAt ? 'captured' : 'imported',
      photos: [photo],
    })
  }

  return Array.from(groups.values())
}
