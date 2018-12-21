import Discord, { TextChannel } from "discord.js"
import haneng from "gksdud"
import request from "request-promise-native"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import encoding from "encoding"
import { ChainData, CmdParam, ParamAccept, ParamType, UniqueID } from "../rundefine"
import { cloneMessage, CommandHelp, CommandStatus, DiscordFormat,
    getFirstMap, getRichTemplate, SnowFlake } from "../runutil"


export default class HanEng extends Plugin {
    // declare config file: use save data
    protected config = new HanengConfig()
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // no need to use
        return Promise.resolve()
    }
    public async onMessage(packet:Discord.Message) {
        if (packet.author.bot) {
            return
        }
        const sub = await this.subUnique(this.config, packet, UniqueID.guild, true)
        if (!sub.use || !(packet.channel instanceof TextChannel)) {
            return
        }
        const pm = packet.channel.permissionsFor(this.client.user)
        if (!pm.has("SEND_MESSAGES") || !pm.has("MANAGE_WEBHOOKS")) {
            return
        }
        // now, calc
        // first. Try to convert to hangul
        const m = packet.content
        const pieces = m.split(/[A-Za-z]+/ig)
        const engs = m.match(/[A-Za-z]+/ig)
        if (engs == null) {
            return
        }
        if (m.indexOf("http://") >= 0 || m.indexOf("https://") >= 0) {
            return
        }
        const applies:string[] = []
        if (m.indexOf("\`") >= 0) {
            return
        }
        // filter to trying to google
        const kors = engs.map((v) => haneng(v)).map((v, i) => {
            if (v.length >= 2 && v === "".padStart(v.length,v.charAt(0)) &&
                ["ㅋ","ㅎ","ㄱ","ㄷ", "ㅂ", "ㅇ", "ㅗ", "ㅅ", "ㅠ"].indexOf(v.charAt(0)) >= 0) {
                // for o
                return {
                    index: i,
                    value: v,
                }
            } else if (v.match(/[ㄱ-ㅣ]+/ig) != null) {
                return null
            } else if (v.length <= 0) {
                return null
            }
            return {
                index: i,
                value: v,
            }
        }).filter((v) => v != null)
        const getSuggest = async (key:string) => {
            const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q=${
                encodeURIComponent(key)
            }`
            return JSON.parse(
                encoding.convert(await request.get(url, {encoding: null}), "utf-8", "euc-kr")) as [string, string[]]
        }
        const hanLength = (arr:string[]) => arr.filter((v) => v.match(/^[가-힣]+/ig) != null).length
        for (const kor of kors) {
            const eng = engs[kor.index]
            // google using euc-kr? believe?
            const [query, suggest] = await getSuggest(eng)
            // find 1. Let's determine the "word" is exists
            const exist = suggest.find((v) => v === query) != null
            if (suggest.length >= 1) {
                if (!exist && hanLength(suggest) / suggest.length <= 0.4) {
                    continue
                }
            }
            // find 2. At here, How much suggests in Korean?
            const [, spaceS] = await getSuggest(eng.trimRight() + " ")
            const hangulS = hanLength(spaceS)
            // how much percent we determine this is Korean word? I set 60%
            if (spaceS.length === 0 || (spaceS.length >= 1 && hangulS / spaceS.length >= 0.6)) {
                // ok success!
                applies[kor.index] = kor.value
            }
        }
        let make:string = ""
        let changed = false
        for (let i = 0; i < pieces.length; i += 1) {
            make += pieces[i]
            if (i < engs.length) {
                if (applies[i] !== undefined) {
                    changed = true
                    make += applies[i]
                } else {
                    make += engs[i]
                }
            }
        }
        if (changed) {
            const clone = cloneMessage(packet)
            const wh = await this.getWebhook(packet.channel, ...DiscordFormat.getUserProfile(packet.member))
            await wh.send(make, {
                files: clone.attaches,
                embeds: clone.embeds,
            })
        }
    }
}
class HanengConfig extends Config {
    public use = false
    constructor() {
        super("haneng")
    }
}