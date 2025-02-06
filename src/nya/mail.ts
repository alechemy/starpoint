export interface Mail_ {
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

export interface Mail {
    "subject"?: string,
    "description"?: string,
    "reason_id"?: number,
    "type": number,
    "type_id"?: number,
    "number": number,
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

const SpecialMails: Mail_[] = [
    {
        "id": SPECIAL_MAIL_ID.BREAD_1500,
        "create_time": "2020-01-01 12:00:00",
        "reason_id": 1,
        "receive_time": "0000-00-00 00:00:00",
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
        "reason_id": 1,
        "receive_time": "0000-00-00 00:00:00",
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
        "reason_id": 1,
        "receive_time": "0000-00-00 00:00:00",
        "reward_limit_time": "2099-01-01 12:00:00",
        "reward_period_limited": false,
        "type": MAIL_TYPE.POOL_EXP,
        "number": 1500,
        "subject": "Exp * 1500",
        "description": "^W^",
    },
]

let MailIdCounter = 10000000
const CachedMails: Record<number, Mail_[]> = {}


const date2str = (date: Date) => {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
}

export const SendMail = (player_id: number, mail: Mail) => {
    if (!CachedMails[player_id]) CachedMails[player_id] = []
    CachedMails[player_id].push({
        "id": MailIdCounter++,
        "create_time": date2str(new Date()),
        "reason_id": 1,
        "receive_time": "0000-00-00 00:00:00",
        "reward_limit_time": "2099-01-01 12:00:00",
        "reward_period_limited": false,
        ...mail,
    })
}

export const GetMails = (player_id: number) => SpecialMails.concat(CachedMails[player_id] || [])

export const ProcessMail = (player_id: number, mail_id: number) => {
    switch (mail_id) {
        case SPECIAL_MAIL_ID.BREAD_1500:
            // ...
    }
}