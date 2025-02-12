import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { generateDataHeaders } from "../../utils";
import { ClientError, viewer_id_to_player_id } from "../../nya/utils";
import { getPlayerSingleQuestProgressSync, insertPlayerQuestProgressSync } from "../../data/wdfpData";

const routes = async (fastify: FastifyInstance) => {
    fastify.post("/get_recent_other_player_party", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { viewer_id: number, category: number, quest_id: number };
        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({
                viewer_id: body.viewer_id
            }),
            "data": {
                "recent_other_player_party": [],
            }
        });
    })

    fastify.post("/unlock", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { viewer_id: number, category: number, quest_id: number };

        try {
            const playerId = await viewer_id_to_player_id(body.viewer_id);

            // TODO: cost item

            const questProgress = getPlayerSingleQuestProgressSync(playerId, body.category, body.quest_id);
            if (!questProgress) {
                insertPlayerQuestProgressSync(playerId, body.category, {
                    questId: body.quest_id,
                    finished: false
                })
            }

            reply.header("content-type", "application/x-msgpack")
            return reply.status(200).send({
                "data_headers": generateDataHeaders({
                    viewer_id: body.viewer_id
                }),
                "data": {}
            });
        } catch (e: any) {
            if (e instanceof ClientError) return reply.status(400).send({
                "error": "Bad Request",
                "message": e.message
            });
            throw e;
        }
    })
}

export default routes;
