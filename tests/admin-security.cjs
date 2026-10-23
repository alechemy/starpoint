const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const appRoot = process.cwd();

test('operator mutation tools require explicit authorization and safe requests', async t => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'starpoint-admin-'));
    const previousToken = process.env.STARPOINT_ADMIN_TOKEN;
    const token = 'fixture-admin-token';
    let database;
    let app;
    process.chdir(temporaryRoot);
    try {
        const data = require(path.join(appRoot, 'out/data/wdfpData.js'));
        const characters = require(path.join(appRoot, 'out/lib/character.js'));
        const mail = require(path.join(appRoot, 'out/nya/mail.js'));
        const { registerErrorHandlers } = require(path.join(appRoot, 'out/nya/httpErrors.js'));
        const { pack, unpack } = require('msgpackr');
        database = require(path.join(appRoot, 'out/data/index.js')).default(0);
        assert.equal(database.name, path.join(temporaryRoot, '.database/wdfp_data.db'));
        const account = await data.insertAccount({ appId: 'admin-test', idpAlias: 'admin-test', idpCode: 'admin-test', idpId: 'admin-test', status: 'test' });
        const player = data.insertDefaultPlayerSync(account.id);
        characters.givePlayerCharacterSync(player.id, 111001);
        app = require('fastify')();
        let legacyBodyParses = 0;
        app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_, body, done) => {
            legacyBodyParses++;
            try { done(null, unpack(Buffer.from(body, 'base64'))); }
            catch (error) { done(error); }
        });
        registerErrorHandlers(app);
        app.register(require(path.join(appRoot, 'out/routes/web_api/server.js')).default, { prefix: '/admin' });
        app.register(require(path.join(appRoot, 'out/routes/web/index.js')).default);
        await app.ready();
        const grant = { playerId: player.id, type: 'item', typeId: 1, number: 3 };
        const boost = { playerId: player.id, characterId: 111001, status: 7, ability1: 21, ability2: 22 };
        async function post(url, payload, authorization) {
            return app.inject({ method: 'POST', url, payload, headers: authorization ? { authorization } : {} });
        }

        await t.test('tools are disabled until a server token is configured', async () => {
            delete process.env.STARPOINT_ADMIN_TOKEN;
            for (const [url, body] of [['/admin/give', grant], ['/admin/exboost', boost]]) {
                const response = await post(url, body, `Bearer ${token}`);
                assert.equal(response.statusCode, 503);
                assert.equal(response.headers['cache-control'], 'no-store');
            }
            assert.equal(mail.GetMails(player.id).length, 0);
        });

        await t.test('missing and incorrect credentials cannot mutate state', async () => {
            process.env.STARPOINT_ADMIN_TOKEN = token;
            const before = data.getPlayerCharacterSync(player.id, 111001);
            for (const authorization of [undefined, 'Bearer incorrect', 'Basic fixture', 'Bearer fixture-admin-token-extra']) {
                assert.equal((await post('/admin/give', grant, authorization)).statusCode, 401);
                assert.equal((await post('/admin/exboost', boost, authorization)).statusCode, 401);
            }
            assert.deepEqual(data.getPlayerCharacterSync(player.id, 111001), before);
            assert.equal(mail.GetMails(player.id).length, 0);
        });

        await t.test('GET requests and cross-origin preflights cannot invoke mutation tools', async () => {
            const before = data.getPlayerCharacterSync(player.id, 111001);
            for (const endpoint of ['give', 'exboost']) {
                const get = await app.inject({ method: 'GET', url: `/admin/${endpoint}?playerId=${player.id}&number=3`, headers: { authorization: `Bearer ${token}` } });
                assert.equal(get.statusCode, 404);
                const preflight = await app.inject({
                    method: 'OPTIONS', url: `/admin/${endpoint}`,
                    headers: { origin: 'https://untrusted.invalid', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' }
                });
                assert.equal(preflight.statusCode, 404);
                assert.equal(preflight.headers['access-control-allow-origin'], undefined);
            }
            assert.deepEqual(data.getPlayerCharacterSync(player.id, 111001), before);
            assert.equal(mail.GetMails(player.id).length, 0);
        });

        await t.test('authorized grants validate quantities and EX-boost catalog IDs', async () => {
            for (const number of [0, -1, 1.5, '3']) {
                assert.equal((await post('/admin/give', { ...grant, number }, `Bearer ${token}`)).statusCode, 400);
            }
            assert.equal((await post('/admin/give', { ...grant, type: 'chara', typeId: 999999999 }, `Bearer ${token}`)).statusCode, 400);
            assert.equal(mail.GetMails(player.id).length, 0);
            const response = await post('/admin/give', grant, `bearer ${token}`);
            assert.equal(response.statusCode, 200);
            assert.equal(mail.GetMails(player.id).length, 1);
            assert.equal(data.getPlayerItemSync(player.id, 1), null);
            const before = data.getPlayerCharacterSync(player.id, 111001);
            for (const body of [{ ...boost, status: 999999999 }, { ...boost, ability1: -1 }, { ...boost, ability2: 999999999 }]) {
                assert.equal((await post('/admin/exboost', body, `Bearer ${token}`)).statusCode, 400);
            }
            assert.deepEqual(data.getPlayerCharacterSync(player.id, 111001), before);
            assert.equal((await post('/admin/exboost', boost, `Bearer ${token}`)).statusCode, 200);
            assert.deepEqual(data.getPlayerCharacterSync(player.id, 111001).exBoost, { statusId: 7, abilityIdList: [21, 22] });
        });

        await t.test('authorized non-JSON requests are rejected before the production legacy parser', async () => {
            const before = mail.GetMails(player.id).length;
            for (const [url, body] of [['/admin/give', grant], ['/admin/exboost', boost]]) {
                const response = await app.inject({
                    method: 'POST', url,
                    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
                    payload: pack(body).toString('base64')
                });
                assert.equal(response.statusCode, 415);
            }
            assert.equal(legacyBodyParses, 0);
            assert.equal(mail.GetMails(player.id).length, before);
            const valid = await app.inject({
                method: 'POST', url: '/admin/give',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
                payload: JSON.stringify(grant)
            });
            assert.equal(valid.statusCode, 200);
        });

        await t.test('player pages escape stored and reflected markup before showing credential inputs', async () => {
            const name = '$&{{uploadError}}<img src=x onerror="fixtureName()">';
            const comment = "<svg onload='fixtureComment()'>";
            const error = '<script>fixtureError()</script>';
            data.updatePlayerSync({ id: player.id, name, comment });
            const detail = await app.inject({ method: 'GET', url: `/player/${player.id}?error=${encodeURIComponent(error)}` });
            assert.equal(detail.statusCode, 200);
            assert.ok(detail.body.includes('id="admin-token"'));
            for (const raw of [name, comment, error]) assert.equal(detail.body.includes(raw), false);
            assert.ok(detail.body.includes('$&amp;{{uploadError}}&lt;img src=x onerror=&quot;fixtureName()&quot;&gt;'));
            assert.ok(detail.body.includes('&lt;svg onload=&#39;fixtureComment()&#39;&gt;'));
            assert.ok(detail.body.includes('&lt;script&gt;fixtureError()&lt;/script&gt;'));
            const list = await app.inject({ method: 'GET', url: '/player/' });
            assert.equal(list.statusCode, 200);
            assert.equal(list.body.includes(name), false);
            assert.ok(list.body.includes('$&amp;{{uploadError}}&lt;img'));
        });
    } finally {
        if (previousToken === undefined) delete process.env.STARPOINT_ADMIN_TOKEN;
        else process.env.STARPOINT_ADMIN_TOKEN = previousToken;
        if (app) await app.close();
        if (database) database.close();
        process.chdir(appRoot);
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test('error logging omits request credentials, raw paths and exception messages', async () => {
    const { registerErrorHandlers } = require(path.join(appRoot, 'out/nya/httpErrors.js'));
    const { ClientError } = require(path.join(appRoot, 'out/nya/utils.js'));
    const app = require('fastify')();
    const secret = 'fixture-secret-must-not-be-logged';
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => logs.push(args);
    console.error = (...args) => logs.push(args);
    try {
        registerErrorHandlers(app);
        app.post('/failure/:opaque', async () => { throw new Error(secret); });
        app.post('/invalid', async () => { throw new ClientError(secret); });
        const failure = await app.inject({ method: 'POST', url: `/failure/${secret}?token=${secret}`, headers: { authorization: `Bearer ${secret}` }, payload: { app_secret: secret, access_token: secret } });
        assert.equal(failure.statusCode, 500);
        assert.equal(failure.body.includes(secret), false);
        const invalid = await app.inject({ method: 'POST', url: '/invalid', payload: { token: secret } });
        assert.equal(invalid.statusCode, 400);
        assert.equal(invalid.body.includes(secret), false);
        const missing = await app.inject({ method: 'POST', url: `/unknown/${secret}?token=${secret}`, payload: { token: secret } });
        assert.equal(missing.statusCode, 404);
        const serialized = JSON.stringify(logs);
        assert.equal(serialized.includes(secret), false);
        assert.equal(serialized.includes('/failure/:opaque'), true);
        assert.equal(logs.length, 3);
    } finally {
        console.log = originalLog;
        console.error = originalError;
        await app.close();
    }
});
