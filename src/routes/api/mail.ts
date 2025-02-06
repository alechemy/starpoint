// Handles mail.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getSession } from "../../data/wdfpData";
import { generateDataHeaders } from "../../utils";
import { ClientError, viewer_id_to_player_id } from "../../nya/utils";

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

enum SPECIAL_MAIL_ID {
    BREAD_1500 = 90000001,
    MANA_1500,
    EXP_1500,
}

enum MAIL_TYPE {
    ITEM = 1, // with type_id
    PAID_VIRTUAL_MONEY = 3,
    FREE_VIRTUAL_MONEY = 4,
    CHARACTER = 5, // with type_id
    EQUIPMENT = 6, // with type_id
    STAR_CRUMB = 7,
    FREE_MANA = 8,
    POOL_EXP = 9,
    BOND_TOKEN = 10,
    BOSS_BOOST_POINT = 11,
    BOOST_POINT = 12,
    DEGREE = 13,  // with type_id
    DAILY_CHALLENGE_POINT = 14,  // with type_id
    RANK_POINT = 15,
    PERIODIC_REWARD_POINT = 16,  // with type_id
}

const SpecialMails: Mail[] = [
    {
        "id": SPECIAL_MAIL_ID.BREAD_1500,
        "create_time": "2020-01-01 12:00:00",
        "reason_id": 2,
        "receive_time": "",
        "reward_limit_time": "2099-01-01 12:00:00",
        "reward_period_limited": false,
        "type": MAIL_TYPE.PAID_VIRTUAL_MONEY,
        "number": 1500,
        "subject": "Bread * 1500",
        "description": "^W^",
    },
    {
        "id": SPECIAL_MAIL_ID.MANA_1500,
        "create_time": "2020-01-01 12:00:00",
        "reason_id": 2,
        "receive_time": "",
        "reward_limit_time": "2099-01-01 12:00:00",
        "reward_period_limited": false,
        "type": MAIL_TYPE.FREE_MANA,
        "number": 1500,
        "subject": "Mana * 1500",
        "description": "^W^",
    },
    {
        "id": SPECIAL_MAIL_ID.EXP_1500,
        "create_time": "2020-01-01 12:00:00",
        "reason_id": 2,
        "receive_time": "",
        "reward_limit_time": "2099-01-01 12:00:00",
        "reward_period_limited": false,
        "type": MAIL_TYPE.POOL_EXP,
        "number": 1500,
        "subject": "Exp * 1500",
        "description": "^W^",
    },
]

let MailIdCounter = 10000000
const CachedMails: Record<number, Mail[]> = {}
export const SendMail = (player_id: number, mail: Mail) => {
    if (!CachedMails[player_id]) CachedMails[player_id] = []
    if (!mail.id) mail.id = MailIdCounter++
    CachedMails[player_id].push(mail)
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
        
        const mails = SpecialMails.concat(CachedMails[playerId] || []);


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