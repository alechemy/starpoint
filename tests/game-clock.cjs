const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const appRoot = process.cwd();
const utilsPath = path.join(appRoot, 'out/utils.js');
const gameDate = '2024-07-20T12:00:00Z';

function loadClock(date, reset = false) {
    const env = { ...process.env };
    if (date === undefined) delete env.GAME_DATE;
    else env.GAME_DATE = date;
    return spawnSync(process.execPath, ['-e', `
        const clock = require(${JSON.stringify(utilsPath)});
        ${reset ? 'clock.setServerTime(null);' : ''}
        console.log(JSON.stringify({
            date: clock.getServerDate().toISOString(),
            seconds: clock.getServerTime(),
            header: clock.generateDataHeaders().servertime
        }));
    `], { env, encoding: 'utf8' });
}

test('each new process restores the configured content date', () => {
    for (let attempt = 0; attempt < 2; attempt++) {
        const result = loadClock(gameDate);
        assert.equal(result.status, 0, result.stderr);
        const clock = JSON.parse(result.stdout);
        assert.equal(clock.date, '2024-07-20T12:00:00.000Z');
        assert.equal(clock.seconds, Date.parse(gameDate) / 1000);
        assert.equal(clock.header, clock.seconds);
    }
});

test('an unset date retains the fork archived-content default', () => {
    const result = loadClock(undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).date, '2024-06-02T12:00:00.000Z');
});

test('resetting the override restores the real clock', () => {
    const before = Date.now();
    const result = loadClock(undefined, true);
    assert.equal(result.status, 0, result.stderr);
    const actual = Date.parse(JSON.parse(result.stdout).date);
    assert.ok(actual >= before && actual <= Date.now());
});

test('invalid or ambiguous configured dates fail at startup', () => {
    for (const date of ['', 'invalid', '2024-07-20', '2024-02-30T12:00:00Z']) {
        const result = loadClock(date);
        assert.notEqual(result.status, 0, date);
        assert.match(result.stderr, /GAME_DATE/);
    }
});

test('passive EXP uses elapsed real time while the content date is fixed', async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'starpoint-clock-'));
    let database;
    process.chdir(temporaryRoot);
    try {
        const clock = require(utilsPath);
        clock.setServerTime(new Date(gameDate));
        const data = require(path.join(appRoot, 'out/data/wdfpData.js'));
        database = require(path.join(appRoot, 'out/data/index.js')).default(0);
        assert.equal(database.name, path.join(temporaryRoot, '.database/wdfp_data.db'));
        const account = await data.insertAccount({
            appId: 'clock-test', idpAlias: 'clock-test', idpCode: 'clock-test',
            idpId: 'clock-test', status: 'test'
        });
        const player = data.insertDefaultPlayerSync(account.id);
        const now = new Date('2026-01-01T12:00:00Z');
        for (const [seconds, expected] of [[3600, 70], [59, 10], [60, 11], [-60, 10]]) {
            data.updatePlayerSync({
                id: player.id, expPool: 10,
                expPooledTime: new Date(now.getTime() - seconds * 1000)
            });
            data.collectPlayerDataPooledExpSync(data.getPlayerSync(player.id), now);
            assert.equal(data.getPlayerSync(player.id).expPool, expected, `${seconds} seconds`);
        }
        assert.equal(clock.getServerDate().toISOString(), '2024-07-20T12:00:00.000Z');
    } finally {
        if (database) database.close();
        process.chdir(appRoot);
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});
