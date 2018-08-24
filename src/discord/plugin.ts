import * as Discord from "discord.js"
import * as get from "get-value"
import * as Hangul from "hangul-js"
const set = require("set-value")
import * as fs from "fs-extra"
import { sprintf } from "sprintf-js"
import Cache from "../cache"
import Config from "../config"
import Log from "../log"
import Ncc from "../ncc/ncc"
import Profile from "../ncc/structure/profile"
import Lang from "./lang"
import { MainCfg } from "./runtime"
import { blankChar, ChainData, cloneMessage, CmdParam, CommandHelp,
    getFirst, getFirstMap, getRichTemplate } from "./runutil"
/**
 * The base of bot command executor
 * @class 플러그인
 */
export default abstract class Plugin {
    /**
     * This module's config at globalID
     */
    protected config:Config
    /**
     * Discord client
     */
    protected client:Discord.Client
    /**
     * Ncc client
     */
    protected ncc:Ncc
    /**
     * Language
     */
    protected lang:Lang
    /**
     * Main config (readonly)
     * 
     * token is hidden.
     */
    protected global:MainCfg
    /**
     * Chaining timeout. (**ms**)
     */
    protected timeout = 1 * 60 * 1000 // 1 is minutes
    /**
     * Chaining cache
     */
    private chains:Map<string, ChainData>
    /**
     * Sub configs..
     * @see runtime.locals
     */
    private subs:Map<string, Config>
    /**
     * Webhooks (channel, id)
     */
    private webhooks:Map<string, Cache<{
        webhook:Discord.Webhook,
        name:string,
        image:string,
    }>>

