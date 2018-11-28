import Discord, { MessageOptions } from "discord.js"
import fs from "fs-extra"
import { sprintf } from "sprintf-js"
import tmp from "tmp-promise"
import Config from "../../config"
import Log from "../../log"
import { bindFn, TimerID, WebpackTimer } from "../../webpacktimer"
import XlsxUtil from "../../xlsxutil"
import Plugin from "../plugin"
import { ChainData, CmdParam, ParamType, PresensePlaying, PresenseState } from "../rundefine"
import { CommandHelp, decodeDate, decodeHMS, DiscordFormat } from "../runutil"
import Presense from "./presense"

export default class EventNotifier extends Plugin {
    // declare config file: use save data
    protected config = new EventConfig()
    // declare command.
    private welcome:CommandHelp
    private eventR:CommandHelp
    private watchAct:CommandHelp
    private presenceExp:CommandHelp
    private cafeWatchT:TimerID
    private lastWatchers:Map<number, ActiveUser[]>
    // 0~365 day
    private lastDay:Map<string, number>
    private presenseStates:Map<string, object[]>
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        // CommandHelp: suffix, description
        this.welcome = new CommandHelp("환영", this.lang.events.descWelcome, true, {reqAdmin: true})
        this.eventR = new CommandHelp("이벤트 수신", this.lang.events.descBotCh, true, {reqAdmin: true})
        this.watchAct = new CommandHelp("접속자 체크", "카페 접속자 체크", true, {reqAdmin: true})
        this.watchAct.addField(ParamType.dest, "카페URL", false)
        this.presenceExp = new CommandHelp("게임 체크", "Presence 체크", true, {chatType: "guild"})
        this.client.on("guildMemberAdd",(async (member:Discord.GuildMember) => {
            const guild = member.guild
            const cfg = await this.sub(this.config, guild.id)
            await this.sendContent(guild, cfg.welcomeCh, sprintf(cfg.welcomeMsg, {
                name: member.user.username,
                mention: DiscordFormat.mentionUser(member.user.id),
            }))
            await this.sendContent(guild, cfg.botCh, sprintf(this.lang.events.inUser, {
                name: DiscordFormat.getNickname(member),
            }), this.getUserInfo(member))
        }).bind(this))
        this.client.on("guildMemberRemove", (async (member:Discord.GuildMember) => {
            const guild = member.guild
            const cfg = await this.sub(this.config, guild.id)
            const nick = member.nickname != null ? member.nickname : member.user.username
            
            await this.sendContent(guild, cfg.botCh, sprintf(this.lang.events.exitUser, {
                name: DiscordFormat.mentionUser(member.user.id),
            }), this.getUserInfo(member))
        }).bind(this))
        this.client.on("guildMemberUpdate", (async (oldMember:Discord.GuildMember, newMember:Discord.GuildMember) => {
            const guild = newMember.guild
            const cfg = await this.sub(this.config, guild.id)
            const oldNick = oldMember.nickname != null ? oldMember.nickname : oldMember.user.username + " (기본값)"
            const newNick = newMember.nickname != null ? newMember.nickname : newMember.user.username + " (기본값)"
            if (oldNick !== newNick) {
                const rich = this.defaultRich
                rich.setTitle(this.lang.events.changeNick)
                rich.setDescription(DiscordFormat.mentionUser(newMember.user.id))
                rich.addField("예전 닉네임", oldNick)
                rich.addField("바뀐 닉네임", newNick)
                rich.setThumbnail(DiscordFormat.getAvatarImage(newMember))
                await this.sendContent(guild, cfg.botCh, null, rich)
            }
        }).bind(this))
        this.client.on("presenceUpdate", async (oldMember:Discord.GuildMember, newMember:Discord.GuildMember) => {
            const guild = newMember.guild
            const cfg = await this.sub(this.config, guild.id)
            if (!cfg.analyticsPresence) {
                return
            }
            const today = new Date(Date.now()).getDay()
            if (!this.lastDay.has(guild.id)) {
                this.lastDay.set(guild.id, today)
            }
            if (!this.presenseStates.has(guild.id)) {
                this.presenseStates.set(guild.id, [])
            }
            const preArr = this.presenseStates.get(guild.id)
            preArr.push({
                stack: preArr.length,
                sender: DiscordFormat.getNickname(newMember),
                senderID: newMember.id,
                timestamp: decodeHMS(Date.now()),
                ...Presense.getPresenceInfo(newMember.presence),
            })
            // export
            if (today !== this.lastDay.get(guild.id) && preArr.length >= 1) {
                this.lastDay.set(guild.id, today)
                if (this.client.channels.has(cfg.botCh)) {
                    const exp = await this.exportLog(guild.id)
                    const channel = this.client.channels.get(cfg.botCh) as Discord.TextChannel
                    await channel.send({
                        embed: exp.embed,
                        files: [new Discord.Attachment(fs.createReadStream(exp.file), "presence" + today + ".xlsx")],
                        disableEveryone: true,
                    } as MessageOptions)
                    await fs.remove(exp.file)
                }
                preArr.splice(0, preArr.length)
            }
        })
        this.lastWatchers = new Map()
        this.presenseStates = new Map()
        this.lastDay = new Map()
        this.cafeWatchT = WebpackTimer.setInterval(bindFn(this.syncWatcher, this), 10000)
        return Promise.resolve()
    }
    public async exportLog(gid:string) {
        const preArr = this.presenseStates.get(gid)
        const path = await tmp.tmpName({postfix: ".xlsx"})
        const xlsxU = new XlsxUtil()
        xlsxU.addCells(preArr, "Presences")
        xlsxU.exportXLSX(path)
        const rich = this.defaultRich
        rich.setTitle("상태 로그")
        rich.setDescription(decodeDate(Date.now(), false) + "의 Presence 변화입니다.")
        rich.addField("수집된 로그 갯수", preArr.length + "개")
        return {
            embed: rich,
            file: path,
        }
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
        const testPreExport = this.presenceExp.check(this.global, command, state)
        if (testPreExport.match) {
            if (this.presenseStates.has(msg.guild.id) && this.presenseStates.get(msg.guild.id).length >= 1) {
                const exp = await this.exportLog(msg.guild.id)
                await msg.channel.send({
                    embed: exp.embed,
                    files: [new Discord.Attachment(fs.createReadStream(exp.file), "presence.xlsx")],
                    disableEveryone: true,
                } as MessageOptions)
                await fs.remove(exp.file)
            }
            return Promise.resolve()
        }
        return Promise.resolve()
    }
    public async onDestroy() {
        await super.onDestroy()
        WebpackTimer.clearInterval(this.cafeWatchT)
        return Promise.resolve()
    }
    protected async sendContent(guild:Discord.Guild, channelID:string, text:string, rich?:Discord.RichEmbed) {
        if (this.client.channels.has(channelID)) { 
            const channel = this.client.channels.get(channelID) as Discord.TextChannel
            if (text != null) {
                await channel.send(text, rich)
            } else if (rich != null) {
                await channel.send(rich)
            }
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
                const i = org.map((v, _i) => ({ id: v.userid, index: _i }))
                    .find((v) => v.id === u.userid)
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
    public analyticsPresence = false
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