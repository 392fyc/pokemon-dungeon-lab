export async function openCampPanel(page, panel) {
  const dialog = page.locator('#camp-dialog[open]');
  if (await dialog.count()) {
    if (await dialog.getAttribute('data-camp-panel') === panel) return;
    await page.locator('#camp-close').click();
  }
  await page.locator('#camp-open-' + panel).click();
  await page.locator('#camp-dialog[data-camp-panel="' + panel + '"][open]').waitFor();
}

export async function confirmDeparture(page) {
  if (await page.locator('#camp-dialog[open]').count()) await page.locator('#camp-close').click();
  if (!await page.locator('#camp-departure[open]').count()) await page.locator('#depart').click();
  await page.locator('#camp-departure[open]').waitFor();
  await page.locator('#depart-confirm').click();
}

export async function openCampRoster(page, memberId) {
  await openCampPanel(page, 'party');
  if (memberId) {
    const member = page.locator('[data-camp-member="' + memberId + '"]').first();
    await member.waitFor();
    if (await member.getAttribute('aria-pressed') !== 'true') await member.click();
  }
}

export async function campControl(page, id) {
  if (!(await page.locator('body.camp-mode #base').isVisible())) return id;

  const partyMember = id.match(/^(?:carry-(P\d+)-.+|(?:team|lead)-(P\d+))$/)?.[1]
    ?? id.match(/^(?:team|lead)-(P\d+)$/)?.[1];
  if (partyMember) await openCampRoster(page, partyMember);
  if (/^tm-/.test(id)) await openCampPanel(page, 'vault');
  const learner = id.match(/^learn-(P\d+)$/)?.[1];
  if (learner) {
    await openCampPanel(page, 'vault');
    const target = page.locator('[data-vault-learner="' + learner + '"]');
    if (await target.count() && await target.getAttribute('aria-pressed') !== 'true') await target.click();
  }
  if (/^talent-(add-|reset)/.test(id)) await openCampPanel(page, 'talents');
  if (id === 'retry') return 'camp-retry';

  if (id.startsWith('difficulty-')) {
    if (!await page.locator('#camp-departure[open]').count()) {
      if (await page.locator('#camp-dialog[open]').count()) await page.locator('#camp-close').click();
      await page.locator('#depart').click();
      await page.locator('#camp-departure[open]').waitFor();
    }
    return id;
  }

  if (['depart', 'open-settings', 'to-title'].includes(id)) {
    if (await page.locator('#camp-dialog[open]').count()) await page.locator('#camp-close').click();
    if (id === 'depart') {
      if (!await page.locator('#camp-departure[open]').count()) await page.locator('#depart').click();
      await page.locator('#camp-departure[open]').waitFor();
      return 'depart-confirm';
    }
    if (id === 'open-settings') return 'camp-menu';
    if (id === 'to-title') {
      await page.locator('#camp-menu').click();
      return 'camp-title';
    }
  }
  return id;
}
