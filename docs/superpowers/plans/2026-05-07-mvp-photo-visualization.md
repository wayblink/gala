# MVP Photo Visualization Implementation Plan

> **Goal:** Transform the indexing prototype into a visual MVP demo where users can see and browse their real photos.

**Status:** In Progress  
**Started:** 2026-05-07  
**Target Completion:** 2026-05-12

---

## Current State

✅ **Completed:**
- Source folder selection and scanning
- SQLite photo index with sources and photos tables
- File discovery for 7 image formats
- Desktop UI shell with mock data
- Non-destructive architecture foundation

❌ **Missing for MVP:**
- Real photo thumbnails (showing placeholders)
- EXIF metadata extraction
- Timeline grouping by date
- Photo viewer/focus mode
- Performance optimization for large libraries

---

## Phase 1: Photo Visualization (Critical Path)

### Task 1.1: Thumbnail Generation Engine

**Objective:** Generate and cache thumbnails during scan

**Implementation:**

1. **Add dependencies** (`src-tauri/Cargo.toml`):
```toml
image = "0.25"
```

2. **Create thumbnail generator** (`src-tauri/src/library/thumbnails.rs`):
   - Three sizes: small (200px), medium (400px), large (800px)
   - Maintain aspect ratio
   - JPEG output with 85% quality
   - Store in `{app_data}/thumbnails/{size}/{photo_id}.jpg`

3. **Update photo_assets table**:
   - Store thumbnail paths
   - Track generation status (pending/ready/failed)
   - Add `generated_at` timestamp

4. **Integrate with scanner**:
   - Generate thumbnails after photo insert
   - Async/background generation
   - Continue scan on thumbnail failure
   - Update `photo_assets` table

**Files:**
- Create: `src-tauri/src/library/thumbnails.rs`
- Modify: `src-tauri/src/library/mod.rs`
- Modify: `src-tauri/src/library/storage.rs`
- Modify: `src-tauri/src/library/commands.rs`
- Create: `src-tauri/tests/library_thumbnails.rs`

**Tests:**
- Generate thumbnail from JPEG
- Generate thumbnail from PNG
- Maintain aspect ratio
- Handle corrupted images
- Store correct paths in database

**Success Criteria:**
- Thumbnails generated during scan
- Files stored in app cache directory
- Database tracks thumbnail status
- All tests pass

---

### Task 1.2: Photo Grid with Real Thumbnails

**Objective:** Display real photo thumbnails in the UI

**Implementation:**

1. **Add Tauri command** (`src-tauri/src/library/commands.rs`):
```rust
#[tauri::command]
pub fn get_timeline_photos(
    app: AppHandle,
    limit: i64,
    offset: i64
) -> Result<Vec<TimelinePhoto>, String>
```

2. **Add thumbnail serving command**:
```rust
#[tauri::command]
pub fn get_thumbnail_url(
    app: AppHandle,
    photo_id: String,
    size: String
) -> Result<String, String>
```

3. **Update frontend types** (`src/types/library.ts`):
```typescript
export type TimelinePhoto = {
  id: string
  fileName: string
  capturedAt: string | null
  thumbnailUrl: string
  width: number
  height: number
}
```

4. **Update PhotoSurface component** (`src/components/PhotoSurface.tsx`):
   - Fetch real photos from backend
   - Display thumbnails using Tauri asset protocol
   - Virtual scrolling for performance
   - Loading states and error handling
   - Grid layout with proper spacing

5. **Add photo card component** (`src/components/PhotoCard.tsx`):
   - Thumbnail image
   - Loading skeleton
   - Error state
   - Hover effects
   - Click handler for future focus mode

**Files:**
- Modify: `src-tauri/src/library/commands.rs`
- Modify: `src-tauri/src/library/models.rs`
- Create: `src/types/library.ts` (timeline types)
- Modify: `src/components/PhotoSurface.tsx`
- Create: `src/components/PhotoCard.tsx`
- Create: `src/desktop/photos.ts`
- Create: `src/desktop/photos.test.ts`

