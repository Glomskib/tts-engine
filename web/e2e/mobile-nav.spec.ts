import { test, expect } from '@playwright/test';

test.describe('Mobile navigation bottom sheet', () => {
  test('Menu button opens nav sheet with grouped sections', async ({ page }) => {
    // Navigate to an admin page (will redirect to login if not authed)
    await page.goto('/admin/dashboard');

    // Wait for the page to settle — either admin dashboard or login redirect
    await page.waitForLoadState('networkidle');

    // If redirected to login, skip the rest (no auth setup yet)
    if (page.url().includes('/login')) {
      test.skip(true, 'Skipped: no auth session — redirected to login');
      return;
    }

    // Bottom nav bar should be visible
    const bottomNav = page.locator('nav[aria-label="Main navigation"]');
    await expect(bottomNav).toBeVisible();

    // Click the "Menu" button (last item in bottom nav)
    const menuButton = bottomNav.getByLabel('Open menu');
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Bottom sheet should appear
    const sheet = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(sheet).toBeVisible();

    // At least one group header should be visible
    const createGroup = sheet.getByText('Create', { exact: true });
    await expect(createGroup).toBeVisible();

    // Click a group header to expand
    await createGroup.click();

    // Nav links should appear inside the expanded group
    const contentStudioLink = sheet.getByText('Content Studio');
    await expect(contentStudioLink).toBeVisible();

    // Verify active page highlighting — Dashboard is in "Settings & System" group
    const settingsGroup = sheet.getByText('Settings & System', { exact: true });
    await settingsGroup.click();
    const dashboardLink = sheet.locator('a[href="/admin/dashboard"]');
    await expect(dashboardLink).toBeVisible();
    await expect(dashboardLink).toHaveClass(/teal/);

    // Click a link — sheet should close and navigate
    await contentStudioLink.click();
    await expect(sheet).not.toBeVisible();
    await expect(page).toHaveURL(/\/admin\/content-studio/);
  });
});
