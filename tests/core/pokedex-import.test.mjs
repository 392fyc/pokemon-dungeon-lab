import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function locateMainCheckoutRoot() {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    if (commonDir) return path.resolve(commonDir, '..');
  } catch {}
  return repoRoot;
}
const mainRoot = locateMainCheckoutRoot();
const snapshotRoot = path.join(mainRoot, '.artifacts');
const scratchRoot = path.join(mainRoot, '.tmp', 'lane-dev', 'pokedex-import');
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures-pokedex/legacy-baseline.json', import.meta.url), 'utf8'));
const generationOneIds = ['metapod', 'kakuna', 'abra', 'magikarp', 'ditto'];
const admissionKeys = ['existingMoveRule', 'blowaway', 'drain', 'pureDamage', 'selfStages'];
const exclusionKeys = ['nonstandard', 'noOfficialData', 'unsupportedRange', 'unsupportedTarget', 'selfCostOrCondition', 'ohko', 'fixedDamage', 'multihit', 'recoil', 'selfSwitch', 'basePowerCallback', 'zeroBasePower', 'charge', 'changeMoveNoTemplate'];
const requiredSnapshots = [
  'showdown/pokedex.json', 'showdown/moves.json', 'showdown/learnsets.json',
  'pmd/wiki-2026-10-30.json', 'pmd/wiki-2026-10-30.json.sha256', 'pmd/moves-2026-10-30.json',
  'pokeapi/languages.csv', 'pokeapi/pokemon_species_names.csv', 'pokeapi/move_names.csv',
  'pokeapi/moves.csv', 'pokeapi/COMMIT',
  'spritecollab/tracker.json', 'spritecollab/COMMIT'
];
const missingSnapshots = requiredSnapshots.filter(relative => !fs.existsSync(path.join(snapshotRoot, relative)));
const importerPath = path.join(repoRoot, 'tools', 'data', 'import_pokedex.py');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeGitNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

function rawMoveObjectHashes(text, expectedIds) {
  const normalized = normalizeGitNewlines(text);
  const sectionStart = normalized.indexOf('"moves": {');
  assert.notEqual(sectionStart, -1, 'pmd-moves.json must contain its moves object');
  const hashes = {};
  const section = normalized.slice(sectionStart);
  const record = /^  "([^"]+)": (\{[\s\S]*?^  \})(?=,?$)/gm;
  for (const match of section.matchAll(record)) {
    if (!expectedIds.has(match[1])) continue;
    hashes[match[1]] = createHash('sha256').update(match[2], 'utf8').digest('hex');
  }
  return hashes;
}

