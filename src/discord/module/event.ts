import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import { bindFn, TimerID, WebpackTimer } from "../../webpacktimer"
import Plugin from "../plugin"
import { ChainData, CmdParam, ParamType } from "../rundefine"
import { CommandHelp, DiscordFormat } from "../runutil"

export default class EventNotifier extends Plugin {
    // declare config file: use save data
    protected config = new EventConfig()
    // declare command.
    private welcome:CommandHelp
    private eventR:CommandHelp
    private watchAct:CommandHelp
    private cafeWatchT:TimerID
    private lastWatchers:Map<number, ActiveUser[]>
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.welcome = new CommandHelp("환영", this.lang.events.descWelcome, true, {reqAdmin: true})
        this.eventR = new CommandHelp("이벤트 수신", this.lang.events.descBotCh, true, {reqAdmin: true})
        this.watchAct = new CommandHelp("접속자 체크", "카페 접속자 체크", true, {reqAdmin: true})
        this.watchAct.addField(ParamType.dest, "카페URL", false)
        this.client.on("guildMemberAdd",(async (member:Discord.GuildMember) => {
            const guild = member.guild
            const cfg = await this.sub(this.config, guild.id)
            await this.sendContent(guild, cfg.welcomeCh, sprintf(cfg.welcomeMsg, {
                name: member.user.username,
                mention: DiscordFormat.mentionUser(member.user.id),
            }))
        }).bind(this))
        this.client.on("guildMemberRemove", (async (member:Discord.GuildMember) => {
            const guild = member.guild
            const cfg = await this.sub(this.config, guild.id)
            const nick = member.nickname != null ? member.nickname : member.user.username
            await this.sendContent(guild, cfg.botCh, sprintf(this.lang.events.exitUser, {
                name: nick,
            }))
        }).bind(this))
        this.client.on("guildMemberUpdate", (async (oldMember:Discord.GuildMember, newMember:Discord.GuildMember) => {
            const guild = newMember.guild
            const cfg = await this.sub(this.config, guild.id)
            const oldNick = oldMember.nickname != null ? oldMember.nickname : oldMember.user.username + " (기본값)"
            const newNick = newMember.nickname != null ? newMember.nickname : newMember.user.username + " (기본값)"
            if (oldNick !== newNick) {
                const rich = this.defaultRich
                rich.setTitle(this.lang.events.changeNick)
                rich.addField("예전 닉네임", oldNick)
                rich.addField("바뀐 닉네임", newNick)
                await this.sendContent(guild, cfg.botCh, DiscordFormat.mentionUser(newMember.user.id), rich)
            }
        }).bind(this))
        this.lastWatchers = new Map()
        this.cafeWatchT = WebpackTimer.setInterval(bindFn(this.syncWatcher, this), 10000)
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testWelcome = this.welcome.check(this.global, command, state)
        if (testWelcome.match) {
            await msg.channel.send(this.lang.events.typeWelcomeMsg)
            this.startChain(msg.channel.id, msg.author.id, ChainType.WELCOME)
            return Promise.resolve()
        }
        const testReceive = this.eventR.check(this.global, command, state)
        if (testReceive.match) {
            const cfg = await this.sub(this.config, msg.guild.id)
            cfg.botCh = msg.channel.id
            await msg.channel.send(this.lang.events.setBotCh)
            await cfg.export()
            return Promise.resolve()
        }
        const testWatch = this.watchAct.check(this.global, command, state)
        if (testWatch.match && msg.guild != null) {
            const arr = this.config.subCafes
            for (let i = 0; i < arr.length; i += 1) {
                const sub = arr[i]
                if (sub.guildid === msg.guild.id) {
                    arr.splice(i, 1)
                    await msg.channel.send("구독 해제 완료.")
                    return Promise.resolve()
                }
            }
            if (testWatch.has(ParamType.dest)) {
                Log.d("url", testWatch.get(ParamType.dest))
                const cafeI = await this.ncc.parseNaver(testWatch.get(ParamType.dest)).catch(Log.e)
                if (cafeI == null) {
                    await msg.channel.send("오류.")
                    return Promise.resolve()
                }
                arr.push({
                    cafeid: cafeI.cafeId,
                    guildid: msg.guild.id,
                })
                const rich = this.defaultRich
                rich.addField("카페 ID", cafeI.cafeId)
                await msg.channel.send("구독 완료.", rich)
            }
        }
        return Promise.resolve()
    }
    public async onDestroy() {
        await super.onDestroy()
        WebpackTimer.clearInterval(this.cafeWatchT)
        return Promise.resolve()
    }
    protected async sendContent(guild:Discord.Guild, channelID:string, text:string, rich:Discord.RichEmbed = null) {
        if (this.client.channels.has(channelID)) { 
            const channel = this.client.channels.get(channelID) as Discord.TextChannel
            await channel.send(text, rich)
        }
        return Promise.resolve()
    }
    protected async onChainMessage(message:Discord.Message, type:number, data:ChainData):Promise<ChainData> {
        (data.data as object)["msg"] = message.content
        return this.endChain(message, type, data)
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        const cfg = await this.sub(this.config, message.guild.id)
        cfg.welcomeMsg = (data.data as object)["msg"]
        cfg.welcomeCh = message.channel.id
        await cfg.export()
        await message.channel.send(sprintf(
            this.lang.events.setWelcomeSuccess + "\n\n" + cfg.welcomeMsg,{
                name: message.author.username,
                mention: DiscordFormat.mentionUser(message.author.id),
            }))
        return Promise.resolve()
    }
    protected async syncWatcher() {
        const buffer = new Map<number, ActiveUser[]>()
        for (const watch of this.config.subCafes) {
            if (!buffer.has(watch.cafeid)) {
                try {
                    buffer.set(watch.cafeid, await this.ncc.fetchWatching(watch.cafeid).catch(() => null))
                } catch (err) {
                    Log.e(err)
                }
            }
            const added:ActiveUser[] = []
            const removed:ActiveUser[] = []
            const users = buffer.get(watch.cafeid)
            const org = this.lastWatchers.has(watch.cafeid) ? this.lastWatchers.get(watch.cafeid) : []
            if (users == null) { 
                continue
            }
            for (const u of users) {
                const i = this.getFirst(org.map((v, _i) => ({ id: v.userid, index: _i }))
                    .filter((v) => v.id === u.userid))
                if (i == null) {
                    added.push(u)
                } else {
                    org.splice(i.index, 1)
                }
            }
            removed.push(...org)
            this.lastWatchers.set(watch.cafeid, users)
            if (added.length + removed.length === 0) {
                continue
            }
            const sub = await this.sub(this.config, watch.guildid)
            const ch = this.client.channels.has(sub.botCh) ?
                this.client.channels.get(sub.botCh) as Discord.TextChannel : null
            if (ch != null) {
                const rich = this.defaultRich
                rich.setTitle("카페 접속자")
                rich.setDescription(users.map((v) => v.name).join(", "))
                const _n = added.map((v) => v.name).join(", ")
                if (_n.length >= 1) {
                    rich.addField("새 접속자", _n, true)
                }
                const _r = removed.map((v) => v.name).join(", ")
                if (_r.length >= 1) {
                    rich.addField("끈 사람", _r, true)
                }
                try {
                    await ch.send(rich)
                } catch {
                    // :)
                }
            }
        }
    }
}
enum ChainType {
    WELCOME,
}
export class EventConfig extends Config {
    public welcomeCh = "welcome"
    public botCh = "bot"
    public welcomeMsg = "Hello!"
    public subCafes:SubCafe[] = []
    constructor() {
        super("event")
    }
}
interface SubCafe {
    guildid:string;
    cafeid:number;
}
interface ActiveUser {
    userid:string;
    name:string;
}