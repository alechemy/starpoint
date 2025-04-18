import { randomInt } from "crypto";
import { clientSerializeDate } from "../data/utils";
import { getPlayerCharacterSync, getPlayerSync, givePlayerItemSync, updatePlayerSync } from "../data/wdfpData";
import { getRareScoreRewardGroup } from "./assets";
import { givePlayerCharacterSync } from "./character";
import { givePlayerEquipmentSync } from "./equipment";
import { CharacterReward, CommonScoreReward, CurrencyReward, CurrencyScoreReward, DropScoreRewardId, EquipmentItemReward, GivePlayerScoreRewardsResult, ItemScoreReward, PlayerRewardResult, RareScoreRewardGroup, Reward, RewardType, ScoreReward, ScoreRewardType } from "./types";
import { Player } from "../data/types";

/**
 * Grants a player score rewards.
 * 
 * @param playerId The ID of the player.
 * @param groupId The ID of the score reward group.
 * @param scoreRewards The score rewards inside of the group.
 * @returns A result detailing what was added/changed.
 */
export function givePlayerScoreRewardsSync(
    playerId: number,
    groupId?: number,
    scoreRewards?: ScoreReward[],
    boostPointUsed: boolean = false,
): GivePlayerScoreRewardsResult {

    const dropScoreRewardIds: DropScoreRewardId[] = []
    const dropRareRewardIds: DropScoreRewardId[] = []

    let mana = 0
    let vmoney = 0
    let expPool = 0
    let joinedCharacterIdList: number[] = []
    let characterList: Object[] = []
    let equipmentList: Object[] = []
    let items: Record<string, number> = {}

    if (scoreRewards !== undefined && groupId !== undefined) {
        let rewardIndex = 0
        for (const scoreReward of scoreRewards) {
            rewardIndex += 1;
            switch (scoreReward.type) {
                case ScoreRewardType.ITEM: {
                    const reward = scoreReward as CommonScoreReward

                    let rewardAmount = 0

                    switch (reward.reward_type) {
                        case RewardType.ITEM: {
                            const itemReward = reward as ItemScoreReward
                            const itemId = itemReward.id
                            rewardAmount = itemReward.count * 10 * (boostPointUsed ? 2 : 1)
                            items[String(itemId)] = givePlayerItemSync(playerId, itemId, rewardAmount);
                            break;
                        }
                        case RewardType.MANA: {
                            const player = getPlayerSync(playerId)
                            const currencyReward = reward as CurrencyScoreReward
                            rewardAmount = currencyReward.count * 10 * (boostPointUsed ? 2 : 1)
                            mana += rewardAmount
                            updatePlayerSync({
                                id: playerId,
                                freeMana: (player?.freeMana || 0) + rewardAmount
                            })
                            break;
                        }
                        case RewardType.EXP: {
                            const player = getPlayerSync(playerId)
                            const currencyReward = reward as CurrencyScoreReward
                            rewardAmount = currencyReward.count * 10 * (boostPointUsed ? 2 : 1)
                            expPool += rewardAmount
                            updatePlayerSync({
                                id: playerId,
                                expPool: (player?.expPool || 0) + rewardAmount
                            })
                            break;
                        }
                    }

                    dropScoreRewardIds.push({
                        group_id: groupId,
                        index: rewardIndex,
                        number: rewardAmount
                    })
                    break;
                }
                case ScoreRewardType.RARE_POOL: {
                    const reward = scoreReward as RareScoreRewardGroup
                    const roll = randomInt(0, 100) / 100

                    if (reward.rarity >= roll) {
                        // give reward from group
                        // TODO: implement RareScoreReward rarity using .rarity field instead of having an even chance between all items in pool
                        const rareGroupId = reward.id
                        const group = getRareScoreRewardGroup(rareGroupId)
                        if (group !== null) {
                            const random_index = 1 >= group.length ? 0 : randomInt(group.length)
                            const reward = group[random_index]
                            const result = givePlayerRewardSync(playerId, reward)

                            if (result) {
                                // merge arrays
                                mana += result.user_info.free_mana
                                vmoney += result.user_info.free_vmoney
                                joinedCharacterIdList = [...joinedCharacterIdList, ...result.joined_character_id_list]
                                characterList = [...characterList, ...result.character_list]
                                equipmentList = [...equipmentList, ...result.equipment_list]

                                // merge items
                                for (const [itemId, count] of Object.entries(result.items)) {
                                    const existingCount = items[itemId]
                                    if (existingCount === undefined) {
                                        items[itemId] = count
                                    } else {
                                        items[itemId] = existingCount + count
                                    }
                                }

                                // calculate number
                                let number = 0
                                switch (reward.type) {
                                    case RewardType.ITEM:
                                    case RewardType.EQUIPMENT:
                                        number = (reward as Reward as EquipmentItemReward).count
                                        break;
                                    case RewardType.CHARACTER:
                                        number = 1;
                                        break;
                                    case RewardType.BEADS:
                                    case RewardType.EXP:
                                    case RewardType.MANA:
                                        number = (reward as Reward as CurrencyReward).count
                                        break;
                                }

                                // add reward id to table
                                dropRareRewardIds.push({
                                    group_id: rareGroupId,
                                    index: random_index + 1,
                                    number: number
                                })
                            }  
                        }
                    }
                    break;
                }
            }
        }
    }

    return {
        drop_score_reward_ids: dropScoreRewardIds,
        drop_rare_reward_ids: dropRareRewardIds,
        user_info: {
            free_mana: mana,
            free_vmoney: vmoney,
            exp_pool: expPool
        },
        character_list: characterList,
        joined_character_id_list: joinedCharacterIdList,
        equipment_list: equipmentList,
        items: items
    }
}

