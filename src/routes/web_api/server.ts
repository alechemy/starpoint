import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { setServerTime } from "../../utils";
import { SendMail, MAIL_TYPE } from "../../nya/mail";
import { getPlayerCharacterSync, updatePlayerCharacterSync } from "../../data/wdfpData";
import { getCharacterDataSync } from "../../lib/assets";
import { requireAdmin } from "../../nya/admin";
import exStatus from "../../../assets/ex_status.json";
import exAbility from "../../../assets/ex_ability.json";

const statusIds = new Set([0, ...Object.values(exStatus).flat()]);
const abilityIds = new Set([0, ...Object.values(exAbility).flat()]);

interface TimeQuery {
    time: string | undefined
}

const routes = async (fastify: FastifyInstance) => {

    fastify.get("/resetTime", async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // convert string to date
            setServerTime(null)
        } catch (error) { }

        return reply.redirect(`/`);
    })

    fastify.get("/time", async (request: FastifyRequest, reply: FastifyReply) => {
        const newTime = (request.query as TimeQuery).time
        if (!newTime) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid query parameters."
        })

        try {
          // convert string to date
          const date = new Date(newTime);

          if (isNaN(date.getTime())) {
            console.error("Invalid date string:", newTime);
            return null;
          }

          setServerTime(new Date(date.toISOString()));
        } catch (error) { }

        return reply.redirect(`/`);
    })

    fastify.post("/exboost", { onRequest: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
        const q = (request.body ?? {}) as { playerId: number, characterId: number, status: number, ability1: number, ability2: number };
        const { playerId, characterId, status } = q;
        const ability = [q.ability1, q.ability2];
        if (![playerId, characterId].every(id => Number.isSafeInteger(id) && id > 0)
            || !Number.isSafeInteger(status) || !statusIds.has(status)
            || ability.some(id => !Number.isSafeInteger(id) || !abilityIds.has(id))) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid player, character or EX-boost IDs."
        });

        const characterData = getPlayerCharacterSync(playerId, characterId)
        if (characterData === null) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Player does not own character."
        })

        updatePlayerCharacterSync(playerId, characterId, {
            exBoost: {
                statusId: status,
                abilityIdList: ability
            }
        })

        return reply.send({
            "error": "Success",
            "message": "Operation successful."
        });
    })

    fastify.post("/give", { onRequest: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
        const q = (request.body ?? {}) as { playerId: number, type: string, typeId: number, number?: number };
        const { playerId, typeId } = q;
        const number = q.number ?? 1;
        if (![playerId, typeId, number].every(value => Number.isSafeInteger(value) && value > 0)
            || (q.type === "chara" && getCharacterDataSync(typeId) === null)) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid grant parameters."
        });

        switch (q.type) {
            case "chara":
                SendMail(playerId, {
                    subject: "Give Character",
                    description: "From Web API",
                    type: MAIL_TYPE.CHARACTER,
                    type_id: typeId,
                    number: number
                })
                break;
            case "equip":
                SendMail(playerId, {
                    subject: "Give Equipment",
                    description: "From Web API",
                    type: MAIL_TYPE.EQUIPMENT,
                    type_id: typeId,
                    number: number
                })
                break;
            case "item":
                SendMail(playerId, {
                    subject: "Give Item",
                    description: "From Web API",
                    type: MAIL_TYPE.ITEM,
                    type_id: typeId,
                    number: number
                })
                break;
            default:
                return reply.status(400).send({
                    "error": "Bad Request",
                    "message": "Invalid query parameters."
                });
        }

        return reply.send({
            "error": "Success",
            "message": "Operation successful."
        });
    });
}

export default routes;