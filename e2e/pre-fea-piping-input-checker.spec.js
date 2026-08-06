import { expect, test } from '@playwright/test';

test('Non-FEA input checker is read-only, scope-labelled and consumes canonical geometry', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-tab-pre-fea-check').click();

  await expect(page.getByTestId('pre-fea-input-checker')).toBeVisible();
  await expect(page.getByTestId('pre-fea-scope-badge')).toHaveText('NON-FEA ONLY');
  await expect(page.getByText('no mesh, stiffness matrix, shell/continuum model, FEA solver or FEA result processing')).toBeVisible();
  await expect(page.getByTestId('pre-fea-status')).toContainText('EMPTY');
  await expect(page.getByTestId('pre-fea-empty')).toBeVisible();

  await page.evaluate(() => {
    const geometry = {
      schemaVersion: 'canonical-geometry-v1',
      source: 'e2e-non-fea-check',
      unit: 'mm',
      valid: true,
      nodes: [
        { id: 'N1', x: 0, y: 0, z: 0, sourceComponentUid: 'PIPE-1' },
        { id: 'N2', x: 1000, y: 0, z: 0, sourceComponentUid: 'PIPE-1' },
      ],
      segments: [
        { id: 'S1', startNodeId: 'N1', endNodeId: 'N2', type: 'PIPE', sourceComponentUid: 'PIPE-1' },
      ],
      diagnostics: [],
      summary: { nodeCount: 2, segmentCount: 1 },
    };
    const components = [{
      id: 'PIPE-1',
      type: 'PIPE',
      attributes: {
        SCHEDULE: 'STD',
        OUTSIDE_DIAMETER_MM: 114.3,
        WALL_THICKNESS_MM: 6.02,
        MATERIAL_DENSITY_KG_M3: 7850,
        FLUID_FILL_STATE: 'EMPTY',
        INSULATION_PRESENT: false,
        MASS_KG: 2,
        CENTER_OF_GRAVITY_M: { x: 0.5, y: 0, z: 0 },
      },
    }];
    window.useAppStore.setState({ components });
    window.useAppStore.getState().setCanonicalGeometry(geometry);
  });

  await expect(page.getByTestId('pre-fea-position-count')).toContainText('1');
  await expect(page.getByTestId('pre-fea-status')).toContainText('BLOCKED');
  await expect(page.getByTestId('pre-fea-methods')).toContainText('Weight & gravity');
  await expect(page.getByTestId('pre-fea-methods')).toContainText('NOT_QUALIFIED');
  await expect(page.getByTestId('pre-fea-gates')).toContainText('A_SOURCE_MODEL');
  await expect(page.getByTestId('pre-fea-gates')).toContainText('C_PROJECT_DATA');
  await expect(page.getByRole('button', { name: 'Staged Input' })).toBeDisabled();
});