**Tests:**
- Frontend: Photo grid renders with real data
- Frontend: Loading states work correctly
- Frontend: Error handling for missing thumbnails
- E2E: Photos appear after scan completes

**Success Criteria:**
- Real photos visible in grid
- Smooth scrolling with 100+ photos
- Proper loading and error states
- Tests pass

---

## Phase 2: EXIF and Timeline

### Task 2.1: EXIF Metadata Parsing

**Objective:** Extract and store photo metadata

**Implementation:**

1. **Add dependencies**:
```toml
kamadak-exif = "0.5"
```

2. **Create EXIF parser** (`src-tauri/src/library/exif.rs`):
   - Extract capture date/time
   - Extract camera make/model
   - Extract lens model
   - Extract GPS coordinates
   - Extract dimensions and orientation
   - Extract ISO, aperture, shutter speed, focal length

3. **Update photo_metadata table**:
   - Populate during scan
   - Handle missing EXIF gracefully
   - Fall back to file mtime for capture date

4. **Integrate with scanner**:
   - Parse EXIF after file discovery
   - Store in photo_metadata table
   - Continue on parse failure

**Files:**
- Create: `src-tauri/src/library/exif.rs`
- Modify: `src-tauri/src/library/scanner.rs`
- Modify: `src-tauri/src/library/storage.rs`
- Create: `src-tauri/tests/library_exif.rs`

**Tests:**
- Parse EXIF from JPEG with full metadata
- Handle JPEG without EXIF
- Handle PNG (no EXIF)
- Extract GPS coordinates
- Parse date formats correctly

**Success Criteria:**
- EXIF data stored in database
- Capture dates available for timeline
- Camera info available for context panel
- Tests pass

---

### Task 2.2: Timeline Grouping

**Objective:** Group photos by date in UI

**Implementation:**

1. **Update backend query** (`src-tauri/src/library/storage.rs`):
```rust
pub fn get_timeline_photos_grouped(
    conn: &Connection,
    limit: i64,
    offset: i64
) -> Result<Vec<TimelineGroup>, String>
```

2. **Timeline group structure**:
```rust
pub struct TimelineGroup {
    pub date: String,        // "2024-05-07"
    pub display: String,     // "May 7, 2024"
    pub photos: Vec<TimelinePhoto>,
}
```

3. **Update PhotoSurface** (`src/components/PhotoSurface.tsx`):
   - Render date headers
   - Group photos by date
   - Sticky headers on scroll
   - Date navigation

4. **Add date utilities** (`src/utils/dates.ts`):
   - Format dates for display
   - Group by year/month/day
   - Relative dates ("Today", "Yesterday")

**Files:**
- Modify: `src-tauri/src/library/storage.rs`
- Modify: `src-tauri/src/library/models.rs`
- Modify: `src/components/PhotoSurface.tsx`
- Create: `src/components/DateHeader.tsx`
- Create: `src/utils/dates.ts`
- Create: `src/utils/dates.test.ts`

**Tests:**
- Backend: Groups photos by date correctly
- Backend: Sorts by capture date descending
- Frontend: Date headers render correctly
- Frontend: Sticky headers work

**Success Criteria:**
- Photos grouped by date
- Clear date separators
- Chronological order
- Tests pass

---

## Phase 3: Photo Viewer (Optional for MVP)

### Task 3.1: Focus Viewer

**Objective:** Full-screen photo viewing

**Implementation:**

1. **Add focus mode state** (`src/App.tsx`):
   - Track selected photo
   - Focus mode toggle
   - Keyboard navigation

2. **Create FocusViewer component** (`src/components/FocusViewer.tsx`):
   - Full-screen overlay
   - Large photo display
   - Previous/Next navigation
   - Close button and ESC key
   - EXIF info panel

3. **Add original photo loading**:
   - Tauri command to serve original files
   - Progressive loading (thumbnail → full)
   - Zoom and pan controls

