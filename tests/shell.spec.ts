import { expect, test } from '@playwright/test'

test('desktop shell keeps photos as largest visual surface', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only layout assertion')

  await page.goto('/')

  await expect(page.getByLabel('Timeline photo surface')).toBeVisible()
  await expect(page.getByLabel('Photo navigation')).toBeVisible()
  await expect(page.getByLabel('View context')).toBeVisible()

  const surfaceBox = await page.getByLabel('Timeline photo surface').boundingBox()
  const railBox = await page.getByLabel('Photo navigation').boundingBox()
  const contextBox = await page.getByLabel('View context').boundingBox()

  expect(surfaceBox?.width ?? 0).toBeGreaterThan((railBox?.width ?? 0) + (contextBox?.width ?? 0))
})

test('desktop thumbnail cards fill their grid tracks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only layout assertion')

  await page.goto('/')

  const grid = page.locator('.photo-grid').first()
  const cards = grid.locator('.photo-card')
  await expect(cards.first()).toBeVisible()
  const gridBox = await grid.boundingBox()
  const firstBox = await cards.nth(0).boundingBox()
  const secondBox = await cards.nth(1).boundingBox()
  expect(gridBox).not.toBeNull()
  expect(firstBox?.width ?? 0).toBeGreaterThanOrEqual(78)
  expect(firstBox?.height ?? 0).toBeCloseTo(firstBox?.width ?? 0, 0)
  const renderedGap = (secondBox?.x ?? 0) - (firstBox?.x ?? 0) - (firstBox?.width ?? 0)
  expect(renderedGap).toBeGreaterThanOrEqual(6)
  expect(renderedGap).toBeLessThanOrEqual(12)
})

test('desktop navigation groups collapse without changing the active view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only navigation assertion')

  await page.goto('/')
  const allPhotos = page.getByRole('button', { name: /All Photos/i }).first()
  await expect(allPhotos).toBeVisible()
  await page.getByRole('button', { name: 'Collapse Library' }).click()
  await expect(allPhotos).not.toBeVisible()
  await expect(page.getByLabel('Timeline photo surface')).toBeVisible()
  await page.getByRole('button', { name: 'Expand Library' }).click()
  await expect(allPhotos).toBeVisible()
})

test('desktop left navigation uses one typography system', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only navigation assertion')

  await page.goto('/')
  const hierarchy = await page.evaluate(() => {
    const style = (element: Element) => {
      const computed = getComputedStyle(element)
      return {
        family: computed.fontFamily,
        size: Number.parseFloat(computed.fontSize),
        weight: Number.parseInt(computed.fontWeight, 10),
        transform: computed.textTransform,
        left: element.getBoundingClientRect().left,
      }
    }
    const headings = Array.from(document.querySelectorAll('.rail-group__header-row'))
    const items = Array.from(document.querySelectorAll('.rail-list > .rail-item:not(.rail-item--muted)'))
    const counts = Array.from(document.querySelectorAll('.left-rail .rail-item__count'))
    const providerCounts = Array.from(document.querySelectorAll('.left-rail .rail-source-provider__count'))
    const sourcesHeading = Array.from(headings).find((heading) => heading.textContent?.includes('Sources'))!
    return {
      headings: headings.map(style),
      items: items.map(style),
      counts: counts.map(style),
      providerCounts: providerCounts.map(style),
      sourcesHeadingMainLeft: sourcesHeading.querySelector('.rail-group__heading-main')?.getBoundingClientRect().left,
      sourcesHeadingLeft: sourcesHeading.getBoundingClientRect().left,
    }
  })

  expect(hierarchy.headings).toHaveLength(4)
  expect(new Set(hierarchy.headings.map((style) => style.family)).size).toBe(1)
  expect(new Set(hierarchy.headings.map((style) => style.size))).toEqual(new Set([13]))
  expect(new Set(hierarchy.headings.map((style) => style.weight))).toEqual(new Set([700]))
  expect(new Set(hierarchy.headings.map((style) => style.transform))).toEqual(new Set(['none']))
  expect(new Set(hierarchy.items.map((style) => style.family)).size).toBe(1)
  expect(new Set(hierarchy.items.map((style) => style.size))).toEqual(new Set([13]))
  expect(hierarchy.counts).toHaveLength(0)
  expect(hierarchy.providerCounts).toHaveLength(0)
  expect(hierarchy.sourcesHeadingMainLeft).toBeCloseTo(hierarchy.sourcesHeadingLeft, 0)
})

