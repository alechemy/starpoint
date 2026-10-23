const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const appRoot = process.cwd();

test('login only resumes unfinished opening tutorials', async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'starpoint-tutorial-'));
    let database;
    process.chdir(temporaryRoot);
    try {
        const data = require(path.join(appRoot, 'out/data/wdfpData.js'));
        const { getClientSerializedData } = require(path.join(appRoot, 'out/data/utils.js'));
        database = require(path.join(appRoot, 'out/data/index.js')).default(0);
        assert.equal(database.name, path.join(temporaryRoot, '.database/wdfp_data.db'));
        const account = await data.insertAccount({
            appId: 'tutorial-test', idpAlias: 'tutorial-test', idpCode: 'tutorial-test',
            idpId: 'tutorial-test', status: 'test'
        });
        const player = data.insertDefaultPlayerSync(account.id);
        data.insertPlayerQuestProgressSync(player.id, 1, { questId: 1008004, finished: true });
        const progress = data.getPlayerQuestProgressSync(player.id);
        for (const [step, skipped, active] of [
            [0, false, true], [1, false, true], [15, false, true], [16, false, true],
            [17, false, false], [18, false, false],
            [0, true, true], [4, true, true], [5, true, true],
            [6, true, false], [7, true, false], [null, false, false]
        ]) {
            data.updatePlayerSync({ id: player.id, tutorialStep: step, tutorialSkipFlag: skipped });
            const before = data.getPlayerSync(player.id);
            const serialized = getClientSerializedData(player.id, { viewerId: 0 });
            if (active) {
                assert.equal(serialized.user_tutorial.tutorial_step, step);
                assert.equal(serialized.user_tutorial.skip_flag, skipped);
            } else {
                assert.equal(serialized.user_tutorial, null, `step=${step}, skipped=${skipped}`);
            }
            assert.deepEqual(data.getPlayerSync(player.id), before);
            assert.deepEqual(data.getPlayerQuestProgressSync(player.id), progress);
        }
        data.insertPlayerTriggeredTutorialSync(player.id, 12);
        data.updatePlayerSync({ id: player.id, tutorialStep: 0 });
        assert.equal(getClientSerializedData(player.id, { viewerId: 0 }).user_tutorial, null);
    } finally {
        if (database) database.close();
        process.chdir(appRoot);
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});
