import Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { CmdParam, PresensePlaying, PresenseState } from "../rundefine"
import { decodeTime } from "../runutil"
/**
 * Presen`s`e jam.
 */
export default class Presense extends Plugin {
    public static getPresenceInfo(presence:Discord.Presence) {
        let status:string
        switch (presence.status) {
            case "online": status = "온라인";break
            case "offline": status = "오프라인"; break
            case "idle": status = "자리비움"; break
            case "dnd": status = "바쁨"; break
            default: status = "모름"; break // jam
        }
        let type:string = ""
        let name:string = ""
        let state:string = ""
        let details:string = ""
        let playedTime:string = ""
        let largeDesc:string = ""
        let smallDesc:string = ""
        if (presence.game != null) {
            const game = presence.game
            switch (game.type) {
                case 0: type = "플레이 중"; break
                case 1: type = "방송 중"; break
                case 2: type = "듣는 중"; break
                case 3: type = "시청 중"; break
                default: type = "하는 중"; break
            }
            name = game.name
            if (game.state !== undefined) {
                state = game.state
            }
            if (game.details !== undefined) {
                details = game.details
            }
            if (game.timestamps !== undefined && game.timestamps.start !== undefined) {
                playedTime = decodeTime(Date.now() - game.timestamps.start.getTime())
            }
            if (game.assets !== undefined) {
                if (game.assets.largeText !== undefined) {
                    largeDesc = game.assets.largeText
                }
                if (game.assets.smallText !== undefined) {
                    smallDesc = game.assets.smallText
                }
            }
        }
        return {
            status,
            type,
            name,
            state,
            details,
            playedTime,
            largeDesc,
            smallDesc,
        }
    }
    // declare config file: use save data
    protected config = new PresenseConfig()
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        await this.client.user.setPresence({
            status: this.config.state as Discord.PresenceStatus,
            game: {
                name: this.config.stateMessage,
                type: this.config.pType as Discord.ActivityType,
            }
        }).catch(Log.e)
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        return Promise.resolve()
    }
    public async onConfigChange(msg:Discord.Message, key:string, value:unknown):Promise<unknown> {
        if (key === "state") {
            return this.setStatus(value as string)
        } else if (key === "pType") {
            return this.setPlayingType(value as string)
        } else if (key === "stateMessage") {
            await this.setPlaying(value as string)
        }
        return value
    }
    public async setPlaying(name:string) {
        return this.client.user.setPresence({
            game: {
                name,
            }
        })
    }
    public async setPlayingType(type:string) {
        let pType:Discord.ActivityType
        switch (type.toLowerCase()) {
            case PresensePlaying.playing:
                pType = "PLAYING"
                break
            case PresensePlaying.streaming:
                pType = "STREAMING"
                break
            case PresensePlaying.watching:
                pType = "WATCHING"
                break
            case PresensePlaying.listening:
                pType = "LISTENING"
                break
            default:
                pType = "PLAYING"
                break
        }
        await this.client.user.setPresence({
            game: {
                name: this.config.stateMessage,
                type: pType,
            }
        })
        return pType
    }
    public async setStatus(state:string) {
        let pstate:Discord.PresenceStatus
        switch (state) {
            case PresenseState.IDLE:
                pstate = "idle"
                break
            case PresenseState.BUSY:
                pstate = "dnd"
                break
            case PresenseState.INVISIBLE:
                pstate = "invisible"
                break
            default:
                pstate = "online"
        }
        await this.client.user.setStatus(pstate)
        return pstate
    }
}
class PresenseConfig extends Config {
    public state:Discord.PresenceStatus = "online"
    public pType:Discord.ActivityType = "PLAYING"
    public stateMessage:string = ""
    public constructor() {
        super("presense")
    }
}