function assertLegacyAndRosterArtifacts(rosterDoc, moveDoc, label) {
  assert.ok(Array.isArray(rosterDoc.species), `${label}: roster.species must be an array`);
  const species = rosterDoc.species;
  assert.equal(species.length, 160, `${label}: total species`);
  const ids = species.map(entry => entry.id);
  assert.equal(new Set(ids).size, 160, `${label}: duplicate species id`);
  assert.ok(species.every(entry => typeof entry.learnsetGen === 'number' && [7, 8, 9].includes(entry.learnsetGen)), `${label}: every species needs learnsetGen 7–9`);
  for (const entry of species) assert.equal(new Set(entry.kit.map(item => item.move)).size, entry.kit.length, label + ': ' + entry.id + ' kit must not repeat a move');

  const dexNumbers = species.map(entry => entry.dex);
  assert.ok(dexNumbers.every(value => /^\d{4}$/.test(value)), `${label}: dex values must be four digit strings`);
  const gen1 = species.filter(entry => Number(entry.dex) >= 1 && Number(entry.dex) <= 151);
  assert.equal(gen1.length, 151, `${label}: generation-one species count`);
  assert.deepEqual(gen1.map(entry => entry.dex).sort(), Array.from({ length: 151 }, (_, index) => String(index + 1).padStart(4, '0')), `${label}: generation-one dex range`);
  assert.equal(species.filter(entry => Number(entry.dex) > 151).length, 9, `${label}: preserved later-generation species count`);

  const byId = new Map(species.map(entry => [entry.id, entry]));
  const legacyOrder = fixture.legacySpecies.map(entry => entry.id);
  assert.deepEqual(ids.filter(id => legacyOrder.includes(id)), legacyOrder, `${label}: legacy species order is frozen`);
  for (const old of fixture.legacySpecies) {
    const current = byId.get(old.id);
    assert.ok(current, `${label}: missing legacy species ${old.id}`);
    assert.equal(current.starter, old.starter, `${label}: ${old.id} starter`);
    assert.equal(current.maxHp, old.maxHp, `${label}: ${old.id} maxHp`);
    assert.deepEqual(current.kit, old.kit, `${label}: ${old.id} kit`);
    const currentLearnable = new Set(current.learnable.map(entry => entry.move));
    for (const oldMove of old.oldLearnableIds) {
      assert.ok(currentLearnable.has(oldMove), `${label}: ${old.id} lost old learnable move ${oldMove}`);
    }
  }

  const unavailable = species.filter(entry => entry.availability === '暂不出场').map(entry => entry.id).sort();
  assert.deepEqual(unavailable, [...generationOneIds].sort(), `${label}: exactly the five species without a valid two-move kit are unavailable`);

  const actualMoveIds = new Set(Object.keys(moveDoc.moves));
  for (const id of Object.keys(fixture.oldMoveObjectRawSha256)) assert.ok(actualMoveIds.has(id), `${label}: missing legacy move ${id}`);
  const ppByMove = new Map();
  for (const entry of species) {
    for (const item of [...entry.kit, ...entry.learnable]) {
      assert.ok(Number.isInteger(item.pp) && item.pp >= 1 && item.pp <= 4, `${label}: ${entry.id}/${item.move} has invalid PP`);
      assert.ok(actualMoveIds.has(item.move), `${label}: ${entry.id}/${item.move} has no move definition`);
      if (ppByMove.has(item.move)) assert.equal(item.pp, ppByMove.get(item.move), `${label}: PP must be global for ${item.move}`);
      else ppByMove.set(item.move, item.pp);
    }
  }
}

function assertOldMoveBytes(moveFile, label) {
  const actual = rawMoveObjectHashes(fs.readFileSync(moveFile, 'utf8'), new Set(Object.keys(fixture.oldMoveObjectRawSha256)));
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(fixture.oldMoveObjectRawSha256).sort(), `${label}: all legacy move records must be present`);
  for (const [id, expectedHash] of Object.entries(fixture.oldMoveObjectRawSha256)) {
    assert.equal(actual[id], expectedHash, `${label}: raw JSON bytes changed for legacy move ${id}`);
  }
}

