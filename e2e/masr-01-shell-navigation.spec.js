import { expect, test } from '@playwright/test';

const IMPLEMENTED = ['Home','Workspace','Load Calc','PCF','Sketcher','3D Calc','Pipe Solver','Reports','QA','Settings'];
const BLOCKED_WITHOUT_DATA = new Set(['Load Calc','3D Calc','Pipe Solver','Reports']);

function collectBrowserFailures(page) {
  const failures = [];
  page.on('console', (message) => { if (message.type() === 'error') failures.push(`console:${message.text()}`); });
  page.on('pageerror', (error) => failures.push(`pageerror:${error.message}`));
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'image') failures.push(`image:${request.url()}`);
  });
  return failures;
}

test('desktop shell exposes icons, build identity and every implemented empty-state tab', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width:1366, height:768 });
  await page.goto('/');

  const navigation = page.getByRole('navigation', { name:'Application views' });
  const buttons = navigation.getByRole('button');
  await expect(buttons).toHaveCount(11);
  for (const label of [...IMPLEMENTED,'Debug']) {
    const button = navigation.getByRole('button', { name:label, exact:true });
    await expect(button).toContainText(label);
    await expect(button.locator('svg[role="img"]')).toHaveCount(1);
    await expect(button.locator('svg title')).toHaveText(`${label} icon`);
  }
  await expect(page.locator('[data-role="application-build-identity"]')).not.toBeEmpty();
  await expect(page.locator('[data-role="application-global-error"]')).toBeHidden();
  await expect(navigation.getByRole('button', { name:'Debug', exact:true })).toBeDisabled();
  expect(await page.evaluate(() => AnalysisWorkspace.getApplicationViewState().schema)).toBe('application-view-state/v10');

  for (const label of IMPLEMENTED) {
    const button = navigation.getByRole('button', { name:label, exact:true });
    await expect(button).toHaveAttribute('aria-disabled','false');
    await button.click();
    await expect(button).toBeFocused();
    const state = await page.evaluate(() => AnalysisWorkspace.getApplicationViewState());
    const tabId = button.getAttribute('data-application-nav');
    expect(state.activeViewId).toBe(await tabId);
    const view = page.locator(`[data-application-view="${state.activeViewId}"]`);
    await expect(view).toBeVisible();
    if (BLOCKED_WITHOUT_DATA.has(label)) {
      const status = view.locator('[data-role="application-tab-status"]');
      await expect(status).toBeVisible();
      await expect(status).toContainText('Actions: BLOCKED');
    }
  }

  await expect(page.locator('[data-webgl-host]')).toHaveCount(1);
  await expect(page.locator('img[src]')).toHaveCount(0);
  await page.screenshot({ path:'test-results/masr-01/desktop-tab-traversal.png', fullPage:true });
  expect(failures).toEqual([]);
});

test('keyboard navigation preserves focus and skips the unimplemented Debug tab', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width:1440, height:900 });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name:'Application views' });
  const home = navigation.getByRole('button', { name:'Home', exact:true });
  await home.focus();
  await page.keyboard.press('ArrowRight');
  await expect(navigation.getByRole('button', { name:'Workspace', exact:true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(navigation.getByRole('button', { name:'Workspace', exact:true })).toHaveAttribute('aria-current','page');
  await page.keyboard.press('End');
  await expect(navigation.getByRole('button', { name:'Settings', exact:true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(home).toBeFocused();
  expect(failures).toEqual([]);
});

test('narrow shell uses the responsive overflow menu without losing active-tab focus', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width:800, height:900 });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name:'Application views' });
  await expect(navigation.getByRole('button', { name:'QA', exact:true })).toBeHidden();
  const overflow = page.getByRole('button', { name:'More application views' });
  await expect(overflow).toBeVisible();
  await overflow.click();
  const menu = page.getByRole('menu', { name:'More application views' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name:'QA', exact:true }).click();
  await expect(page.locator('[data-application-view="QA"]')).toBeVisible();
  await expect(overflow).toBeFocused();
  await expect(menu).toBeHidden();
  await expect(page.locator('[data-webgl-host]')).toHaveCount(1);
  await page.screenshot({ path:'test-results/masr-01/narrow-overflow-qa.png', fullPage:true });
  expect(failures).toEqual([]);
});
