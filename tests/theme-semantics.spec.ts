import { expect, test } from '@playwright/test'

test('functional component colors stay distinct inside a theme', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one rendered semantic contract is sufficient')

  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: /^Dark/ }).click()

  const backgrounds = await page.evaluate(() => {
    const readBackground = (className: string) => {
      const element = document.createElement('div')
      element.className = className
      document.body.append(element)
      const background = getComputedStyle(element).backgroundColor
      element.remove()
      return background
    }

    return [
      readBackground('primary-button'),
      readBackground('sr-tile__check sr-tile__check--on'),
      readBackground('sr-tile__decision-badge sr-tile__decision-badge--keep'),
      readBackground('task-card__status-dot task-card__status-dot--queued'),
      readBackground('task-card__status-dot task-card__status-dot--failed'),
    ]
  })

  expect(new Set(backgrounds).size).toBe(5)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
