import Discord from "discord.js"
import request from "request-promise-native"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { ChainData, CmdParam, ParamAccept, ParamType } from "../rundefine"
import {
    cloneMessage, CommandHelp, CommandStatus, DiscordFormat,
    getFirstMap, getRichTemplate, SnowFlake
} from "../runutil"


export default class FJEmotes extends Plugin {
    // declare config file: use save data
    protected config = new FJConfig()
    protected emotes:{[key in string]:string}
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        // fj
        this.emotes = {}
        const url = "https://raw.githubusercontent.com/kr2068858/FJ-bot/master/bot.js"
        const str:string = await request(url, { encoding: "utf8" })
        const pieces = str.match(/message.content.indexOf[\S\s]+?}/ig)
        for (const piece of pieces) {
            const stres = piece.match(/".+?"/ig)
            const emote = stres.pop()
            for (const s of stres) {
                this.emotes[s] = emote
            }
        }
        return Promise.resolve()
    }
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        return Promise.resolve()
    }
    public async onMessage(msg:Discord.Message) {
        const cfg = await this.sub(this.config, msg.guild.id, true)
        if (cfg.useEmoteAdder) {
            for (const key of Object.keys(this.emotes)) {
                await msg.react(this.emotes[key])
            }
        }
    }
}
class FJConfig extends Config {
    public useEmoteAdder = false
    constructor() {
        super("fjbot")
    }
}
