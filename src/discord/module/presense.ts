import Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { ChainData, CmdParam, ParamAccept, ParamType } from "../rundefine"
import { cloneMessage, CommandHelp, CommandStatus, DiscordFormat,
    getFirstMap, getRichTemplate, SnowFlake } from "../runutil"


export default class Presense extends Plugin {
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
export enum PresensePlaying {
    playing = "playing",
    watching = "watching",
    streaming = "streaming",
    listening = "listening",
}
enum PresenseState {
    ONLINE = "온라인",
    IDLE = "자리비움",
    BUSY = "다른 용무 중",
    INVISIBLE = "오프라인",
}