function inputSelection(pokedex, learnsets) {
  const gen1Entries = Object.entries(pokedex).filter(([, value]) => value.num >= 1 && value.num <= 151 && !Object.hasOwn(value, 'forme'));
  const gen1Ids = new Set(gen1Entries.map(([id]) => id));
  assert.equal(gen1Ids.size, 151, 'Showdown snapshot must have 151 base species for dex 1–151');
  const extraIds = fixture.legacySpecies.map(entry => entry.id).filter(id => !gen1Ids.has(id));
  assert.equal(extraIds.length, 9, 'the nine legacy later-generation species remain in scope');
  const speciesIds = [...new Set([...gen1Ids, ...extraIds])].sort();
  assert.equal(speciesIds.length, 160);

  const selectedGeneration = new Map();
  for (const id of speciesIds) {
    const learnset = learnsets[id]?.learnset;
    assert.ok(learnset, `Showdown learnsets missing ${id}`);
    const levelGenerations = [];
    for (const codes of Object.values(learnset)) {
      for (const code of codes) {
        const match = /^(\d+)([A-Z])/.exec(code);
        if (match && match[2] === 'L' && Number(match[1]) <= 9) levelGenerations.push(Number(match[1]));
      }
    }
    assert.ok(levelGenerations.length, `${id} has no level-up learnset generation`);
    selectedGeneration.set(id, Math.max(...levelGenerations));
  }

  const allMoves = new Set();
  const gen1Moves = new Set();
  const gen1GenerationCounts = { '7': 0, '8': 0, '9': 0 };
  for (const id of speciesIds) {
    const generation = selectedGeneration.get(id);
    if (gen1Ids.has(id)) gen1GenerationCounts[String(generation)] += 1;
    for (const [moveId, codes] of Object.entries(learnsets[id].learnset)) {
      const availableInGeneration = codes.some(code => {
        const match = /^(\d+)([A-Z])/.exec(code);
        return match && Number(match[1]) === generation && match[2] !== 'V';
      });
      if (availableInGeneration) {
        allMoves.add(moveId);
        if (gen1Ids.has(id)) gen1Moves.add(moveId);
      }
    }
  }
  return { gen1Ids, speciesIds, selectedGeneration, allMoves, gen1Moves, gen1GenerationCounts };
}

function expectedNewKit(id, generation, learnsets, moveDoc) {
  const lowestLevelByMove = new Map();
  for (const [moveId, codes] of Object.entries(learnsets[id].learnset)) {
    if (!Object.hasOwn(moveDoc.moves, moveId)) continue;
    for (const code of codes) {
      const match = /^(\d+)L(\d+)$/.exec(code);
      if (!match || Number(match[1]) !== generation) continue;
      const level = Number(match[2]);
      if (!lowestLevelByMove.has(moveId) || level < lowestLevelByMove.get(moveId)) lowestLevelByMove.set(moveId, level);
    }
  }
  const levelups = [...lowestLevelByMove].map(([move, level]) => ({ move, level })).sort((left, right) => left.level - right.level || (left.move < right.move ? -1 : left.move > right.move ? 1 : 0));
  const chosen = levelups.slice(0, 2).map(entry => entry.move);
  if (chosen.length === 2 && !chosen.some(move => moveDoc.moves[move].effects?.includes('damage'))) {
    const earliestDamage = levelups.find(entry => moveDoc.moves[entry.move].effects?.includes('damage'));
    if (earliestDamage) chosen[1] = earliestDamage.move;
  }
  return chosen;
}

function parseMoveRowField(row, field) {
  const prefix = `|${field}=`;
  const start = row.indexOf(prefix);
  if (start < 0) return '-';
  const valueStart = start + prefix.length;
  const end = row.indexOf('|', valueStart);
  return row.slice(valueStart, end < 0 ? row.length : end).replace(/\}\}\s*$/, '').trim() || '-';
}

function gameToWikiCode(game) {
  const map = { MDTDS: 'TDS', MDSky: 'S', MDTD: 'TD', MDGtI: 'GTI', SMD: 'SMD', RTDX: 'RTDX' };
  assert.ok(map[game], `unrecognized official game ${game}`);
  return map[game];
}

function assertOfficialRows(moveDoc, wikiDoc) {
  let checked = 0;
  for (const [id, game] of Object.entries(fixture.legacyOfficialGameByMove)) {
    const page = wikiDoc.moves[id];
    assert.ok(page, `wiki snapshot missing official move page ${id}`);
    const wantedCode = gameToWikiCode(game);
    const row = page.rows.find(candidate => candidate.startsWith('{{MDMoveRow|') && parseMoveRowField(candidate, 'game') === wantedCode);
    assert.ok(row, `wiki snapshot has no ${wantedCode} row for ${id}`);
    const actual = moveDoc.moves[id];
    assert.ok(actual, `generated move table missing ${id}`);
    assert.equal(actual.game, game, `${id} selected game`);
    assert.equal(actual.official.basePp, parseMoveRowField(row, 'pp'), `${id} official PP vs ${wantedCode} wiki row`);
    assert.equal(actual.official.accuracy, parseMoveRowField(row, 'acc'), `${id} official accuracy vs ${wantedCode} wiki row`);
    assert.equal(actual.official.cutsCorners, parseMoveRowField(row, 'cuts'), `${id} official corner-cutting value vs ${wantedCode} wiki row`);
    checked += 1;
  }
  assert.equal(checked, 23, 'all 23 legacy moves with official data must be checked against their chosen wiki row');
  return checked;
}

