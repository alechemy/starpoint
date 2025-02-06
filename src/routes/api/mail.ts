// Handles mail.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getSession } from "../../data/wdfpData";
import { generateDataHeaders } from "../../utils";

interface IndexBody {
    api_count: number,
    viewer_id: number,
    app_secret: string,
    current_page: number,
    app_admin: string
}

interface Mail {
    "id": number,
    "create_time": string,
    "description"?: string,
    "number": number,
    "reason_id": number,
    "receive_time": string,
    "reward_limit_time"?: string,
    "reward_period_limited": boolean,
    "subject"?: string,
    "type": number,
    "type_id"?: number,
}

const MAIL_ID_BREAD_1500 = 10000001

const SpecialMails: Mail[] = [
    {
        "id": MAIL_ID_BREAD_1500,
        "create_time": "2022-01-01T00:00:00Z",
        "number": 1,
        "reason_id": 1,
        "receive_time": "2022-01-01T00:00:00Z",
        "reward_period_limited": true,
        "type": 1,
        "type_id": 1,
        "subject": "Bread * 1500",
        "description": "^W^",
    },
]

const routes = async (fastify: FastifyInstance) => {
    fastify.post("/index", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as IndexBody

        const viewerId = body.viewer_id
        if (!viewerId || isNaN(viewerId)) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid request body."
        })

        const viewerIdSession = await getSession(viewerId.toString())
        if (!viewerIdSession) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid viewer id."
        })

        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({
                viewer_id: viewerId
            }),
            "data": {
                "mail": SpecialMails,
                "total_count": SpecialMails.length,
            }
        })
    })
}

export default routes;