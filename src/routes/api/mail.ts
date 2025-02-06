// Handles mail.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { generateDataHeaders } from "../../utils";
import { ClientError, viewer_id_to_player_id } from "../../nya/utils";
import { GetMails } from "../../nya/mail";

interface IndexBody {
    api_count: number,
    viewer_id: number,
    app_secret: string,
    current_page: number,
    app_admin: string
}

const routes = async (fastify: FastifyInstance) => {
    fastify.post("/index", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as IndexBody

        let playerId: number
        try{
            playerId = await viewer_id_to_player_id(body.viewer_id);
        } catch (e) {
            if (e instanceof ClientError) {
                return reply.status(400).send({
                    "error": "Bad Request",
                    "message": e.message
                });
            }
            throw e;
        }
        
        const mails = GetMails(playerId);


        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({
                viewer_id: body.viewer_id
            }),
            "data": {
                "mail": mails,
                "total_count": mails.length,
            }
        })
    })
}

export default routes;