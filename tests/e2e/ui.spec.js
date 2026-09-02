const { test, expect } = require('@playwright/test');

test.describe('UI / mobile quality', () => {
  test('RSVP section shows the four existing phone numbers as tap targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#rsvp')).toBeVisible();
    const phones = page.locator('#rsvp .rsvp-phone');
    await expect(phones).toHaveCount(4);
    await expect(phones.nth(0)).toHaveAttribute('href', 'tel:+2348167900645');
    await expect(phones.nth(3)).toHaveAttribute('href', 'tel:+2347049186657');
  });

  test('no horizontal overflow at 320px mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    const overflow = await page.evaluate(() => {
      return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('gift modal close control is a keyboard-accessible button and Escape closes the modal', async ({ page }) => {
    await page.goto('/');
    // Click the first gift that is still available (earlier specs claim some gifts).
    await page.waitForLoadState('networkidle');
    await page.locator('.registry-item:not(.disabled)').first().click();
    await expect(page.locator('#physicalGiftModal')).toBeVisible();

    const closeBtn = page.locator('#physicalGiftModal .close-btn');
    await expect(closeBtn).toHaveCount(1);
    const tagName = await closeBtn.evaluate((el) => el.tagName);
    expect(tagName).toBe('BUTTON');
    await expect(closeBtn).toHaveAttribute('aria-label', 'Close');

    await page.keyboard.press('Escape');
    await expect(page.locator('#physicalGiftModal')).toBeHidden();
  });

  test('mobile menu links include the RSVP destination', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.click('#menuToggleBtn');
    await expect(page.locator('#mobileNav a[href="#rsvp"]')).toBeVisible();
  });

  test('mobile menu toggle reflects aria-expanded state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const btn = page.locator('#menuToggleBtn');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('gift modal traps focus with Tab and Shift+Tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('.registry-item:not(.disabled)').first().click();
    await expect(page.locator('#physicalGiftModal')).toBeVisible();

    // Focus lands on the first focusable control (the close button).
    const first = page.locator('#physicalGiftModal .close-btn');
    await expect(first).toBeFocused();

    // Shift+Tab from the first control wraps to the last (Confirm).
    await page.keyboard.press('Shift+Tab');
    const confirmBtn = page.locator('#physicalGiftForm .submit-gift-btn');
    await expect(confirmBtn).toBeFocused();

    // Tab from the last control wraps back to the first.
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();

    // Focus never leaves the modal across repeated Tab presses.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const modal = document.getElementById('physicalGiftModal');
      return modal && modal.contains(document.activeElement);
    });
    expect(inside).toBe(true);
  });
});