test('desktop Sources navigation keeps provider and child typography hierarchy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only navigation assertion')

  await page.goto('/')
  const applePhotos = page.getByRole('button', { name: 'Expand Apple Photos' })
  test.skip(await applePhotos.count() === 0, 'Apple Photos source is not present in the web fixture')
  await applePhotos.click()

  const localFolders = page.getByRole('button', { name: 'Expand Local Folders' })
  const sourceAlbums = page.getByRole('button', { name: 'Expand Albums' })
  const sourceProvider = page.locator('.rail-source-provider__collapse').filter({ hasText: 'Apple Photos' })
  const sourceChildren = page.locator('.rail-source-provider').first().locator('.rail-item--provider-child')

  await expect(localFolders).toHaveClass(/rail-source-provider__collapse/)
  await expect(sourceAlbums).toHaveClass(/rail-item--provider-child/)
  await expect(sourceChildren).toHaveCount(3)

  const hierarchy = await page.evaluate(() => {
    const provider = document.querySelector<HTMLElement>('.rail-source-provider__collapse')!
    const children = Array.from(document.querySelectorAll<HTMLElement>('.rail-source-provider:first-child .rail-item--provider-child'))
    return {
      providerSize: Number.parseFloat(getComputedStyle(provider).fontSize),
      providerTransform: getComputedStyle(provider).textTransform,
      childSizes: children.map((child) => Number.parseFloat(getComputedStyle(child).fontSize)),
      childTransforms: children.map((child) => getComputedStyle(child).textTransform),
      childLabelLefts: children.map((child) => child.querySelector<HTMLElement>('.rail-item__label')!.getBoundingClientRect().left),
    }
  })
  expect(hierarchy.providerSize).toBe(13)
  expect(hierarchy.providerTransform).toBe('none')
  expect(hierarchy.childSizes).toEqual([13, 13, 13])
  expect(hierarchy.childTransforms).toEqual(['none', 'none', 'none'])
  expect(Math.max(...hierarchy.childLabelLefts) - Math.min(...hierarchy.childLabelLefts)).toBeLessThanOrEqual(1)
  await expect(sourceProvider).toBeVisible()
})

test('selection toolbar keeps text and disabled controls readable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only selection toolbar assertion')

  await page.goto('/')
  await page.getByRole('button', { name: 'Enter selection mode' }).click()
  const toolbar = page.locator('.selection-toolbar')
  await expect(toolbar).toBeVisible()
  const styles = await toolbar.evaluate((element) => {
    const count = element.querySelector('.selection-toolbar__count')!
    const disabled = element.querySelector<HTMLButtonElement>('.selection-toolbar__btn:disabled')!
    const labels = Array.from(element.querySelectorAll<HTMLButtonElement>('.selection-toolbar__btn')).map((button) => button.textContent?.trim() ?? '')
    return {
      countColor: getComputedStyle(count).color,
      countWeight: getComputedStyle(count).fontWeight,
      disabledColor: getComputedStyle(disabled).color,
      disabledOpacity: getComputedStyle(disabled).opacity,
      labels,
    }
  })
  expect(styles.countColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(styles.countWeight).toBe('600')
  expect(styles.disabledOpacity).toBe('1')
  expect(styles.labels).toEqual(expect.arrayContaining(['Select visible', 'Select all matching', 'Unselect all', 'Done']))
  expect(styles.labels.join(' ')).not.toMatch(/Load|Favorite|Hide|Tag|Album/)
})

test('desktop sidebar separators resize with pointer and keyboard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only resize assertion')

  await page.goto('/')

  const leftRail = page.getByLabel('Photo navigation')
  const rightPanel = page.getByLabel('View context')
  const leftSeparator = page.getByRole('separator', { name: 'Resize left sidebar' })
  const rightSeparator = page.getByRole('separator', { name: 'Resize right panel' })

  const leftBefore = await leftRail.boundingBox()
  const leftHandle = await leftSeparator.boundingBox()
  expect(leftBefore).not.toBeNull()
  expect(leftHandle).not.toBeNull()
  await page.mouse.move(leftHandle!.x + leftHandle!.width / 2, leftHandle!.y + 120)
  await page.mouse.down()
  await page.mouse.move(leftHandle!.x + leftHandle!.width / 2 + 40, leftHandle!.y + 120, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await leftRail.boundingBox())?.width ?? 0).toBeCloseTo((leftBefore?.width ?? 0) + 40, 0)

  const rightBefore = await rightPanel.boundingBox()
  const rightHandle = await rightSeparator.boundingBox()
  expect(rightBefore).not.toBeNull()
  expect(rightHandle).not.toBeNull()
  await page.mouse.move(rightHandle!.x + rightHandle!.width / 2, rightHandle!.y + 120)
  await page.mouse.down()
  await page.mouse.move(rightHandle!.x + rightHandle!.width / 2 - 40, rightHandle!.y + 120, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await rightPanel.boundingBox())?.width ?? 0).toBeCloseTo((rightBefore?.width ?? 0) + 40, 0)

  await leftSeparator.focus()
  await page.keyboard.press('ArrowRight')
  await expect(leftSeparator).toHaveAttribute('aria-valuenow', '288')
  await page.keyboard.press('Home')
  await expect(leftSeparator).toHaveAttribute('aria-valuenow', '200')

  const rightValueBeforeKeyboard = Number(await rightSeparator.getAttribute('aria-valuenow'))
  await rightSeparator.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(rightSeparator).toHaveAttribute('aria-valuenow', String(rightValueBeforeKeyboard - 8))
  await page.keyboard.press('End')
  await expect(rightSeparator).toHaveAttribute('aria-valuenow', '520')
})

test('narrow shell preserves photo surface and moves context below', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'narrow', 'narrow-only layout assertion')

  await page.goto('/')

  await expect(page.getByLabel('Timeline photo surface')).toBeVisible()
  await expect(page.getByLabel('View context')).toBeVisible()

  const viewportWidth = page.viewportSize()?.width ?? 0
  const surfaceBox = await page.getByLabel('Timeline photo surface').boundingBox()
  const contextBox = await page.getByLabel('View context').boundingBox()

  expect(surfaceBox?.width ?? 0).toBeGreaterThan(viewportWidth - 100)
  expect(contextBox?.y ?? 0).toBeGreaterThan(surfaceBox?.y ?? 0)
})
