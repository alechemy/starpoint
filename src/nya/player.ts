import player_rank_data from "../../assets/player_rank.json";
import { Player } from "../data/types";
import { updatePlayerSync } from "../data/wdfpData";
import { onPlayerRankUp } from "./delegates";
import { bisect } from "./utils";

export const getRankByPt = (rankPoint: number) => {
    const next = bisect(player_rank_data, rankPoint, (el) => el.total_rp);
    const reached = next < player_rank_data.length && player_rank_data[next].total_rp <= rankPoint ? next : next - 1;
    return player_rank_data[Math.max(0, Math.min(reached, player_rank_data.length - 1))];
}

export const getRank = (rank: number) => player_rank_data[rank - 1]; // rank is 1-indexed

interface PlayerEx extends Player {
    _modified?: Set<keyof Player>
}

export const modifyPlayer = <K extends keyof Player>(player: Player, name: K, value: Player[K]) => {
    player[name] = value;
    const plex = player as PlayerEx;
    if (!plex._modified) plex._modified = new Set();
    plex._modified.add(name);
}

export const commitPlayer = (player: Player) => {
    const plex = player as PlayerEx;
    if (!plex._modified) return [];
    const modified = plex._modified;
    delete plex._modified;
    if (!modified.size) return [];
    const result: { key: string, value: any }[] = [];
    const param: Partial<Player> & Pick<Player, 'id'> = Object.fromEntries([
        ['id', player.id],
        ...Array.from(modified).map(key => {
            const value = player[key];
            result.push({ key, value });
            return [key, value];
        })
    ]);
    updatePlayerSync(param);
    return result;
}

export const givePlayerRankPoint = (playerData: Player, rankPoint: number) => {
    if (!playerData) throw new Error("Player not found");
    const currentRank = getRankByPt(playerData.rankPoint);
    modifyPlayer(playerData, 'rankPoint', playerData.rankPoint + rankPoint);
    const reachedRank = getRankByPt(playerData.rankPoint);
    for (let level = currentRank.rank + 1; level <= reachedRank.rank; level++) {
        const nextRank = getRank(level);
        modifyPlayer(playerData, 'stamina', playerData.stamina + nextRank.stamina);
        onPlayerRankUp.call(playerData, nextRank.rank);
    }
    return playerData;
}
