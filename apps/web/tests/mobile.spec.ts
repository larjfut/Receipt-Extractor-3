import { test, expect } from '@playwright/test'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X1t6wAAAAASUVORK5CYII=',
  'base64'
)

test('mobile receipt flow', async ({ page }) => {
  await page.route('**/api/upload', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ fields: { total: '1.23' }, batchId: 'b123' })
    })
  })

  await page.route('**/api/submit', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ itemId: 'i123' })
    })
  })

  await page.goto('/')

  await page.setInputFiles('input[type="file"]', {
    name: 'test.png',
    mimeType: 'image/png',
    buffer: png
  })

  await expect(page).toHaveURL(/review/)

  await page.click('button[aria-controls="main-menu"]')
  await page.click('text=Signature')
  await expect(page).toHaveURL(/signature/)

  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (box) {
    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + 60, box.y + 40)
    await page.mouse.up()
  }

  await page.click('button[aria-controls="main-menu"]')
  await page.click('text=Submit')
  await expect(page).toHaveURL(/submit/)

  await page.click('text=Submit')
  await expect(page.getByText('Submitted')).toBeVisible()
})
