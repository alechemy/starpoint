const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const appRoot = process.cwd();

test('fork rank and mail operations preserve earned state', async t => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'starpoint-mail-rank-'));
    const previousDebugMail = process.env.STARPOINT_DEBUG_MAIL;
    delete process.env.STARPOINT_DEBUG_MAIL;
    let database;
    let app;
    process.chdir(temporaryRoot);
    try {
        const data = require(path.join(appRoot, 'out/data/wdfpData.js'));
        const mail = require(path.join(appRoot, 'out/nya/mail.js'));
        const rank = require(path.join(appRoot, 'out/nya/player.js'));
        const { onPlayerRankUp } = require(path.join(appRoot, 'out/nya/delegates.js'));
        const ranks = require(path.join(appRoot, 'assets/player_rank.json'));
        const characters = require(path.join(appRoot, 'out/lib/character.js'));
        const { pack, unpack } = require('msgpackr');
        database = require(path.join(appRoot, 'out/data/index.js')).default(0);
        assert.equal(database.name, path.join(temporaryRoot, '.database/wdfp_data.db'));
        app = require('fastify')();
        app.addHook('onSend', (_, reply, payload, done) => done(null,
            reply.getHeader('content-type') === 'application/x-msgpack' ? pack(payload).toString('base64') : payload));
        app.register(require(path.join(appRoot, 'out/routes/api/mail.js')).default, { prefix: '/mail' });
        app.register(require(path.join(appRoot, 'out/routes/api/party.js')).default, { prefix: '/party' });
        await app.ready();
        let sequence = 0;
        async function player() {
            const name = 'mail-rank-' + (++sequence);
            const account = await data.insertAccount({ appId: name, idpAlias: name, idpCode: name, idpId: name, status: 'test' });
            const value = data.insertDefaultPlayerSync(account.id);
            const session = await data.generateViewerIdSession(account.id);
            return { id: value.id, viewer: Number(session.token) };
        }
        function queue(p, value) {
            const before = new Set(mail.GetMails(p.id).map(m => m.id));
            mail.SendMail(p.id, value);
            const added = mail.GetMails(p.id).filter(m => !before.has(m.id));
            assert.equal(added.length, 1);
            return added[0].id;
        }
        async function post(url, p, body, status = 200) {
            const response = await app.inject({ method: 'POST', url, payload: { viewer_id: p.viewer, api_count: 1, ...body } });
            assert.equal(response.statusCode, status, `${url} status`);
            if (status !== 200) return response.json();
            assert.match(response.headers['content-type'], /^application\/x-msgpack/);
            return unpack(Buffer.from(response.body, 'base64')).data;
        }

        await t.test('rank lookup selects the reached threshold at every boundary', () => {
            for (let i = 0; i < ranks.length; i++) {
                const row = ranks[i];
                assert.equal(rank.getRankByPt(row.total_rp).rank, row.rank);
                if (i > 0) assert.equal(rank.getRankByPt(row.total_rp - 1).rank, ranks[i - 1].rank);
            }
            assert.equal(rank.getRankByPt(-1).rank, 1);
            assert.equal(rank.getRankByPt(ranks.at(-1).total_rp + 1000000).rank, ranks.at(-1).rank);
        });

        await t.test('rank awards below a threshold do not restore stamina or dispatch events', async () => {
            const p = await player();
            data.updatePlayerSync({ id: p.id, rankPoint: 0, stamina: 5 });
            const value = data.getPlayerSync(p.id);
            const events = [];
            const handle = onPlayerRankUp.add((_, next) => events.push(next));
            try {
                rank.givePlayerRankPoint(value, 1);
                assert.equal(value.rankPoint, 1);
                assert.equal(value.stamina, 5);
                assert.deepEqual(events, []);
                rank.commitPlayer(value);
                assert.equal(data.getPlayerSync(p.id).rankPoint, 1);
                assert.equal(data.getPlayerSync(p.id).stamina, 5);
            } finally {
                onPlayerRankUp.remove(handle);
            }
        });

        await t.test('crossed ranks each add their stamina refill without losing overflow', async () => {
            const p = await player();
            const value = data.getPlayerSync(p.id);
            value.rankPoint = 0;
            value.stamina = 100;
            const events = [];
            const handle = onPlayerRankUp.add((_, next) => events.push(next));
            try {
                rank.givePlayerRankPoint(value, ranks[3].total_rp);
                assert.equal(value.rankPoint, ranks[3].total_rp);
                assert.equal(value.stamina, 100 + ranks[1].stamina + ranks[2].stamina + ranks[3].stamina);
                assert.deepEqual(events, [2, 3, 4]);
                events.length = 0;
                value.rankPoint = ranks.at(-1).total_rp;
                const stamina = value.stamina;
                rank.givePlayerRankPoint(value, 100);
                assert.equal(value.stamina, stamina);
                assert.deepEqual(events, []);
            } finally {
                onPlayerRankUp.remove(handle);
            }
        });

        await t.test('single and bulk claims use the game response transport and consume only requested mail', async () => {
            const p = await player();
            const first = queue(p, { type: 1, type_id: 1, number: 3 });
            const second = queue(p, { type: 1, type_id: 1, number: 4 });
            const result = await post('/mail/receive', p, { mail_id: first });
            assert.equal(result.item_list[1], 3);
            assert.equal(result.total_count, 1);
            assert.equal(result.mail_arrived, true);
            const bulk = await post('/mail/receive_all', p, { mail_ids: [second, second] });
            assert.equal(bulk.item_list[1], 7);
            assert.deepEqual(bulk.mail_ids, [second]);
            assert.equal(bulk.deleted_mail_count, 1);
            assert.equal(bulk.total_count, 0);
            assert.equal(bulk.mail_arrived, false);
            const repeated = await post('/mail/receive_all', p, { mail_ids: [second] });
            assert.equal(repeated.already_mail_count, 1);
            assert.equal(data.getPlayerItemSync(p.id, 1), 7);
            await post('/mail/receive', p, { mail_id: first }, 400);
            const word = await post('/party/check_word', p, { word: 'fixture party' });
            assert.equal(word.check_passed, true);
        });

        await t.test('failed bulk claims roll back earlier rewards and keep mail claimable', async () => {
            const p = await player();
            const good = queue(p, { type: 1, type_id: 1, number: 10 });
            const bad = queue(p, { type: 5, type_id: 999999999, number: 1 });
            for (let attempt = 0; attempt < 2; attempt++) {
                await post('/mail/receive_all', p, { mail_ids: [good, bad] }, 400);
                assert.equal(data.getPlayerItemSync(p.id, 1), null);
                assert.deepEqual(mail.GetMails(p.id).map(m => m.id), [good, bad]);
            }
            const selected = await post('/mail/receive_all', p, { mail_ids: [good] });
            assert.equal(selected.item_list[1], 10);
            assert.deepEqual(mail.GetMails(p.id).map(m => m.id), [bad]);
        });

        await t.test('late storage errors roll back currencies and items without consuming mail', async () => {
            const p = await player();
            const mana = data.getPlayerSync(p.id).freeMana;
            const first = queue(p, { type: 8, number: 25 });
            const second = queue(p, { type: 1, type_id: 1, number: 10 });
            database.exec(`CREATE TEMP TRIGGER reject_mail_item BEFORE INSERT ON players_items
                WHEN NEW.player_id = ${p.id} AND NEW.id = 1
                BEGIN SELECT RAISE(ABORT, 'mail fixture failure'); END`);
            try {
                await post('/mail/receive_all', p, { mail_ids: [first, second] }, 500);
                assert.equal(data.getPlayerSync(p.id).freeMana, mana);
                assert.equal(data.getPlayerItemSync(p.id, 1), null);
                assert.deepEqual(mail.GetMails(p.id).map(m => m.id), [first, second]);
            } finally {
                database.exec('DROP TRIGGER reject_mail_item');
            }
            await post('/mail/receive_all', p, { mail_ids: [first, second] });
            assert.equal(data.getPlayerSync(p.id).freeMana, mana + 25);
            assert.equal(data.getPlayerItemSync(p.id, 1), 10);
        });

        await t.test('duplicate-character claims report final material totals for single and bulk delivery', async () => {
            const p = await player();
            characters.givePlayerCharacterSync(p.id, 111001);
            data.givePlayerItemSync(p.id, 14003, 5);
            const first = queue(p, { type: 5, type_id: 111001, number: 2 });
            const single = await post('/mail/receive', p, { mail_id: first });
            assert.equal(single.item_list[14003], 7);
            assert.equal(single.item_list[14003], data.getPlayerItemSync(p.id, 14003));
            const item = queue(p, { type: 1, type_id: 14003, number: 4 });
            const duplicates = queue(p, { type: 5, type_id: 111001, number: 2 });
            const bulk = await post('/mail/receive_all', p, { mail_ids: [item, duplicates] });
            assert.equal(bulk.item_list[14003], 13);
            assert.equal(bulk.item_list[14003], data.getPlayerItemSync(p.id, 14003));
            assert.equal(bulk.character_list[0].stack, 4);
            const newUnit = queue(p, { type: 5, type_id: 111002, number: 1 });
            const newDuplicate = queue(p, { type: 5, type_id: 111002, number: 1 });
            const joined = await post('/mail/receive_all', p, { mail_ids: [newUnit, newDuplicate] });
            assert.equal(joined.character_list.length, 1);
            assert.equal(joined.character_list[0].entry_count, 1);
            assert.equal(joined.character_list[0].stack, 1);
        });

        await t.test('mail ownership and quantities prevent unauthorized or negative rewards', async () => {
            const owner = await player();
            const other = await player();
            const id = queue(owner, { type: 1, type_id: 1, number: 3 });
            await post('/mail/receive', other, { mail_id: id }, 400);
            const bulk = await post('/mail/receive_all', other, { mail_ids: [id] });
            assert.equal(bulk.already_mail_count, 1);
            assert.equal(data.getPlayerItemSync(other.id, 1), null);
            assert.equal(mail.GetMails(owner.id).length, 1);
            for (const number of [0, -1, 1.5, Number.NaN]) {
                assert.throws(() => mail.SendMail(owner.id, { type: 1, type_id: 1, number }));
            }
            await post('/mail/receive_all', owner, { mail_ids: [-1] }, 400);
            assert.equal(data.getPlayerItemSync(owner.id, 1), null);
        });

        await t.test('repeatable debug gifts require explicit opt-in', async () => {
            const p = await player();
            const before = data.getPlayerSync(p.id);
            assert.deepEqual(mail.GetMails(p.id), []);
            for (const id of [90000001, 90000002, 90000003]) {
                await post('/mail/receive', p, { mail_id: id }, 400);
            }
            assert.deepEqual(data.getPlayerSync(p.id), before);
            process.env.STARPOINT_DEBUG_MAIL = '1';
            try {
                assert.equal(mail.GetMails(p.id).length, 3);
                await post('/mail/receive', p, { mail_id: 90000001 });
                await post('/mail/receive', p, { mail_id: 90000001 });
                assert.equal(data.getPlayerSync(p.id).vmoney, before.vmoney + 3000);
            } finally {
                delete process.env.STARPOINT_DEBUG_MAIL;
            }
        });
    } finally {
        if (previousDebugMail === undefined) delete process.env.STARPOINT_DEBUG_MAIL;
        else process.env.STARPOINT_DEBUG_MAIL = previousDebugMail;
        if (app) await app.close();
        if (database) database.close();
        process.chdir(appRoot);
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});
