import Discord, { TextChannel } from "discord.js"
import encoding from "encoding"
import haneng from "gksdud"
import request from "request-promise-native"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import hangul from "hangul-js"
import { ChainData, CmdParam, ParamAccept, ParamType, UniqueID } from "../rundefine"
import {
    cloneMessage, CommandHelp, CommandStatus, DiscordFormat,
    getFirstMap, getRichTemplate, SnowFlake
} from "../runutil"


export default class HanEng extends Plugin {
    // declare config file: use save data
    protected config = new HanengConfig()
    protected cache:Map<string, boolean>
    /**
     * Initialize command
     */
    public async ready() {
        this.cache = new Map()
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
        if (!pm.has("SEND_MESSAGES") /* || !pm.has("MANAGE_WEBHOOKS") */) {
            return
        }
        // now, calc
        // first. Try to convert to hangul
        const hanLength = (arr:string[]) => arr.filter((v) => v.match(/[가-힣]+/ig) != null).length
        const m = packet.content
        const pieces = m.split(/[A-Za-z]+/ig)
        const engs = m.match(/[A-Za-z]+/ig)
        if (engs == null) {
            return
        }
        if (m.indexOf("http://") >= 0 || m.indexOf("https://") >= 0) {
            return
        }
        // 한글이 한글자라도 있으면 무시
        if (hanLength([m]) >= 1) {
            return
        }
        if (m.indexOf("\`") >= 0) {
            return
        }
        // first. filter incoreect hangul.
        const kors = engs.map((v) => haneng(v)).map((v, i) => {
            if (v.length >= 2 && v === "".padStart(v.length, v.charAt(0)) &&
                ["ㅋ", "ㅎ", "ㄱ", "ㄷ", "ㅂ", "ㅇ", "ㅗ", "ㅅ", "ㅠ"].indexOf(v.charAt(0)) >= 0) {
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
            const r = JSON.parse(
                encoding.convert(await request.get(url, { encoding: null }), "utf-8", "euc-kr")) as [string, string[]]
            return r
        }
        // convert.
        let applies:string[] = []
        let worked = 0
        let added = -1
        for (const kor of kors) {
            worked += 1
            const add = (setCache = true) => {
                added += 1
                if (setCache) {
                    this.cache.set(eng, true)
                }
                applies[kor.index] = kor.value
            }
            const eng = engs[kor.index]
            // check so less converted
            if (worked >= 7 && added / worked <= 0.7) {
                applies = []
                break
            }
            // check cache
            if (this.cache.has(eng)) {
                if (!this.cache.get(eng)) {
                    continue
                } else {
                    add(false)
                    continue
                }
            }
            // google using euc-kr? believe?
            const [query, suggest] = await getSuggest(eng + " ")
            // first: if there's match in english, DO NOT CONVERT
            if (suggest.find((v) => v === eng) != null) {
                this.cache.set(eng, false)
                continue
            }
            // second: Does not anything search, JUST CONVERT
            if (suggest.length <= 0) {
                add()
                continue
            }
            // third: if not match and almost english, DO NOT CONVERT
            if (suggest.filter((v) => v.match(/^[ A-Za-z0-9]+/ig) != null).length / suggest.length >= 0.7) {
                this.cache.set(eng, false)
                continue
            }
            // fourth: If almost stars with KOR, JUST CONVERT
            if (suggest.filter((v) => v.startsWith(kor.value)).length / suggest.length >= 0.7) {
                add()
                continue
            }
            // final: shouldn't have become, but... we choice by this.
            const splitQuery = hangul.disassemble(kor.value)
            const contain = suggest.map((v) => {
                const splitV = hangul.disassemble(v)
                for (let i = 0; i < splitQuery.length; i += 1) {
                    if (splitQuery[i] !== splitV[i]) {
                        return null
                    }
                }
                return v
            }).filter((v) => v != null)
            // anyway, is this useful to... 형태소? -> JUST CONVERT
            if (contain.length / suggest.length >= 0.6) {
                add()
                continue
            }
            // gg.
            this.cache.set(eng, false)
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
            await packet.channel.send(make, {
                files: clone.attaches,
                embed: clone.embeds.length >= 1 ? clone.embeds[0] : null,
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