function sumCounts(counts, expectedKeys, label) {
  assert.deepEqual(Object.keys(counts).sort(), [...expectedKeys].sort(), `${label}: category keys`);
  let sum = 0;
  for (const [key, value] of Object.entries(counts)) {
    assert.ok(Number.isInteger(value) && value >= 0, `${label}.${key} must be a nonnegative integer`);
    sum += value;
  }
  return sum;
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath).map(relative => path.join(entry.name, relative)));
    else if (entry.isFile()) files.push(entry.name);
  }
  return files.sort();
}

function runImporter(inputRoot, outDir) {
  return spawnSync('python', ['-I', importerPath, '--snapshot-root', inputRoot, '--out-dir', outDir], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 180000
  });
}

function assertImporterSucceeded(result, label) {
  assert.equal(result.error, undefined, `${label}: ${result.error?.message ?? ''}`);
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function loadOutput(outDir) {
  return {
    roster: readJson(path.join(outDir, 'src', 'data', 'roster.json')),
    moveDoc: readJson(path.join(outDir, 'src', 'data', 'pmd-moves.json')),
    names: readJson(path.join(outDir, 'src', 'data', 'names-zh.json')),
    exceptions: fs.readFileSync(path.join(outDir, '.artifacts', 'pokedex', 'exceptions.md'), 'utf8'),
    summary: readJson(path.join(outDir, '.artifacts', 'pokedex', 'summary.json'))
  };
}

function copySnapshotInputs(destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const directory of ['showdown', 'pmd', 'pokeapi', 'spritecollab']) {
    fs.cpSync(path.join(snapshotRoot, directory), path.join(destination, directory), { recursive: true });
  }
}

test('wikitext解析取tt首参数，并将未知值与已知暂不支持值区分', () => {
  assert.ok(fs.existsSync(importerPath), `missing importer ${importerPath}`);
  const python = `
import importlib.util
from pathlib import Path
path = Path(${JSON.stringify(importerPath)})
spec = importlib.util.spec_from_file_location("pokedex_import_test_target", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
row = module.parse_pmd_row("{{MDMoveRow|game=TDS|range={{tt|Front|Indicated as Others in-game}}|target=Enemy}}")
assert row["range"] == "Front"
assert row["target"] == "Enemy"
assert module.mapped_field(" Entire floor ", module.RANGE_MAP, module.UNSUPPORTED_RANGES, "range", "probe") == (None, "射程暂不支持")
assert module.mapped_field(" Wall ", module.TARGET_MAP, module.UNSUPPORTED_TARGETS, "target", "probe") == (None, "目标暂不支持")
for value, supported, unsupported, field in (("Future range", module.RANGE_MAP, module.UNSUPPORTED_RANGES, "range"), ("Future target", module.TARGET_MAP, module.UNSUPPORTED_TARGETS, "target")):
    try:
        module.mapped_field(value, supported, unsupported, field, "probe")
    except module.ImportFailure as error:
        assert "未知" in str(error)
    else:
        raise AssertionError(f"unknown {field} value was silently accepted")
`;
  const result = spawnSync('python', ['-I', '-c', python], { cwd: repoRoot, encoding: 'utf8', timeout: 15000 });
  assertImporterSucceeded(result, 'pure parser probe');
});

