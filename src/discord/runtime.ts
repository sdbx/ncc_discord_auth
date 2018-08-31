import * as Discord from "discord.js"
import { EventEmitter } from "events"
import { a } from "hangul-js"
import * as path from "path"
import { sprintf } from "sprintf-js"
import Config from "../config"
import Log from "../log"
import Ncc from "../ncc/ncc"
import Lang from "./lang"
import ArtiNoti from "./module/artinoti"
import Auth from "./module/auth"
import Cast from "./module/cast"
import Color from "./module/color"
import EventNotifier from "./module/event"
import Gather from "./module/gather"
import Login from "./module/login"
import PermManager from "./module/perm"
import Ping from "./module/ping"
import Purge from "./module/purge"
import Plugin from "./plugin"
import { CmdParam, CommandHelp, DiscordFormat, getRichTemplate, ParamType } from "./runutil"

/**
 * List of presets
 * 설정할 때 간단하게 하기 위한 용도.
 */
const presetCfgs:{[key:string]: string[]} = {
    "네이버 카페" : ["auth<%g>.commentURL", "artialert<%g>.cafeURL", "cast<%g>.cafeURL"],
    "프록시 채널" : ["auth<%g>.proxyChannel"],
    "인증 그룹" : ["auth<%g>.destRole"],
    "비속어 필터": ["purger<%g>.filterExplicit"],
    "메세지 백업 채널": ["purger<%g>.backupChannel"],
}
/**
 * The home of bot
 * 
 * Manage Config, Discord, Ncc and cast to plugins
 * @class 메인 클라이언트
 */
