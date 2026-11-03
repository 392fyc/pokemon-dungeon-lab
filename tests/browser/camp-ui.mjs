export async function openCampPanel(page, panel) {
  const dialog = page.locator('#camp-dialog[open]');
  if (await dialog.count()) {
    if (await dialog.getAttribute('data-camp-panel') === panel) return;
    await page.locator('#camp-close').click();
  }
  await page.locator('#camp-open-' + panel).click();
  await page.locator('#camp-dialog[data-camp-panel="' + panel + '"][open]').waitFor();
}

export async function openCampRoster(page) {
  await openCampPanel(page, 'party');
  const roster = page.locator('#camp-roster');
  if (await roster.getAttribute('open') === null) await roster.locator('summary').click();
}

export async function campControl(page, id) {
  if (!(await page.locator('body.camp-mode #base').isVisible())) return id;

  if (/^(carry|team|lead)-P/.test(id)) await openCampRoster(page);
  if (/^(tm-|learn-P)/.test(id)) await openCampPanel(page, 'vault');
  if (/^talent-(add-|reset)/.test(id)) await openCampPanel(page, 'talents');
  if (id === 'retry') return 'camp-retry';

  if (['depart', 'open-settings', 'to-title'].includes(id)) {
    if (await page.locator('#camp-dialog[open]').count()) await page.locator('#camp-close').click();
    if (id === 'open-settings') return 'camp-menu';
    if (id === 'to-title') {
      await page.locator('#camp-menu').click();
      return 'camp-title';
    }
  }
  return id;
}
