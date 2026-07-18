import { expect, test } from '@playwright/test'

test('desktop shell keeps photos as largest visual surface', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only layout assertion')

  await page.goto('/')

  await expect(page.getByText('No photos found in this view.')).toBeVisible()
  await expect(page.getByLabel('Timeline photo surface')).toBeVisible()
  await expect(page.getByLabel('Photo navigation')).toBeVisible()
  await expect(page.getByLabel('View context')).toBeVisible()

  const surfaceBox = await page.getByLabel('Timeline photo surface').boundingBox()
  const railBox = await page.getByLabel('Photo navigation').boundingBox()
  const contextBox = await page.getByLabel('View context').boundingBox()

  expect(surfaceBox?.width ?? 0).toBeGreaterThan((railBox?.width ?? 0) + (contextBox?.width ?? 0))
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