**Files:**
- Create: `src/components/FocusViewer.tsx`
- Modify: `src/App.tsx`
- Modify: `src-tauri/src/library/commands.rs`
- Create: `src/components/FocusViewer.test.tsx`

**Tests:**
- Opens on photo click
- Keyboard navigation works
- Closes on ESC
- Displays EXIF info

**Success Criteria:**
- Smooth focus mode experience
- Keyboard shortcuts work
- EXIF info visible
- Tests pass

---

## Phase 4: Polish and Performance

### Task 4.1: Empty States and Onboarding

**Implementation:**
- Empty library state with clear CTA
- First-run welcome message
- Scanning progress with photo count
- Success message after first scan

**Files:**
- Create: `src/components/EmptyState.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/TopBar.tsx`

---

### Task 4.2: Performance Optimization

**Implementation:**
- Virtual scrolling for 1000+ photos
- Thumbnail lazy loading
- Database query optimization
- Pagination for large libraries

**Files:**
- Modify: `src/components/PhotoSurface.tsx`
- Modify: `src-tauri/src/library/storage.rs`

---

### Task 4.3: Error Handling

**Implementation:**
- Corrupted image handling
- Unsupported format messages
- Offline source indicators
- Thumbnail generation failures

**Files:**
- Modify: `src-tauri/src/library/thumbnails.rs`
- Modify: `src/components/PhotoCard.tsx`
- Create: `src/components/ErrorState.tsx`

---

## Testing Strategy

### Unit Tests
- Rust: Thumbnail generation
- Rust: EXIF parsing
- Rust: Timeline queries
- TypeScript: Date utilities
- TypeScript: Photo grid rendering

### Integration Tests
- Scan → Thumbnails → Display pipeline
- EXIF → Timeline grouping
- Photo selection → Focus mode

### E2E Tests
- Add folder → See photos
- Scroll timeline
- Click photo → View details

### Manual Testing
- Test with 10 photos
- Test with 100 photos
- Test with 1000+ photos
- Test with mixed formats
- Test with photos without EXIF

---

## Success Metrics

**MVP Demo is successful when:**

1. ✅ User can add a photo folder
2. ✅ Real photos appear in grid within 5 seconds
3. ✅ Photos grouped by date
4. ✅ Smooth scrolling with 100+ photos
5. ✅ Click photo to view large version
6. ✅ EXIF info visible in context panel
7. ✅ Original files remain untouched
8. ✅ App feels fast and responsive

---

## Risk Mitigation

**Risk: Thumbnail generation too slow**
- Mitigation: Async generation, continue scan
- Fallback: Show placeholder until ready

**Risk: Large libraries crash app**
- Mitigation: Virtual scrolling, pagination
- Fallback: Limit initial load to 500 photos

**Risk: EXIF parsing fails**
- Mitigation: Graceful fallback to file dates
- Fallback: Show "Unknown" for missing data

**Risk: Memory issues with images**
- Mitigation: Proper image disposal
- Fallback: Limit concurrent thumbnail generation

---

## Timeline

**Day 1-2: Phase 1 (Critical)**
- Morning: Thumbnail generation engine
- Afternoon: Photo grid with real thumbnails
- Evening: Testing and bug fixes

**Day 3: Phase 2**
- Morning: EXIF parsing
- Afternoon: Timeline grouping
- Evening: Testing

**Day 4: Phase 3 (Optional)**
- Focus viewer implementation
- Keyboard navigation
- Testing

**Day 5: Phase 4**
- Polish and error handling
- Performance testing
- Demo preparation

---

## Next Steps

1. ✅ Create this plan document
2. ⏳ Start Phase 1.1: Thumbnail Generation
3. ⏳ Implement Phase 1.2: Photo Grid
4. ⏳ Continue with Phase 2
5. ⏳ Polish and test

---

## Notes

- Keep web mode functional with mock data
- Maintain TDD approach for all features
- Commit after each completed task
- Update this document as we progress