    /**
     * on plugin load
     * @param cl client
     * @param ncc nccapi
     */
    public init(runtime:{
        client:Discord.Client, ncc:Ncc, lang:Lang, mainConfig:MainCfg, subConfigs:Map<string,Config>}):void {
        this.client = runtime.client
        this.ncc = runtime.ncc
        this.lang = runtime.lang
        this.chains = new Map()
        this.webhooks = new Map()
        this.global = runtime.mainConfig
        this.subs = runtime.subConfigs
    }
    /**
     * on discord ready
     */
    public async ready():Promise<void> {
        Log.d(this.constructor.name, "bot ready.")
        if (this.config != null) {
            await this.config.import(true).catch((err) => null)
        }
        return Promise.resolve()
    }
    // 
    /**
     * abstract
     * @todo on Command receive
     * @param msg message!
     * @param command command(suffix)
     * @param options options
     */
    public abstract async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void>
    /**
     * Give help info to runtime
     * @returns helps
     */
    public get help():CommandHelp[] {
        const out:CommandHelp[] = []
        for (const [key,value] of Object.entries(this)) {
            if (this.hasOwnProperty(key) && value instanceof CommandHelp) {
                out.push(value)
            }
        }
        return out
    }
    /**
     * Asynchronized work & fire after onCommand.
     * 
     * @todo on message received
     * 
     * **DO NOT SEND MESSAGE when BOT has spoken** unless filtering. (Cause Infinite loop)
     * @param msg 
     */
    public async onMessage(msg:Discord.Message):Promise<void> {
        return Promise.resolve()
    }
    /**
     * reload config
     */
    public async reload():Promise<void> {
        return Promise.resolve()
    }
    /**
     * Reflection config change & save
     * @param key Config indepth key
     * @param value data
     */
    public async setConfig(key:string, value:string, view = false):Promise<{str:string}> {
        if (this.config == null) {
            // ignore
            return Promise.resolve(null)
        }
        if (this.config == null || !key.startsWith(this.config.name)) {
            return Promise.resolve(null)
        }
        const split = key.split(".")
        let config:Config
        let configName:string
        if (split.length >= 2) {
            const _value = split[0].replace(/\s+/ig,"")
            const tag = _value.replace(/(<.*>|\[.*\])/ig, "")
            const _sub = _value.match(/<.*>/)
            let sub = null
            if (_sub != null && _sub.length === 1) {
                sub = _sub[0].substring(1,_sub[0].length - 1)
            }
            if (tag !== this.config.name) {
                return Promise.reject(null)
            } else if (sub != null) {
                if (await this.sub(this.config, sub, false).then((v) => v.has())) {
                    config = await this.sub(this.config, sub, true)
                    configName = this.config.name + "-" + sub
                } else {
                    key = sub + "."
                }
            } else {
                config = this.config
                configName = this.config.name
            }
        }
        let errorMsg
        let oldValue = null
        if (config != null) {
            let lastPath = "global"
            split.shift()
            for (let i = 0;i < split.length; i += 1) {
                const _path = split.slice(0, i + 1).join(".")
                const now_path = split.slice(0,i + 1).map((_v) => {
                    const _sub = _v.match(/\[.*\]/)
                    if (_sub != null && _sub.length >= 1) {
                        return `${_v.replace(/\[.*\]/,"").trim()}.${_sub[0].substring(1,_sub[0].length - 1)}`
                    } else {
                        return _v
                    }
                }).join(".")
                const depth = get(config, now_path, {isValid: this.isValidConfig.bind(this)})
                if (depth === undefined || typeof depth === "undefined") {
                    const param = {
                        depth: `${configName}.${lastPath}`,
                        name: split[i],
                        dest: Hangul.endsWithConsonant(split[i]) ? "은" : "는",
                        str: null,
                    }
                    param.str = sprintf(this.lang.setNotFound,param)
                    errorMsg = param
                    Log.w("Config", `${_path} 퉤에엣`)
                    break
                } else if (view) {
                    oldValue = depth.toString()
                    value = depth.toString()
                } else if (i < split.length - 1) {
                    if (typeof depth !== "object") {
                        const param = {
                            depth: `${configName}.${_path}`,
                            type: this.lang.getType(depth),
                            str: null,
                        }
                        param.str = sprintf(this.lang.setTypeError,param)
                        errorMsg = param
                        Log.w("Config", "end before end..(?)")
                        break
                    } else {
                        lastPath = _path
                    }
                } else {
                    let data
                    switch (typeof depth) {
                        case "boolean" : {
                            if (value.toLowerCase() === "true" || value === "1") {
                                data = true
                            } else if (value.toLowerCase() === "false" || value === "0") {
                                data = false
                            }
                        } break
                        case "number" : {
                            const num = Number.parseFloat(value)
                            if (!Number.isNaN(num) && Number.isFinite(num)) {
                                data = num
                            }
                        } break
                        case "string" : {
                            data = value
                        } break
                        default : {
                            const param = {
                                depth: `${configName}.${_path}`,
                                type: this.lang.getType(depth),
                                str: null,
                            }
                            param.str = sprintf(this.lang.setTypeError, param)
                            errorMsg = param
                            Log.w("Config", `${_path} : ${typeof depth}`)
                        }
                    }
                    if (data != null) {
                        oldValue = depth
                        set(config, _path, data)
                        await this.onSave()
                    }
                    break
                }
            }
            if (errorMsg != null) {
                return Promise.resolve(errorMsg)
            } else {
                const param = {
                    config: configName,
                    key: split.join("."),
                    old: oldValue,
                    value,
                    to: Hangul.endsWithConsonant(value) ? "으로" : "로",
                    str: null,
                }
                param.str = sprintf(this.lang.setSuccess, param)
                return Promise.resolve(param)
            }
        } else {
            const param = {
                depth: this.config.name,
                name: key.indexOf(".") >= 1 ? key.substring(0,key.indexOf(".")) : this.lang.valNull,
                str: null,
            }
            param.str = sprintf(this.lang.setNotFound, param)
            return Promise.resolve(param)
        }
    }
    /**
     * On autosaving
     */
    public async onSave() {
        if (this.config != null) {
            await this.config.export()
            const proArr = []
            this.subs.forEach((_value) => proArr.push(_value.export()))
            await Promise.all(proArr)
        }
        return Promise.resolve()
    }
    /**
     * 체인 여부
     * @param channel 채널 
     * @param user 유저
     */
    public chaining(channel:string, user:string) {
        return this.chains.has(`${channel}$${user}`)
    }
    /**
     * Calling chain for receive message
     * @param message received id (uses channelid, userid)
     * @param channel manual channel id (useless for now)
     * @param user manual user id (useless for now)
     */
    public async callChain(message:Discord.Message, channel?:string, user?:string):Promise<boolean> {
        if (channel == null) {
            channel = message.channel.id
        }
        if (user == null) {
            user = message.author.id
        }
        const id = `${channel}$${user}`
        if (this.chaining(channel, user)) {
            const chainData = this.chains.get(id)
            if (Date.now() - chainData.time >= this.timeout) {
                this.chains.delete(id)
                return Promise.resolve(false)
            }
            const chained = await this.onChainMessage(message, chainData.type, chainData)
            if (chained.type === -1) {
                // chain end.
                Log.d("Chain", "chain end.")
            } else {
                this.chains.set(id, chained)
            }
            return Promise.resolve(true)
        }
        return Promise.resolve(false)
    }
    /**
     * Finish chain and call onEndChain
     * @param message Discord message
     * @param type Type of chain(user define)
     * @param data Received data
     * @param channel manual channel id (useless for now)
     * @param user manual user id (useless for now)
     */
    public async endChain(message:Discord.Message, type:number, data:ChainData, channel?:string, user?:string) {
        if (channel == null) {
            channel = message.channel.id
        }
        if (user == null) {
            user = message.author.id
        }
        if (this.chaining(channel, user)) {
            this.chains.delete(`${channel}$${user}`)
        }
        await this.onChainEnd(message, type, data)
        return Promise.resolve({
            type: -1,
            data: null,
            time: -1,
        } as ChainData)
    }
    /**
     * on Destroy event
     */
    public async onDestroy() {
        await this.onSave()
        return Promise.resolve()
    }
    /**
     * 체인 중일때 메세지를 받았을 때
     * @param message 메세지
     * @param type 유형
     * @param data 값
     */
    protected async onChainMessage(message:Discord.Message, type:number, data:ChainData):Promise<ChainData> {
        return this.endChain(message,type,data)
    }
    /**
     * 체인을 끝내는 명령어를 받았을 때
     * @param message 메세지
     * @param type 유형
     * @param data 값
     */
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        return Promise.resolve()
    }
    /**
     * 연속된 명령 받기를 위해 체인에 id와 type과 data를 넣음
     * @param channel 채널
     * @param user 유저
     * @param type 체인 타입
     * @param data 값
     */
    protected startChain(channel:string, user:string, type:number, data:object = {}):void {
        const id = `${channel}$${user}`
        if (!this.chains.has(id)) {
            this.chains.set(id,{
                type,
                data,
                time: Date.now(),
            } as ChainData)
        } else {
            Log.w(this.constructor.name, `체인 실패 - 이미 ${channel} 안의 ${user} 에 대한 체인이 있음`)
        }
    }
    /**
     * Umran
     * @param global class object 
     * @param subName sub name :)
     */
    protected async sub<T extends Config>(parent:T,subName:string,sync = true):Promise<T> {
        const key = this.subKey(parent.name, subName)
        if (this.subs.has(key)) {
            const cfg = this.subs.get(key) as T
            const receiver = {
                set: (target, p, value, r) => {
                    Log.d("SubConfig", "Hooked setting value: " + p.toString())
                    return false
                }
            } as ProxyHandler<T>
            const proxy = new Proxy(cfg, receiver)
            return sync ? cfg : proxy
        }
        const newI:T = new (parent["constructor"] as any)(subName, parent.name) as T
        newI.initialize(subName, parent.name)
        await newI.import(true).catch(Log.e)
        if (sync) {
            this.subs.set(key, newI)
        }
        return Promise.resolve(newI)
    }
    /**
     * get default formatted rich
     */
    public get defaultRich():Discord.RichEmbed {
        return getRichTemplate(this.global, this.client)
    }
    /**
     * get rich profile from naver account
     * @param member naver accont object
     * @param name discord author name
     * @param icon discord author icon
     */
    protected async getRichByNaver(member:Profile, name?:string, icon?:string) {
        // image
        if (member.profileurl == null) {
            member.profileurl = "https://ssl.pstatic.net/static/m/cafe/mobile/cafe_profile_c77.png"
        }
        // const image:Buffer = await request.get(member.profileurl, { encoding: null });
        // rich message
        const rich = this.defaultRich
        rich.setFooter(member.cafeDesc == null ? "네이버 카페" : member.cafeDesc, member.cafeImage)
        // rich.attachFile(new Discord.Attachment(image, "profile.png"));
        // rich.setThumbnail("attachment://profile.png");
        rich.setThumbnail(member.profileurl)
        if (name != null) {
            rich.setAuthor(name, icon)
        }
        rich.addField("네이버 ID", member.userid, true)
        rich.addField("네이버 닉네임", member.nickname, true)
        if (member.level != null) {
            rich.addField("등급", member.level, true)
            rich.addField("총 방문 수", member.numVisits, true)
            rich.addField("총 게시글 수", member.numArticles, true)
            rich.addField("총 댓글 수", member.numComments, true)
        }
        return Promise.resolve(rich)
    }
    /**
     * Get key of subconfig
     * @param name module's global config name
     * @param subName subname
     */
    protected subKey(name:string, subName?:string) {
        return `${name}\$${subName == null ? "__default__" : subName}`
    }
    /**
     * Does key have config?
     * @param subName subname (filename)
     * @param name directory name
     */
    protected subHas(subName:string, name = this.config.name):boolean {
        return this.subs.has(this.subKey(name, subName))
    }
    /**
     * Delete subconfig (with file)
     * @param subName subname (filename)
     * @param name directory name
     */
    protected async subDel(subName:string, name = this.config.name):Promise<void> {
        const key = this.subKey(name, subName)
        if (this.subs.has(key)) {
            const cfg = this.subs.get(key)
            await fs.remove(cfg["saveTo"])
            this.subs.delete(key)
        }
        return Promise.resolve()
    }
    /**
     * format value to language string
     * @param value value
     */
    protected toLangString(value:string | number | boolean) {
        let data:string
        const type = typeof value
        if (value == null) {
            data = this.lang.valNull
        } else if (type === "boolean") {
            data = value ? this.lang.valTrue : this.lang.valFalse
        } else if (type === "string") {
            data = value as string
        } else if (type === "number") {
            data = (value as number).toString(10)
        } else {
            data = ""
        }
        return data
    }
    /**
     * Generate or get webhook by Name & Image
     * @param channel Discord's textChannel (guild)
     * @param name Webhook profile name
     * @param image Webhook Profile Image
     */
    protected async getWebhook(channel:Discord.TextChannel, name:string = null, image:string = null) {
        let webhook:Discord.Webhook
        if (name != null) {
            if (name.length <= 1) {
                name = name + blankChar
            } else if (name.length > 32) {
                name = name.substring(0,32)
            }
        }
        if (!channel.permissionsFor(this.client.user).has("MANAGE_WEBHOOKS")) {
            return Promise.reject("No Permission")
        }
        if (!this.webhooks.has(channel.id) || this.webhooks.get(channel.id).expired) {
            const webhooks = await channel.fetchWebhooks()
            for (const [key, hook] of webhooks) {
                if ((hook.owner as Discord.User).id === this.client.user.id) {
                    if (name != null || image != null) {
                        const n = hook.name
                        webhook = await hook.edit(name == null ? n : name, image)
                    } else {
                        webhook = hook
                    }
                    break
                }
            }
            if (webhook == null) {
                if (name == null) {
                    name = "ncc_discord_auth"
                }
                webhook = await channel.createWebhook(name, image)
            }
            this.webhooks.set(channel.id, new Cache({
                webhook,
                name: webhook.name,
                image: webhook.avatar,
            }, 3600))
        } else {
            const info = this.webhooks.get(channel.id).cache
            const changeImage = image != null && info.image !== image
            if ((name != null && info.name !== name) || changeImage) {
                const n = name != null ? name : info.webhook.name
                const i = changeImage ? image : null
                await info.webhook.edit(n, i)
                info.name = n
                if (i != undefined) {
                    info.image = i
                }
            }
            webhook = info.webhook
        }
        webhook.client.options.disableEveryone = true
        return webhook
    }
    /**
     * Filter editable configs
     *
     * Default: all
     * @param key config key
     * @param obj to set value
     * @returns editable?
     */
    protected isValidConfig(key:string, obj:object):boolean {
        return true
    }
    /**
     * Get first element in Array
     * @deprecated use runutil export
     * @param arr Array
     */
    protected getFirst<T>(arr:T[]):T {
        return getFirst(arr)
    }
    /**
     * Get first element in Map
     * @deprecated use runutil export
     * @param m Map
     */
    protected getFirstMap<T, V>(m:Map<T, V>):V {
        return getFirstMap(m)
    }
}
