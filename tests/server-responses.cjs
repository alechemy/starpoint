const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const appRoot = process.cwd();

test('server responses preserve rewards and saved progression', async t => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'starpoint-responses-'));
    let database;
    let app;
    process.chdir(temporaryRoot);
    try {
        const data = require(path.join(appRoot, 'out/data/wdfpData.js'));
        const serialization = require(path.join(appRoot, 'out/data/utils.js'));
        const clock = require(path.join(appRoot, 'out/utils.js'));
        const characters = require(path.join(appRoot, 'out/lib/character.js'));
        const equipment = require(path.join(appRoot, 'out/lib/equipment.js'));
        const assets = require(path.join(appRoot, 'out/lib/assets.js'));
        const gacha = require(path.join(appRoot, 'out/lib/gacha.js'));
        const rareRewards = require(path.join(appRoot, 'assets/rare_score_reward.json'));
        const { pack, unpack } = require('msgpackr');
        database = require(path.join(appRoot, 'out/data/index.js')).default(0);
        assert.equal(database.name, path.join(temporaryRoot, '.database/wdfp_data.db'));
        app = require('fastify')();
        app.addHook('onSend', (_, reply, payload, done) => {
            done(null, reply.getHeader('content-type') === 'application/x-msgpack' ? pack(payload).toString('base64') : payload);
        });
        for (const [prefix, file] of [
            ['/battle', 'singleBattleQuest'], ['/expod', 'expod'],
            ['/equipment', 'equipment'], ['/character', 'character']
        ]) {
            app.register(require(path.join(appRoot, 'out/routes/api', file + '.js')).default, { prefix });
        }
        await app.ready();
        let sequence = 0;
        async function createPlayer() {
            const id = 'responses-' + (++sequence);
            const account = await data.insertAccount({
                appId: id, idpAlias: id, idpCode: id, idpId: id, status: 'test'
            });
            const player = data.insertDefaultPlayerSync(account.id);
            const session = await data.generateViewerIdSession(account.id);
            return { id: player.id, viewer: Number(session.token) };
        }
        async function post(url, player, body, status = 200) {
            const response = await app.inject({
                method: 'POST', url,
                payload: { viewer_id: player.viewer, api_count: 1, ...body }
            });
            assert.equal(response.statusCode, status, `${url} status`);
            return status === 200 ? unpack(Buffer.from(response.body, 'base64')).data : response.json();
        }
        async function finish(player, category, questId) {
            await post('/battle/start', player, {
                quest_id: questId, category, party_id: 1, play_id: 'test',
                use_boss_boost_point: false, use_boost_point: false, is_auto_start_mode: false
            });
            return post('/battle/finish', player, {
                quest_id: questId, category, elapsed_time_ms: 1000, score: 100000,
                add_mana: 0, is_accomplished: true, continue_count: 0, is_restored: false,
                statistics: {
                    clear_phase: 1,
                    party: { characters: [], unison_characters: [], equipments: [], ability_soul_ids: [] }
                }
            });
        }

        await t.test('mana rewards retain the existing mana balance and match login', async () => {
            const player = await createPlayer();
            data.updatePlayerSync({ id: player.id, freeMana: 100000, freeVmoney: 100 });
            const response = await finish(player, 10, 200022008);
            const saved = data.getPlayerSync(player.id);
            assert.equal(saved.freeMana, 122223);
            assert.equal(response.user_info.free_mana, saved.freeMana);
            assert.equal(response.user_info.exp_pool, saved.expPool);
            assert.equal(response.user_info.free_vmoney, saved.freeVmoney);
            assert.equal(serialization.getClientSerializedData(player.id, { viewerId: 0 }).user_info.free_mana, saved.freeMana);
        });

        await t.test('first-clear armaments appear in the inventory response', async () => {
            const player = await createPlayer();
            const response = await finish(player, 1, 1003002);
            const returned = response.equipment_list.find(entry => entry.equipment_id === 2010002);
            assert.ok(returned);
            assert.equal(returned.stack, 2);
            assert.equal(returned.stack, data.getPlayerEquipmentSync(player.id, 2010002).stack);
        });

        await t.test('overlapping clear and score rewards return final inventory and currency totals', async () => {
            const player = await createPlayer();
            equipment.givePlayerEquipmentSync(player.id, 2010002, 1);
            data.givePlayerItemSync(player.id, 1, 10);
            data.updatePlayerSync({ id: player.id, freeMana: 1000, expPool: 100 });
            const getQuest = assets.getQuestFromCategorySync;
            const quest = getQuest(1, 1003002);
            const fixtureGroup = 99999999;
            rareRewards[fixtureGroup] = [{ type: 1, id: 2010002, count: 2, rarity: 1 }];
            assets.getQuestFromCategorySync = (category, id) => category === 1 && id === 1003002 ? {
                ...quest,
                clearReward: { type: 0, id: 1, count: 5 },
                sPlusReward: { type: 1, id: 2010002, count: 3 },
                scoreRewardGroup: [
                    { type: 0, reward_type: 0, id: 1, count: 2 },
                    { type: 1, id: fixtureGroup, rarity: 1 }
                ]
            } : getQuest(category, id);
            try {
                const response = await finish(player, 1, 1003002);
                assert.equal(response.item_list[1], 35);
                assert.equal(response.item_list[1], data.getPlayerItemSync(player.id, 1));
                const returned = response.equipment_list.filter(entry => entry.equipment_id === 2010002);
                assert.equal(returned.length, 1);
                assert.equal(returned[0].stack, 5);
                assert.equal(returned[0].stack, data.getPlayerEquipmentSync(player.id, 2010002).stack);
                const repeated = await finish(player, 1, 1003002);
                assert.equal(repeated.item_list[1], 55);
                assert.equal(repeated.equipment_list.find(entry => entry.equipment_id === 2010002).stack, 7);
                assets.getQuestFromCategorySync = (category, id) => category === 1 && id === 1003002 ? {
                    ...quest,
                    clearReward: { type: 4, count: 50 },
                    sPlusReward: { type: 5, count: 25 },
                    scoreRewardGroup: [{ type: 0, reward_type: 5, count: 2 }]
                } : getQuest(category, id);
                const other = await createPlayer();
                data.updatePlayerSync({ id: other.id, freeMana: 1000, expPool: 100 });
                const currencyResponse = await finish(other, 1, 1003002);
                const saved = data.getPlayerSync(other.id);
                assert.equal(saved.freeMana, 1000 + quest.manaReward + 50);
                assert.equal(saved.expPool, 100 + quest.poolExpReward + 25 + 20);
                assert.equal(currencyResponse.user_info.free_mana, saved.freeMana);
                assert.equal(currencyResponse.user_info.exp_pool, saved.expPool);
            } finally {
                assets.getQuestFromCategorySync = getQuest;
                delete rareRewards[fixtureGroup];
            }
        });

        await t.test('duplicate draws return owned totals without changing animation deltas', async () => {
            for (const count of [1, 3]) {
                const player = await createPlayer();
                characters.givePlayerCharacterSync(player.id, 111001);
                data.givePlayerItemSync(player.id, 14003, 5);
                const response = gacha.rewardPlayerGachaDrawResultSync(player.id, assets.getGachaSync(101), new Map([[111001, count]]));
                assert.equal(response.items[14003], 5 + count);
                assert.equal(response.items[14003], data.getPlayerItemSync(player.id, 14003));
                assert.deepEqual(response.draw.map(draw => draw.ex_boost_item.count), Array(count).fill(1));
                assert.equal(data.getPlayerCharacterSync(player.id, 111001).stack, count);
            }
        });

        await t.test('each mana board can independently complete and claim its bond token', async () => {
            const player = await createPlayer();
            characters.givePlayerCharacterSync(player.id, 111001);
            const statuses = () => data.getPlayerCharacterSync(player.id, 111001).bondTokenList.map(token => token.status);
            const beforeTokens = data.getPlayerSync(player.id).bondToken;
            assert.deepEqual(statuses(), [0, 0]);
            data.updatePlayerCharacterBondTokenSync(player.id, 111001, { manaBoardIndex: 1, status: 1 });
            assert.deepEqual(statuses(), [1, 0]);
            const first = await post('/character/receive_bond_token', player, { character_id: 111001, mana_board_index: 1 });
            assert.deepEqual(first.character_list[0].bond_token_list.map(token => token.status), [2, 0]);
            assert.deepEqual(statuses(), [2, 0]);
            data.updatePlayerCharacterBondTokenSync(player.id, 111001, { manaBoardIndex: 2, status: 1 });
            assert.deepEqual(statuses(), [2, 1]);
            await post('/character/receive_bond_token', player, { character_id: 111001, mana_board_index: 2 });
            assert.deepEqual(statuses(), [2, 2]);
            assert.equal(data.getPlayerSync(player.id).bondToken, beforeTokens + 2);
            await post('/character/receive_bond_token', player, { character_id: 111001, mana_board_index: 1 }, 400);
            assert.equal(data.getPlayerSync(player.id).bondToken, beforeTokens + 2);
        });

        await t.test('duplicate conversion consumes its stack exactly once and rejects invalid quantities', async () => {
            const player = await createPlayer();
            characters.givePlayerCharacterSync(player.id, 111001);
            characters.givePlayerCharacterSync(player.id, 111001);
            const before = data.getPlayerSync(player.id).expPool;
            for (const number of [0, -1, 1.5]) {
                await post('/expod/stack_to_exp', player, { character_id: 111001, number }, 400);
            }
            assert.equal(data.getPlayerCharacterSync(player.id, 111001).stack, 1);
            assert.equal(data.getPlayerSync(player.id).expPool, before);
            const response = await post('/expod/stack_to_exp', player, { character_id: 111001, number: 1 });
            assert.equal(response.character_list[0].stack, 0);
            assert.equal(data.getPlayerCharacterSync(player.id, 111001).stack, 0);
            assert.equal(data.getPlayerSync(player.id).expPool, before + 10000);
            assert.equal(response.item_list[990008], 30);
            await post('/expod/stack_to_exp', player, { character_id: 111001, number: 1 }, 400);
            assert.equal(data.getPlayerSync(player.id).expPool, before + 10000);
            assert.equal(data.getPlayerItemSync(player.id, 990008), 30);
        });

        await t.test('duplicate conversion rolls back consumption and EXP if item delivery fails', async () => {
            const player = await createPlayer();
            characters.givePlayerCharacterSync(player.id, 111001);
            characters.givePlayerCharacterSync(player.id, 111001);
            const before = data.getPlayerSync(player.id).expPool;
            database.exec(`CREATE TEMP TRIGGER reject_conversion BEFORE INSERT ON players_items
                WHEN NEW.player_id = ${player.id} AND NEW.id = 990008
                BEGIN SELECT RAISE(ABORT, 'conversion fixture failure'); END`);
            try {
                await post('/expod/stack_to_exp', player, { character_id: 111001, number: 1 }, 500);
                assert.equal(data.getPlayerCharacterSync(player.id, 111001).stack, 1);
                assert.equal(data.getPlayerSync(player.id).expPool, before);
                assert.equal(data.getPlayerItemSync(player.id, 990008), null);
            } finally {
                database.exec('DROP TRIGGER reject_conversion');
            }
        });

        await t.test('full melting includes the base copy and does not re-award awakened cores', async () => {
            for (const [level, stack, existingSouls] of [[1, 0, 0], [1, 2, 3], [5, 0, 4], [5, 2, 4]]) {
                const player = await createPlayer();
                equipment.givePlayerEquipmentSync(player.id, 5010005, stack + 1);
                data.updatePlayerEquipmentSync(player.id, 5010005, { level });
                data.givePlayerItemSync(player.id, 5010005, existingSouls);
                data.givePlayerItemSync(player.id, 100000, 7);
                const response = await post('/equipment/sell_equipment', player, { equipment_list: [{ equipment_id: 5010005 }] });
                assert.equal(data.getPlayerEquipmentSync(player.id, 5010005), null);
                assert.equal(response.item_list[100000], 7 + 15 * (stack + 1));
                assert.equal(response.item_list[5010005], existingSouls + stack + 1);
                assert.equal(response.item_list[100000], data.getPlayerItemSync(player.id, 100000));
                assert.equal(response.item_list[5010005], data.getPlayerItemSync(player.id, 5010005));
            }
        });

        await t.test('EXP injection reports actual gain below and across the cap', async () => {
            const player = await createPlayer();
            characters.givePlayerCharacterSync(player.id, 111001);
            const cap = characters.characterExpCaps[5][0];
            for (const [remaining, amount, gain] of [[100, 20, 20], [10, 20, 10], [0, 20, 0], [10, 10, 10]]) {
                data.updatePlayerCharacterSync(player.id, 111001, { exp: cap - remaining });
                data.updatePlayerSync({ id: player.id, expPool: 100 });
                const response = await post('/expod/inject_exp', player, { character_id: 111001, exp: amount });
                assert.equal(response.add_exp_list[0].add_exp, gain);
                assert.equal(response.add_exp_list[0].after_exp, cap - remaining + gain);
                assert.equal(data.getPlayerCharacterSync(player.id, 111001).exp, cap - remaining + gain);
                assert.equal(response.user_info.exp_pool, 100 - gain);
                assert.equal(data.getPlayerSync(player.id).expPool, 100 - gain);
            }
        });

        await t.test('campaign boundaries retain their dates under any content-clock override', async () => {
            const player = await createPlayer();
            const start = new Date('2023-07-25T00:00:00Z');
            const end = new Date('2023-08-10T00:00:00Z');
            const previous = process.env.GAME_DATE ? new Date(process.env.GAME_DATE) : null;
            database.prepare('INSERT INTO players_start_dash_exchange_campaigns (campaign_id, gacha_id, term_index, status, period_start_time, period_end_time, player_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(1, 101, 0, 1, start.toISOString(), end.toISOString(), player.id);
            const before = data.getPlayerStartDashExchangeCampaignsSync(player.id);
            try {
                for (const contentDate of [new Date('2023-08-01T12:00:00Z'), new Date('2024-07-20T12:00:00Z'), null]) {
                    clock.setServerTime(contentDate);
                    const campaign = serialization.getClientSerializedData(player.id, { viewerId: 0 }).start_dash_exchange_campaign_list[0];
                    assert.equal(campaign.period_start_time, start.getTime() / 1000);
                    assert.equal(campaign.period_end_time, end.getTime() / 1000);
                    if (contentDate) assert.equal(clock.getServerTime(), contentDate.getTime() / 1000);
                }
                assert.deepEqual(data.getPlayerStartDashExchangeCampaignsSync(player.id), before);
            } finally {
                clock.setServerTime(previous);
            }
        });
    } finally {
        if (app) await app.close();
        if (database) database.close();
        process.chdir(appRoot);
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});