test('图鉴正式静态产物覆盖160种，保留旧名单、25招原文字节及全局PP一致', () => {
  const rosterFile = path.join(repoRoot, 'src', 'data', 'roster.json');
  const moveFile = path.join(repoRoot, 'src', 'data', 'pmd-moves.json');
  const roster = readJson(rosterFile);
  const moveDoc = readJson(moveFile);
  assertLegacyAndRosterArtifacts(roster, moveDoc, 'production');
  assertOldMoveBytes(moveFile, 'production');
});

test('离线导入可重复、计数闭合、抽检官方行，错误SHA不产生文件', { skip: missingSnapshots.length ? `快照缺失，跳过离线再生成：${missingSnapshots.join(', ')}` : false }, () => {
  assert.ok(fs.existsSync(importerPath), `missing importer ${importerPath}`);
  fs.mkdirSync(scratchRoot, { recursive: true });
  const testRoot = fs.mkdtempSync(path.join(scratchRoot, 'run-'));
  // Keep test-created outputs under the ignored project scratch directory for inspection.

  const outA = path.join(testRoot, 'out-a');
  const outB = path.join(testRoot, 'out-b');
  const resultA = runImporter(snapshotRoot, outA);
  assertImporterSucceeded(resultA, 'first import');
  const resultB = runImporter(snapshotRoot, outB);
  assertImporterSucceeded(resultB, 'second import');

  const filesA = listFiles(outA);
  const filesB = listFiles(outB);
  assert.deepEqual(filesA, filesB, 'same snapshot must produce the same output file set');
  assert.ok(filesA.length > 0, 'import must produce files');
  for (const relative of filesA) {
    assert.deepEqual(fs.readFileSync(path.join(outA, relative)), fs.readFileSync(path.join(outB, relative)), `output bytes differ: ${relative}`);
  }

  const generated = loadOutput(outA);
  assertLegacyAndRosterArtifacts(generated.roster, generated.moveDoc, outA);
  assertOldMoveBytes(path.join(outA, 'src', 'data', 'pmd-moves.json'), 'isolated import');
  for (const filename of ['roster.json', 'pmd-moves.json', 'names-zh.json']) {
    const formal = normalizeGitNewlines(fs.readFileSync(path.join(repoRoot, 'src', 'data', filename), 'utf8'));
    const regenerated = normalizeGitNewlines(fs.readFileSync(path.join(outA, 'src', 'data', filename), 'utf8'));
    assert.equal(regenerated, formal, `isolated ${filename} must match the formal generated artifact`);
  }

  const showdown = path.join(snapshotRoot, 'showdown');
  const pokedex = readJson(path.join(showdown, 'pokedex.json'));
  const learnsets = readJson(path.join(showdown, 'learnsets.json'));
  const wiki = readJson(path.join(snapshotRoot, 'pmd', 'wiki-2026-10-30.json'));
  const expected = inputSelection(pokedex, learnsets);
  assert.deepEqual([...new Set(generated.roster.species.map(entry => entry.id))].sort(), expected.speciesIds, 'imported species IDs must match the input selection');
  for (const entry of generated.roster.species) {
    assert.equal(entry.learnsetGen, expected.selectedGeneration.get(entry.id), `${entry.id} selected learnset generation`);
  }
  const generatedById = new Map(generated.roster.species.map(entry => [entry.id, entry]));
  const oldSpeciesIds = new Set(fixture.legacySpecies.map(entry => entry.id));
  for (const id of expected.speciesIds.filter(speciesId => !oldSpeciesIds.has(speciesId))) {
    const entry = generatedById.get(id);
    assert.deepEqual(entry.kit.map(item => item.move), expectedNewKit(id, expected.selectedGeneration.get(id), learnsets, generated.moveDoc), id + " kit must use the two earliest unique level-up moves and replace both non-damaging moves when possible");
    assert.equal(entry.maxHp, 12 + Math.floor(pokedex[id].baseStats.hp / 5), id + " maxHp formula");
    assert.equal(entry.starter, false, id + " starter flag");
  }
  assert.equal(expected.gen1Moves.size, 513, 'generation-one learnset union from the fixed snapshot');
  assert.equal(expected.allMoves.size, 520, '160-species learnset union from the fixed snapshot');
  const outputMoveIds = new Set(Object.keys(generated.moveDoc.moves));
  assert.deepEqual(generated.summary.learnsetGenerationCounts, expected.gen1GenerationCounts, 'reported generation counts must match the 151 input species');

  const totals = generated.summary.totals;
  for (const [field, value] of Object.entries({ legacySpecies: 23, generation1Species: 151, extraSpecies: 9, species: 160, learnsetMoves: expected.allMoves.size, oldOfficialConsistencyChecks: 23, unavailableSpecies: 5 })) {
    assert.equal(totals[field], value, `summary.totals.${field}`);
  }
  const admitted = sumCounts(generated.summary.admissionCounts, admissionKeys, "admissionCounts");
  const excluded = sumCounts(generated.summary.exclusionCounts, exclusionKeys, "exclusionCounts");
  assert.equal(admitted, totals.admittedMoves, "admitted categories must sum to admittedMoves");
  assert.equal(excluded, totals.ruleExcludedMoves, "rule exclusion categories must sum to ruleExcludedMoves");
  assert.equal(excluded, totals.excludedMoves, "excludedMoves must reflect rule-based exclusions");
  const pendingIds = generated.summary.pendingReview.map(entry => entry.id).sort();
  assert.equal(generated.summary.pendingReviewCount, pendingIds.length, "pending review total");
  assert.equal(totals.pendingReviewMoves, pendingIds.length, "summary pending review total");
  assert.deepEqual(pendingIds, ["futuresight", "hiddenpower", "knockoff", "strength", "vitalthrow", "wrap"], "fixed snapshot items requiring a specification decision");
  assert.equal(totals.notAdmittedMoves, excluded + pendingIds.length, "all non-admitted moves must be explained as rule exclusions or pending review");
  assert.equal(admitted + excluded + pendingIds.length, expected.allMoves.size, "admitted moves, rule exclusions, and explicitly pending moves must close the learnset union");
  assert.equal([...expected.allMoves].filter(id => outputMoveIds.has(id)).length, admitted, "move table membership must match admitted move count");
  assert.equal(totals.moveTableMoves, outputMoveIds.size, "move table total must match its generated entries");
  assert.deepEqual([...outputMoveIds].filter(id => !expected.allMoves.has(id)), [], "move table must contain no move outside the selected learnset union");
  for (const id of pendingIds) assert.match(generated.exceptions, new RegExp("\\b" + id + "\\b", "i"), "exceptions must identify pending move " + id);

  for (const id of generationOneIds) {
    assert.match(generated.exceptions, new RegExp(`\\b${id}\\b`, 'i'), `exceptions must identify unavailable species ${id}`);
  }
  assert.match(generated.exceptions, /暂不出场/, 'exceptions must explain the unavailable species status');
  assert.equal(assertOfficialRows(generated.moveDoc, wiki), 23);

  const badInput = path.join(testRoot, 'bad-input');
  copySnapshotInputs(badInput);
  fs.appendFileSync(path.join(badInput, 'pmd', 'wiki-2026-10-30.json'), '\n', 'utf8');
  const badOut = path.join(testRoot, 'bad-sha-output');
  const badResult = runImporter(badInput, badOut);
  assert.notEqual(badResult.status, 0, 'modified snapshot must be rejected');
  assert.match(`${badResult.stdout}\n${badResult.stderr}`, /sha|校验|hash/i, 'failure must identify the snapshot checksum mismatch');
  assert.deepEqual(listFiles(badOut), [], 'checksum failure must write no output files');
});