export default class Runtime extends EventEmitter {
    /**
     * Global config like token, prefix..
     * 최상위 설정 파일
     */
    private global:MainCfg
    /**
     * The list of config with plugins
     */
    private locals:Map<string, Config>
    /**
     * language file
     * 언어팩 - 기본: 프레타체
     */
    private lang:Lang
    /**
     * Discord client
     */
    private client:Discord.Client
    /**
     * Naver Cafe Chat + Naver Cafe API client
     */
    private ncc:Ncc
    /**
     * Plugins
     */
    private plugins:Plugin[]
    /**
     * Uses for Autosave
     * @private
     */
    private lastSaved:number
    /**
     * @todo Plugin 추가하기
     * 
     * In fact, this adds only plugins.
     */
    constructor() {
        super()
        this.plugins = []
        const moduleDir = path.resolve("./module")
        Log.d(moduleDir)
        this.plugins.push(
            new Ping(), new Login(), new Auth(),new ArtiNoti(),
            new Cast(), new Gather(), new EventNotifier(), new Color(),
            new Purge(), new PermManager())
    }
    /**
     * **Async**
     * 
     * Connect discord&ncc client and **START** Bot.
     */
    public async start():Promise<string> {
        // load config
        this.global = new MainCfg()
        await this.global.import(true).catch((err) => null)
        this.locals = new Map()
        // init client
        this.client = new Discord.Client()
        // create ncc - not authed
        this.ncc = new Ncc()
        // init lang
        this.lang = new Lang()
        // save time: now
        this.lastSaved = Date.now()
        // ncc register event
        this.ncc.on("login", async () => {
            this.ncc.connect(true)
        })
        // ncc test auth by cookie
        try {
            if (await this.ncc.loadCredit() == null) {
                Log.i("Runtime-ncc","Login via cookie failed.")
            }
        } catch (err) {
            Log.e(err)
        }
        // event register
        this.plugins.forEach(((v,i) => {
            this.on("ready",v.ready.bind(v))
            // this.on("message",v.onMessage.bind(v))
            this.on("save",v.onSave.bind(v))
        }))
        // client register
        this.client.on("ready",this.ready.bind(this))
        this.client.on("message",this.onMessage.bind(this))
        // ncc login
        if (this.global.consoleLogin && !await this.ncc.availableAsync()) {
            while (await this.ncc.genCreditByConsole() == null) {
                continue
            }
        }
        // client login (ignore)
        await this.client.login(this.global.token)
        return Promise.resolve("")
    }
    /**
     * **Async**
     * 
     * Destroy client and plugins
     */
    public async destroy() {
        this.client.removeAllListeners()
        try {
            await this.client.destroy()
            for (const plugin of this.plugins) {
                await plugin.onDestroy()
            }
            this.ncc.destory()
        } catch (err) {
            Log.e(err)
            process.exit(-1)
        }
        // may save failed.
        // this.emit("save");
        return Promise.resolve()
    }
    /**
     * Discord's onReady event receiver
     * @event Discord.Client#ready
     */
    protected async ready() {
        // init plugins
        const receiver = {
            get: (target, prop, r) => {
                if (prop === "token") {
                    return "_"
                  } else {
                    return Reflect.get(target, prop, r)
                  }
            },
            set: (target, p, value, r) => {
                Log.d("SubConfig", "Hooked setting value: " + p.toString())
                return false
            }
        } as ProxyHandler<MainCfg>
        const proxy = new Proxy(this.global, receiver)
        for (const plugin of this.plugins) {
            plugin.init({
                client:this.client,
                ncc: this.ncc,
                lang: this.lang,
                mainConfig: proxy,
                subConfigs: this.locals,
            })
        }
        // set client option
        this.client.options.disabledEvents = ["PRESENCE_UPDATE", "TYPING_START"]
        this.emit("ready")
    }
    /**
     * Discord's onMessage event receiver
     * @param msg Discord's message
     * @event Discord.Client#message
     */
    protected async onMessage(msg:Discord.Message) {
        const text = msg.content
        const prefix = this.global.prefix
        // onMessage should invoke everytime.
        // this.emit("message",msg)
        
        // chain check
        if (msg.author.bot) {
            // Bot!
            return Promise.resolve()
        }
        for (const plugin of this.plugins) {
            if (await plugin.callChain(msg,msg.channel.id, msg.author.id)) {
                // invoked chain.
                return Promise.resolve()
            }
        }
        // command check
        if (!prefix.test(text) && !text.startsWith(this.global.simplePrefix)) {
            // save configs 10 minutes inverval when normal...
            if (Date.now() - this.lastSaved >= 600000) {
                this.lastSaved = Date.now()
                this.emit("save")
            }
        } else {
            /*
              Let Commandhelp parse them.
            */
            const status:CmdParam = {
                isAdmin: this.global.isAdmin(msg.author.id),
                isDM: msg.channel.type === "dm",
                isSimple: !prefix.test(text) && text.startsWith(this.global.simplePrefix),
            }
            try {
                /*
                  * hard coding!
                */
                if (!await this.hardCodingCmd(msg, text, status)) {
                    Promise.all(this.plugins.map((value) => value.onCommand.bind(value)(msg, text, status)))
                }
            } catch (err) {
                Log.e(err)
            }
        }
        try {
            Promise.all(this.plugins.map((value) => value.onMessage.bind(value)(msg)))
        } catch (err) {
            Log.e(err)
        }
        return Promise.resolve()
    }
    /**
     * Handle command(hard-coding) on top-level
     * @param msg Discord message
     * @param cmd Command string
     * @param status The status of message (dm, isadmin)
     */
    private async hardCodingCmd(msg:Discord.Message, cmd:string, status:CmdParam):Promise<boolean> {
        let result = false
        const helpCmd = new CommandHelp("도움/도와/도움말",this.lang.helpDesc,true)
        const helpCode = "명령어/name"
        helpCmd.addField(ParamType.dest, "궁금한", false, {code: [helpCode]})
        const setCmd = new CommandHelp("설정/보여",this.lang.sudoNeed, false, { reqAdmin:true })
        setCmd.addField(ParamType.dest, "목적", true)
        setCmd.addField(ParamType.to, "설정값", false)
        const adminCmd = new CommandHelp("token", "토큰 인증", false, { dmOnly:true })
        adminCmd.addField(ParamType.to, "토큰 앞 5자리", true)
        const saveCmd = new CommandHelp("저장", "저장", true,{reqAdmin:true})

        /*
            Help Command
        */
        const _help = helpCmd.check(this.global, cmd, status)
        if (!result && _help.match) {
            let dest = "*"
            if (_help.exist(ParamType.dest) && _help.code(ParamType.dest) === helpCode) {
                dest = _help.get(ParamType.dest)
                if (dest.length < 1) {
                    dest = "*"
                }
            }
            let helps:CommandHelp[] = []
            if (dest === "*") {
                /**
                 * Add hard-coded commands
                 */
                helps.push(helpCmd, setCmd, adminCmd, saveCmd)
            }
            this.plugins.map((_v) => _v.help).forEach((_v, _i) => {
                _v.forEach((__v, __i) => {
                    if (dest !== "*") {
                        if (__v.cmds.indexOf(dest) >= 0) {
                            helps.push(__v)
                        }
                    } else {
                        helps.push(__v)
                    }
                })
            })
            // filter permission
            helps = helps.filter((_v) => {
                return !((_v.dmOnly && msg.channel.type !== "dm")
                    || (_v.reqAdmin && !this.global.isAdmin(msg.author.id)))
            })
            if (helps.length === 0) {
                await msg.channel.send(sprintf(this.lang.helpNoExists, { help: dest }))
            } else {
                for (let i = 0; i < Math.ceil(helps.length / 20); i += 1) {
                    const richMsg = this.defaultRich
                    richMsg.setTitle(this.lang.helpTitle)
                    if (msg.type !== "dm" && msg.guild != null) {
                        const profile = DiscordFormat.getUserProfile(msg.member)
                        richMsg.setAuthor(profile[0], profile[1])
                    }
                    for (let k = 0; k < Math.min(helps.length - 20 * i, 20); k += 1) {
                        const help = helps[i * 20 + k]
                        richMsg.addField(status.isSimple ? help.simpleTitle : help.title, help.description)
                    }
                    await msg.channel.send(richMsg)
                }
                result = true
            }
        }
        /**
         * Config command
         */
        const _set = setCmd.check(this.global, cmd, status)
        if (!result && /* msg.channel.type === "dm" && */ _set.match) {
            /**
             * option set
             */
            if (!_set.has(ParamType.to)) {
                if (_set.command === "보여") {
                    _set.set(ParamType.to,"_")
                } else {
                    return Promise.resolve(false)
                }
            }
            /**
             * Extremely Dangerous Setting 
             */
            if (msg.channel.type === "dm" && !(_set.command === "보여")) {
                let pass = true
                let reboot = false
                switch (_set.get(ParamType.dest)) {
                    case "토큰" : {
                        // CAUTION
                        this.global.token = _set.get(ParamType.to)
                        reboot = true
                    } break
                    case "말머리" : {
                        this.global.prefix = new RegExp(_set.get(ParamType.to),"i")
                    } break
                    case "색깔" : {
                        this.global.embedColor = _set.get(ParamType.to)
                    } break
                    default: {
                        pass = false
                    }
                }
                if (pass) {
                    result = true
                }
                if (reboot) {
                    await this.global.export().catch(Log.e)
                    await msg.channel.send(_set.get(ParamType.dest) + " 설정 완료. 재로드합니다.")
                    this.emit("restart")
                    return Promise.resolve(true)
                }
            }
            const richE:Discord.RichEmbed[] = []
            const from = _set.get(ParamType.dest)
            const to = _set.get(ParamType.to)
            if (from === "프리셋" && (_set.command === "보여")) {
                const rich = this.plugins[0].defaultRich
                for (const [presetK, presetFrom] of Object.entries(presetCfgs)) {
                    rich.addField(presetK, presetFrom.join("\n").replace(/%g/ig, msg.guild.id))
                }
                await msg.channel.send(rich)
                return Promise.resolve(true)
            }
            for (const [presetK, presetFrom] of Object.entries(presetCfgs)) {
                if (presetK === from) {
                    // preset execute
                    for (let preFrom of presetFrom) {
                        preFrom = preFrom.replace(/%g/ig,msg.guild.id)
                        richE.push(await this.setConfig(preFrom, to, _set.command === "보여"))
                    }
                    result = true
                    break
                }
            }
            if (!result) {
                richE.push(await this.setConfig(from, to,_set.command === "보여"))
            }
            for (const rich of richE) {
                if (rich != null) {
                    await msg.channel.send(rich)
                }
            }
        }
        /**
         * Pseudo admin auth
         */
        const _adm = adminCmd.check(this.global, cmd, status)
        if (!result && msg.channel.type === "dm" && _adm.match) {
            const str5 = _adm.get(ParamType.to)
            if (str5.toLowerCase() === this.global.token.substr(0,5).toLowerCase()) {
                const id = msg.author.id
                this.global.authUsers.push(id)
                await msg.channel.send(sprintf(this.lang.adminGranted, { mention: DiscordFormat.mentionUser(id) }))
                await this.global.export().catch(err => Log.e) 
            }
            result = true
        }
        /**
         * Save
         */
        const _save = saveCmd.check(this.global, cmd, status)
        if (!result && _save.match) {
            this.emit("save")
            result = true
        }
        return Promise.resolve(result)
    }
    /**
     * Set config of plugin via command
     * @param key <Plugin's name>.<config depth>
     * @param value to setting value (don't matter when watching)
     * @param see Watching?
     */
    private async setConfig(key:string, value:string, see = false):Promise<Discord.RichEmbed> {
        let say:object
        if (see && value == null) {
            value = ""
        }
        for (const plugin of this.plugins) {
            const req = await plugin.setConfig(
                key, value, see)
            if (req != null) {
                say = req
                break
            }
        }
        if (say != null) {
            if (say.hasOwnProperty("old")) {
                const richMsg = this.plugins[0].defaultRich
                richMsg.setTitle("설정: " + say["config"])
                richMsg.addField("경로", say["key"])
                richMsg.addField("원래 값", say["old"])
                if (!see) {
                    richMsg.addField("새로운 값", say["value"])
                }
                // richMsg.setDescription(say.str);
                return Promise.resolve(richMsg)
            } else {
                const richMsg = this.plugins[0].defaultRich
                richMsg.setDescription(say["str"])
                return Promise.resolve(richMsg)
            }
        }
        return Promise.resolve(null)
    }
    /**
     * get default formatted rich
     */
    private get defaultRich():Discord.RichEmbed {
        return getRichTemplate(this.global, this.client)
    }
}
/**
 * Main config with token, prefix, admins.
 * @class Main config
 */
export class MainCfg extends Config {
    public token = "_"
    public authUsers:string[] = []
    public simplePrefix = "$"
    public embedColor = "#ffc6f5"
    public consoleLogin = false
    protected prefixRegex = (/^(네코\s*메이드\s+)?(프레|레타|프레타|프렛땨|네코|시로)(야|[짱쨩]아?|님)/).source
    constructor() {
        super("main")
        this.blacklist.push("prefix")
    }
    public get prefix():RegExp {
        return new RegExp(this.prefixRegex,"i")
    }
    public set prefix(value:RegExp) {
        this.prefixRegex = value.toString()
    }
    public isAdmin(id:string) {
        return this.authUsers.indexOf(id) >= 0
    }
}