import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Cache from "../../cache"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat,
    getRichTemplate, ParamAccept, ParamType, } from "../runutil"
import { cloneMessage, sendClonedMsg } from "./gather"

const bulkLimit = 100
// tslint:disable-next-line
const filterSimple = ['씨발', '시발', '씨ㅂ', '씨바', 'ㅆ발', 'ㅆ바', '시바', '시ㅂ', 'ㅅ바', 'ㅅ발', 'ㅅㅂ', '개새끼', '새끼', '썅', 'ㅅㄲ', '凸', '병신', 'ㅂㅅ', 'ㅄ', '병ㅅ', '병시', 'ㅂ신', '빙신', '지랄', 'ㅈㄹ', '지ㄹ', 'ㅈ랄', '개소리', '슈바', '슈발', '슈ㅂ', '조까', '좆까', '개소리', 'ㅆㅂ', '니애미', '닥쳐', 'ㄷㅊ', '닥ㅊ', 'ㄷ쳐', '느금마', '니애비', '씨부랄', '시부랄', '좆']
export default class Purge extends Plugin {
    // declare command.
    protected config = new PurgeConfig()
    private purge:CommandHelp
    private listCache:Map<string, Cache<Array<[string, string]>>> = new Map()
    private working:string[] = []
    private caching = false
    private filterRegex = new RegExp(`(${filterSimple.join("|")})`, "ig")
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        // CommandHelp: suffix, description
        this.purge = new CommandHelp("purge/삭제", this.lang.purge.purgeDesc)
        this.purge.addField(ParamType.dest, "삭제할 갯수 | ALL", true, {code: ["num/개"]})
        // get parameter as complex
        this.purge.complex = true
        // listen delete event
        const getBackupChannel = async (guild:Discord.Guild) => {
            if (guild == null) {
                return null
            }
            const sub = await this.sub(this.config, guild.id)
            const backupS = guild.channels.find((v) => v.id === sub.backupChannel)
            if (backupS != null && backupS instanceof Discord.TextChannel) {
                return backupS
            }
            return null
        }
        this.client.on("messageDelete", async (msg) => {
            const backupS = await getBackupChannel(msg.guild)
            if (backupS != null && msg.channel.id !== backupS.id && !msg.author.bot) {
                const names = DiscordFormat.getUserProfile(msg.member)
                const hook = await this.getWebhook(backupS, 
                    `${names[0]} (#${(msg.channel as Discord.TextChannel).name}, 삭제됨)`, names[1]).catch(Log.e)
                if (hook == null) {
                    return
                }
                const cloned = cloneMessage(msg)
                if (cloned.embeds.length <= 0) {
                    const rich = new Discord.RichEmbed()
                    for (const file of cloned.attaches) {
                        rich.addField("첨부했던 파일", file.name)
                    }
                    rich.setDescription("사용자: " + DiscordFormat.formatUser(msg.author).mention)
                    // rich.addField("보낸 사람", )
                    await hook.send(cloned.content, rich)
                } else {
                    let sendFirst = false
                    for (const embed of cloned.embeds) {
                        embed.setDescription("사용자: " + DiscordFormat.formatUser(msg.author).mention)
                        if (!sendFirst) {
                            sendFirst = true
                            await hook.send(cloned.content, embed)
                        } else {
                            await hook.send(embed)
                        }
                    }
                }
            }
        })
        this.client.on("messageDeleteBulk", async (msg) => {
            const format = (str:string) => `${this.lang.purge.deletedMsg}\`\`\`\n${str}\`\`\``
            const first = this.getFirstMap(msg)
            const backupS = await getBackupChannel(first.guild)
            if (backupS != null && first.channel.id !== backupS.id) {
                try {
                    const send = msg.filter((v) => v.content.length >= 1)
                    .map((v) => `${DiscordFormat.getUserProfile(v.member)[0]} (${v.member.id}) : ${v.content}`)
                    let cache:string = ""
                    // limit : 1997
                    const decoLength = 2000 - format("").length
                    for (let part of send) {
                        if (part.length >= decoLength) {
                            part = part.substring(0, decoLength)
                        }
                        if (cache.length + part.length >= decoLength) {
                            await backupS.send(format(cache))
                            cache = part
                            // wip
                        } else {
                            if (cache.length > 0) {
                                cache = cache + "\n" + part
                            } else {
                                cache = part
                            }
                        }
                    }
                    await backupS.send(format(cache))
                } catch (err) {
                    Log.e(err)
                }
            }
        })
        this.client.on("messageUpdate", async (oldM,newM) => {
            const backupS = await getBackupChannel(newM.guild)
            if (backupS != null && newM.channel.id !== backupS.id && !newM.author.bot) {
                const oldContent = oldM.content.trim().length <= 1 ? "없음" : oldM.content
                const newContent = newM.content.trim().length <= 1 ? "없음" : newM.content
                const names = DiscordFormat.getUserProfile(newM.member)
                const hook = await this.getWebhook(backupS,
                    `${names[0]} (#${(newM.channel as Discord.TextChannel).name}, 수정됨)`, names[1]).catch(Log.e)
                if (hook == null) {
                    return
                }
                if (oldM.embeds.length <= 0 && newM.embeds.length >= 1 && oldContent === newContent) {
                    // embed generated
                    return
                }
                const rich = getRichTemplate(this.global, this.client)
                rich.setDescription("사용자: " + DiscordFormat.formatUser(newM.author).mention)
                rich.setTitle(this.lang.purge.editedMsg)
                rich.addField("수정 전", oldContent)
                rich.addField("수정 후", newContent)
                rich.setTimestamp(new Date(oldM.createdTimestamp))
                if (newM.attachments.size >= 1) {
                    const a = this.getFirstMap(newM.attachments)
                    if ([".png", ".jpg", ".jpeg"].indexOf(a.filename.substr(a.filename.lastIndexOf("."))) >= 0) {
                        rich.attachFile(new Discord.Attachment(a.url, a.filename))
                        rich.setImage("attachment://" + a.filename)
                    }
                }
                await hook.send(newM.url, rich)
            }
        })
        return Promise.resolve()
    }
    public async onMessage(msg:Discord.Message) {
        if (!(msg.channel instanceof Discord.TextChannel) || msg.channel.type === "dm") {
            return
        }
        const sub = await this.sub(this.config, msg.guild.id)
        if (sub.filterExplicit && !(msg.channel as Discord.TextChannel).nsfw &&
            msg.content.replace(/[ -~]/ig, "").match(this.filterRegex) != null) {
            if (msg.channel instanceof Discord.GuildChannel) {
                const perms = msg.channel.permissionsFor(msg.guild.members.find((v) => v.id === this.client.user.id))
                if (perms.has("MANAGE_MESSAGES")) {
                    await msg.delete()
                }
            }
        }
        return
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testPurge = this.purge.check(this.global, command, state)
        if (testPurge.match && !msg.author.bot) {
            const numStr = testPurge.get(ParamType.dest)
            let all = false // All message (author: me)
            let deleteALL = false // All Author's message (length: defined)
            let num = Number.parseInt(numStr)
            if (numStr.toUpperCase() === "ALL" || numStr.toUpperCase() === "-ALL") {
                all = true
                if (numStr.startsWith("-")) {
                    deleteALL = true
                }
                num = 2147483647
            } else if (!Number.isSafeInteger(num)) {
                await msg.channel.send("Not int.")
                return Promise.resolve()
            }
            let checkPm = false
            if (msg.channel instanceof Discord.GuildChannel) {
                const perms = msg.channel.permissionsFor(msg.guild.members.find((v) => v.id === this.client.user.id))
                if (perms.has("MANAGE_MESSAGES")) {
                    checkPm = true
                }
            } else {
                return Promise.resolve()
            }
            if (!checkPm) {
                await msg.channel.send(this.lang.purge.noPerm)
                return Promise.resolve()
            }
            let deleteCount = num
            if (deleteCount === 0) {
                await msg.delete()
                return Promise.resolve()
            } else if (deleteCount < 0) {
                if (msg.member.permissions.has("MANAGE_MESSAGES")) {
                    deleteALL = true
                    num = Math.abs(num)
                    deleteCount = Math.abs(deleteCount)
                } else {
                    await msg.channel.send(this.lang.purge.noPermAll)
                    await msg.delete()
                    return Promise.resolve()
                }
            }
            if (this.working.indexOf(msg.author.id) >= 0) {
                await msg.channel.send(this.lang.purge.working)
                return Promise.resolve()
            }
            // check cache
            const check = await this.checkCache(msg.channel, msg.id, msg.author.id)
            if (check != null) {
                Log.d("Caching", check)
                // await msg.channel.send(check)
                return Promise.resolve()
            }
            // add queue
            this.working.push(msg.author.id)
            // add
            const deleteIDs:string[] = []
            const recents = this.listCache.get(msg.channel.id).cache
            let recentL = recents.length
            for (let i = 0; i < recentL; i += 1) {
                const [userid, msgid] = recents[i]
                if (deleteALL || userid.toString() === msg.author.id) {
                    recentL -= 1
                    recents.splice(i, 1)
                    i -= 1
                    deleteIDs.push(msgid.toString())
                }
                if (!all && deleteIDs.length >= deleteCount) {
                    break
                }
            }
            let startMsg:Discord.Message
            if (deleteIDs.length >= 50) {
                startMsg = await msg.channel.send(
                    sprintf(this.lang.purge.deleting, { total: deleteIDs.length })) as Discord.Message
            }
            deleteIDs.unshift(msg.id)
            // remove
            while (deleteIDs.length > 0) {
                const del = deleteIDs.splice(0, Math.min(deleteIDs.length, 100))
                await msg.channel.bulkDelete(del)
            }
            // queue end
            for (let i = 0; i < this.working.length; i += 1) {
                if (this.working[i] === msg.author.id) {
                    this.working.splice(i, 1)
                    break
                }
            }
            if (startMsg != null) {
                await startMsg.delete()
            }
        }
        return Promise.resolve()
    }
    private async checkCache(channel:Discord.TextChannel, lastID:string, userid:string = null) {
        // check cache
        const key = channel.id
        if (!this.caching) {
            if (!this.listCache.has(key)) {
                this.caching = true
                const msg = await channel.send(this.lang.purge.fetchStart) as Discord.Message
                this.fetchMessages(channel, lastID).then((v) => {
                    this.listCache.set(key, new Cache(v, 1209600))
                    this.caching = false
                    msg.delete()
                    channel.send(DiscordFormat.mentionUser(userid) + " " + this.lang.purge.fetchEnd)
                    .then((m:Discord.Message) => {
                        m.delete(3000)
                    })
                })
                return "Cache request."
            } else {
                const data = this.listCache.get(key)
                if (data.expired || data.cache.length <= 0) {
                    this.listCache.delete(key)
                    this.caching = true
                    this.fetchMessages(channel, lastID)
                    return "Cache request (expired)."
                }
                const lid = data.cache[0][1]
                data.cache.unshift(...await this.fetchMessages(channel, lastID, lid))
                return null
            }
        } else {
            return "Caching."
        }
    }
    private async fetchMessages(channel:Discord.TextChannel, lastID:string, end:string = null) {
        // limit of bulkdelete
        const stamp = Date.now()
        const timeout = stamp - 1000 * 3600 * 24 * 14 + 300000
        let msgid = lastID
        const messages:Array<[string, string]> = []
        while (true) {
            let breakL = false
            const fetch = await channel.fetchMessages({
                limit: bulkLimit,
                before: msgid,
                // after: end,
            })
            let i = 0
            for (const [k, fMsg] of fetch) {
                if (end != null && Number.parseInt(fMsg.id) <= Number.parseInt(end)) {
                    breakL = true
                    break
                }
                if (i === fetch.size - 1) {
                    // Log.d("Timestamp", (fMsg.createdTimestamp - timeout).toString())
                    msgid = fMsg.id
                    break
                }
                if (fMsg.createdTimestamp < timeout) {
                    breakL = true
                    break
                } else {
                    messages.push([fMsg.author.id, fMsg.id])
                }
                i += 1
            }
            if (fetch.size < bulkLimit) {
                breakL = true
            }
            if (breakL) {
                break
            }
        }
        Log.d("Cached Mesasges", messages.length + "")
        return messages
    }
}
class PurgeConfig extends Config {
    public filterExplicit = false
    public backupChannel = "5353"
    constructor() {
        super("purger")
    }
}