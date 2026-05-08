# Gala MVP TODO

This document separates shipped MVP behavior from visible placeholders in the desktop UI.

## Implemented for MVP

- Add a local photo folder as a source.
- Recursively scan nested folders for JPEG, PNG, HEIC/HEIF, TIFF, WEBP, GIF, BMP, and RAW-like files.
- Persist source and photo metadata in the local SQLite library.
- Generate and display thumbnails.
- Browse all indexed photos in the main timeline.
- Open a photo viewer from the grid.
- Browse photos by source folder, including nested directories.
- Show scan progress while indexing.
- Browse recently added photos.
- Mark photos as favorites and browse the Favorites view.
- Show selected photo metadata, including size, dimensions, source, folder, and relative path.
- Search indexed photos by filename, folder path, source name, and file date.

## Visible TODO Items

These entries may appear in the left navigation with a `[todo]` marker until they have real behavior.

- Hidden `[todo]`: hidden photo state and review flow.
- People `[todo]`: face clustering and person labels.
- Places `[todo]`: location clustering from EXIF GPS data.
- Memories `[todo]`: generated story/event groupings.
- Similar `[todo]`: visual similarity groups for cleanup and discovery.
- Albums `[todo]`: user-created collections independent of folder structure.
- Smart filters `[todo]`: camera, lens, date, rating, file type, and source filters.

## Next MVP Candidates

1. Folder count polish, including empty-folder visibility if we choose to index directories explicitly.
2. Basic EXIF enrichment, especially capture time, camera, lens, and GPS when available.
3. Hidden photo state and review flow.
4. Search result polish, including scoped search within the active folder and highlighted matches.
