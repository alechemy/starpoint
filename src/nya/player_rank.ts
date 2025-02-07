import player_rank_data from "../../assets/player_rank.json";
import { getPlayerSync } from "../data/wdfpData";
import { onPlayerRankUp } from "./delegates";
import { bisect } from "./utils";

const MAX_RANK = player_rank_data.length;

export const getRankByPt = (rankPoint: number) => {
    const i_rank = bisect(player_rank_data, rankPoint, (el) => el.total_rp);
    return player_rank_data[i_rank >= player_rank_data.length ? player_rank_data.length - 1 : i_rank];
}

export const getRank = (rank: number) => {
    // start from 1
    return player_rank_data[rank - 1];
}

export const givePlayerRankPoint = (playerId: number, rankPoint: number) => {
    const playerData = getPlayerSync(playerId);
    if (!playerData) throw new Error("Player not found");
    const currentRank = getRankByPt(playerData.rankPoint);
    playerData.rankPoint += rankPoint
    if (currentRank.rank < MAX_RANK) {
        if (playerData.rankPoint >= currentRank.total_rp) {
            const nextRank = getRank(currentRank.rank + 1);
            playerData.stamina = nextRank.stamina;
            onPlayerRankUp.call(playerData, nextRank.rank);
        }
    }
    return playerData;
}