/**
 * Batch gives a specific player data an array of rewards.
 * 
 * @param playerId The ID of the player to reward.
 * @param rewards The array of rewards to give.
 * @returns A PlayerRewardResult.
 */
export function givePlayerRewardsSync(
    playerId: number,
    rewards: Reward[]
): PlayerRewardResult | null {
    let mana = 0
    let vmoney = 0
    let expPool = 0
    let joinedCharacterIdList: number[] = []
    let characters: Map<number, Object> = new Map()
    let equipment: Map<number, Object> = new Map()
    let items: Map<number, number> = new Map()

    for (const reward of rewards) {
        switch (reward.type) {
            case RewardType.ITEM: {
                const convertedReward = (reward as EquipmentItemReward)
                const itemId = convertedReward.id
                const result = givePlayerItemSync(playerId, itemId, convertedReward.count);
                items.set(itemId, (items.get(itemId) ?? 0) + result)
                break;
            }
            case RewardType.EQUIPMENT: {
                const convertedReward = (reward as EquipmentItemReward)
                const equipmentId = convertedReward.id
                const result = givePlayerEquipmentSync(playerId, equipmentId, convertedReward.count)
                equipment.set(equipmentId, result)
                break;
            }
            case RewardType.CHARACTER: {
                const characterId = (reward as CharacterReward).id
                const giveResult = givePlayerCharacterSync(playerId, characterId)

                const giveItem = giveResult?.item
                if (giveItem !== undefined) {
                    const itemId = giveItem.id
                    items.set(itemId, (items.get(itemId) ?? 0) + giveItem.count)
                }
    
                const giveCharacter = giveResult?.character
                if (giveCharacter !== undefined) {
                    characters.set(characterId, giveCharacter)
                }
                break;
            }
            case RewardType.BEADS: {
                vmoney += (reward as CurrencyReward).count
                break;
            }
            case RewardType.MANA: {
                mana += (reward as CurrencyReward).count
                break;
            }
            case RewardType.EXP: {
                expPool += (reward as CurrencyReward).count
                break;
            }
        }
    }

    if (mana > 0 || vmoney > 0 || expPool > 0) {
        // get player
        const player = getPlayerSync(playerId)
        if (player === null) return null;

        updatePlayerSync({
            id: playerId,
            freeVmoney: player.freeVmoney + vmoney,
            freeMana: player.freeMana + mana,
            expPool: player.expPool + expPool
        })
    }
    
    // build return values
    const characterList: Object[] = []
    const equipmentList: Object[] = []
    const itemsRecord: Record<string, number> = {}
    
    characters.forEach(character => {
        characterList.push(character)
    })

    equipment.forEach(equipment => {
        equipmentList.push(equipment)
    })

    items.forEach((number, id) => {
        itemsRecord[id] = number
    })

    return {   
        user_info: {
            free_mana: mana,
            free_vmoney: vmoney,
            exp_pool: expPool
        },
        character_list: characterList,
        joined_character_id_list: joinedCharacterIdList,
        equipment_list: equipmentList,
        items: itemsRecord
    }
}

/**
 * Gives a player a specific reward.
 * 
 * @param playerId The ID of the player.
 * @param reward The reward to give.
 * @returns A PlayerRewardResult.
 */
export function givePlayerRewardSync(
    playerId: number,
    reward: Reward
): PlayerRewardResult | null {
    return givePlayerRewardsSync(playerId, [reward])
}