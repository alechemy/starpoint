# Gameplay and operator controls

## Gameplay corrections

Quest rewards retain existing currency balances and return final inventory totals, including first-clear and S+ rewards. Duplicate pulls return owned EX-boost material counts while keeping the draw animation's earned amounts separate. Full armament melting includes the base copy and remaining duplicates without granting cores for previously consumed awakening copies again.

Mana-board completion and bond claims update only the selected board. Duplicate-to-EXP conversion consumes the saved duplicate and commits its rewards in one transaction. Capped EXP injection reports the actual nonnegative gain. Completed opening tutorials no longer resume on login and lock game features.

Rank lookup selects the highest threshold already reached. Stamina refills occur only when rank increases. Each crossed rank adds its refill, preserving existing overflow. Multiple-rank awards dispatch an event for each crossed rank.

## Mail claims

Single and bulk mail claims use the same base64 MessagePack transport as other game endpoints. Reward writes run in a database transaction. Failed claims leave their pending mail available and do not retain partial rewards.

`/latest/api/index.php/mail/receive_all` accepts `mail_ids`. It deduplicates the requested IDs, processes only the player's selected pending mail, and returns consumed IDs plus consumed and already-claimed counts. Omitting `mail_ids` processes all pending operator mail. An empty list processes none. Single claims reject unknown or already-claimed mail IDs.

Character rewards return final EX-boost material totals. Bulk claims merge repeated characters without losing the fields needed to show a newly joined unit.

Pending operator mail remains in session memory. Restarting discards unclaimed operator mail. Claimed rewards are saved in SQLite. The player panel labels this behavior as in-session delivery.

## Content date

Set `GAME_DATE` in the server environment to an archived content date, using `YYYY-MM-DDTHH:mm:ssZ` format. For example, `2024-06-02T12:00:00Z` selects a date within the archived content schedule. Invalid values fail at startup. Without this setting, the fork retains its June 2, 2024 content-date default.

The configured date is restored on every process start. Dashboard date changes affect the current process only. Resetting the override explicitly returns to the real clock and can leave archived banners unavailable. Passive EXP accrues from real elapsed time, and stored exchange-campaign boundaries retain their original dates.

## Debug gifts

The permanent repeatable paid-currency, mana and EXP mails are disabled by default. Set `STARPOINT_DEBUG_MAIL=1` only when those debug grants are intended. Bulk collection excludes the permanent debug entries. This setting is independent of ordinary queued operator mail.

## Grant and EX-boost tools

The player panel's grant and EX-boost tools are disabled unless `STARPOINT_ADMIN_TOKEN` is configured in the server environment. Use a long, randomly generated token. Enter it in the panel's password field when using these tools. The page does not save the token in browser storage or place it in a URL.

Both mutation endpoints require an authenticated JSON POST:

```text
POST /api/server/give
POST /api/server/exboost
Authorization: Bearer <admin token>
Content-Type: application/json
```

Grant bodies use numeric `playerId`, `typeId` and `number` fields plus a `type` of `chara`, `item` or `equip`. Quantities and IDs must be positive safe integers. Character grants must reference a catalog character. Grants queue mail and do not directly collect its rewards.

EX-boost bodies use numeric `playerId`, `characterId`, `status`, `ability1` and `ability2` fields. The player must own the character, and boost IDs must exist in the installed catalogs. Zero is accepted for clearing an assigned boost.

Missing server configuration returns 503, missing or incorrect credentials return 401, and non-JSON requests return 415 before body parsing. GET requests no longer perform these mutations. Invalid grant or boost fields return 400 without changing progression.

Player names, comments and upload errors are HTML-escaped before rendering the token-entry page. Error handlers log request method, route pattern, status and error code without copying request bodies, raw URLs or exception messages into logs.

These credentials protect the two grant/edit tools. The inherited save-import and date controls still require a loopback-only dashboard deployment. Do not expose the dashboard publicly on the strength of this token alone.

## Regression tests

Use Node.js 22 with the locked dependencies, then run:

```sh
npm ci
npm test
```

The tests compile TypeScript and exercise real handlers and persistence helpers against disposable SQLite databases. They do not require a game client, CDN download, running server or live save. Coverage includes reward totals, conversion rollback, independent board claims, campaign dates, tutorial completion, rank thresholds and overflow, selected and repeated mail claims, default-disabled debug gifts, authenticated mutations, HTML rendering and log privacy.
