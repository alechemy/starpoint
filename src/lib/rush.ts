import { Player, PlayerRushEvent, RushEventBattleType, UserRushEventEndlessBattleMyRankingPartyMemberListItem, UserRushEventEndlessBattleRanking, UserRushEventPlayedPartyList } from "../data/types";
import { getPlayerIdFromRushEventEndlessRankSync, getPlayerRushEventPlayedPartiesSync, getPlayerRushEventSync, getPlayerSync, serializePlayerRushEventPlayedParty } from "../data/wdfpData";
import { SerializedPlayerRushEventPlayedPartyList, SerializedPlayerRushEventPlayedParties } from "./types";

/**
 * Gets all of a player's played parties, serializes them into client formant, and organizes them by their RushEventBattleType.
 * 
 * @param playerId The ID of the player.
 * @param eventId The ID of the rush event.
 * @returns The serialized parties organized by type.
 */
export function getSerializedPlayerRushEventPlayedPartiesSync(
    playerId: number,
    eventId: number
): SerializedPlayerRushEventPlayedParties {
    // get played parties
    const playedParties = getPlayerRushEventPlayedPartiesSync(playerId, eventId)

    // convert played parties to the expected client format
    const rushBattlePlayedPartyList: SerializedPlayerRushEventPlayedPartyList = {}
    const endlessBattlePlayedPartyList: SerializedPlayerRushEventPlayedPartyList = {}

    for (const party of playedParties) {
        const record = party.battleType === RushEventBattleType.FOLDER ? rushBattlePlayedPartyList : endlessBattlePlayedPartyList;
        record[party.round] = serializePlayerRushEventPlayedParty(party)
    }
    
    // return parties
    return {
        folderParties: rushBattlePlayedPartyList,
        endlessParties: endlessBattlePlayedPartyList
    }
}

/**
 * Converts player data & rush event data into the format that the client expects for rush event endless battle rankings.
 * 
 * @param playerId The ID of the player.
 * @param eventId The ID of the rush event.
 * @param playerData Existing data to use instead of fetching brand new data.
 * @returns A UserRushEventEndlessBattleRanking object or null.
 */
export function getPlayerRushEventEndlessBattleRankingSync(
    playerId: number,
    eventId: number,
    useData?: {
        playerData?: Player,
        rushEventData?: PlayerRushEvent,
        rankNumber?: number
    }
): UserRushEventEndlessBattleRanking | null {

    const playerData = useData?.playerData === undefined ? getPlayerSync(playerId) : useData?.playerData
    if (playerData === null) return null;

    const rushEventData = useData?.rushEventData === undefined ? getPlayerRushEventSync(playerId, eventId) : useData?.rushEventData
    if (rushEventData === null) return null;

    const bestRound = rushEventData.endlessBattleMaxRound
    const bestTime = rushEventData.endlessBattleMaxRoundTime
    const endlessCharacterIds = rushEventData.endlessBattleMaxRoundCharacterIds
    const endlessCharacterEvolutionImgLevel = rushEventData.endlessBattleMaxRoundCharacterEvolutionImgLvls 
    if (bestRound === null || bestTime === null || endlessCharacterIds === null || endlessCharacterEvolutionImgLevel === null)
        return null;

    // build party member list
    const partyMemberList: UserRushEventEndlessBattleMyRankingPartyMemberListItem[] = []
    for (let n = 0; n < endlessCharacterIds.length; n++) {
        const characterId = endlessCharacterIds[n]
        if (characterId !== null) {
            partyMemberList.push({
                character_id: characterId,
                evolution_img_level: endlessCharacterEvolutionImgLevel[n] ?? 0
            })
        }
    }

    return {
        best_round: bestRound,
        elapsed_time_ms: bestTime,
        name: playerData.name,
        party_member_list: partyMemberList,
        rank_number: useData?.rankNumber ?? 0,
        user_rank: 215
    }
}

/**
 * Gets the played party list for the player currently at a rank in an endless battle leaderboard for a rush event.
 * 
 * @param rank The rank of the player.
 * @param eventId The ID of the rush event.
 * @returns A serialized player rush event played party list or null.
 */
export function getRushEventEndlessBattleRankPlayedPartyListSync(
    rank: number,
    eventId: number
): SerializedPlayerRushEventPlayedPartyList | null {
    // Get the ID of the player who is currently at rank [rank].
    const playerId = getPlayerIdFromRushEventEndlessRankSync(rank, eventId);
    if (playerId === null) return null;

    // get the played party list
    const parties = getSerializedPlayerRushEventPlayedPartiesSync(playerId, eventId);

    return parties.endlessParties;
}