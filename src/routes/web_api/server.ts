import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { setServerTime } from "../../utils";
import { givePlayerCharacterSync } from "../../lib/character";
import { givePlayerEquipmentSync } from "../../lib/equipment";

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
            const time = new Date(newTime + ".000Z")

            setServerTime(time)

        } catch (error) { }

        return reply.redirect(`/`);
    })

    fastify.get("/give_chara", async (request: FastifyRequest, reply: FastifyReply) => {
        const q = (request.query as { playerId?: string, characterId?: string });
        if (!q.playerId || !q.characterId) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid query parameters."
        });

        const playerId = parseInt(q.playerId);
        const characterId = parseInt(q.characterId);
        if (isNaN(playerId) || isNaN(characterId)) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid query parameters."
        });

        const giveResult = givePlayerCharacterSync(playerId, characterId);
        if (!giveResult) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Could not give player character."
        });

        // return reply.redirect(`/`);
        return reply.send({
            "error": "Success",
            "message": "Operation successful."
        });
    })

    fastify.get("/give_equipment", async (request: FastifyRequest, reply: FastifyReply) => {
        const q = (request.query as { playerId?: string, equipmentId?: string, amount?: string });
        if (!q.playerId || !q.equipmentId) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid query parameters."
        });

        const playerId = parseInt(q.playerId);
        const equipmentId = parseInt(q.equipmentId);
        if (isNaN(playerId) || isNaN(equipmentId)) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid query parameters."
        });

        let amount = 1;
        if (q.amount) {
            amount = parseInt(q.amount);
            if (isNaN(amount)) return reply.status(400).send({
                "error": "Bad Request",
                "message": "Invalid query parameters."
            });
        }

        const giveResult = givePlayerEquipmentSync(playerId, equipmentId, amount);
        if (!giveResult) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Could not give player equipment."
        });

        // return reply.redirect(`/`);
        return reply.send({
            "error": "Success",
            "message": "Operation successful."
        });
    })
}

export default routes;