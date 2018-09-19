import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { CmdParam, ParamType, UniqueID } from "../rundefine"
import { cloneMessage, CommandHelp, DiscordFormat,
    getFirstMap, getRichTemplate, SnowFlake } from "../runutil"

const bulkLimit = 100
const timeLimit = 1000 * 3600 * 24 * 14 + 300000
// tslint:disable-next-line
const filterSimple = ['씨발', '시발', '씨ㅂ', '씨바', 'ㅆ발', 'ㅆ바', '시바', '시ㅂ', 'ㅅ바', 'ㅅ발', 'ㅅㅂ', '개새끼', '새끼', '썅', 'ㅅㄲ', '凸', '병신', 'ㅂㅅ', 'ㅄ', '병ㅅ', '병시', 'ㅂ신', '빙신', '지랄', 'ㅈㄹ', '지ㄹ', 'ㅈ랄', '개소리', '슈바', '슈발', '슈ㅂ', '조까', '좆까', '개소리', 'ㅆㅂ', '니애미', '닥쳐', 'ㄷㅊ', '닥ㅊ', 'ㄷ쳐', '느금마', '니애비', '씨부랄', '시부랄', '좆']
export default class Purge extends Plugin {
    // declare command.
    protected config = new PurgeConfig()
    private purge:CommandHelp
    /**
     * Message List
     * 
     * Order: New -> Old (0:New, ... last:Old)
     */
    private listMessage:Map<string, MessageID[]> = new Map()
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
        this.purge.addField(ParamType.much, "삭제할 갯수 | ALL", true, {code: ["num/개"]})
        // get parameter as complex
        this.purge.complex = true
        // listen delete event
        const getBackupChannel = (async (guild:Discord.Guild) => {
            if (guild == null) {
                return null
            }
            const sub = await this.sub(this.config, guild.id)
            const backupS = guild.channels.find((v) => v.id === sub.backupChannel)
            if (backupS != null && backupS instanceof Discord.TextChannel) {
                return backupS
            }
            return null
        }).bind(this)
        this.client.on("messageDelete", async (msg) => {
            const backupS = await getBackupChannel(msg.guild)
            if (backupS != null && msg.channel.id !== backupS.id && !msg.author.bot) {
                const names = DiscordFormat.getUserProfile(msg.member)
                const webhook = await this.getWebhook(backupS,
                    `${names[0]} (#${(msg.channel as Discord.TextChannel).name}, 삭제됨)`, names[1]).catch(Log.e)
                if (webhook == null) {
                    return
                }
                const cloned = cloneMessage(msg)
                cloned.content = DiscordFormat.normalizeMention(cloned.content, msg.guild)
                if (cloned.embeds.length <= 0) {
                    const rich = new Discord.RichEmbed()
                    for (const file of cloned.attaches) {
                        rich.addField("첨부했던 파일", file.name)
                    }
                    rich.setDescription("사용자: " + DiscordFormat.mentionUser(msg.author.id))
                    await webhook.send(cloned.content, rich)
                } else {
                    let sendFirst = false
                    for (const embed of cloned.embeds) {
                        if (!sendFirst) {
                            sendFirst = true
                            embed.setDescription("사용자: " + DiscordFormat.mentionUser(msg.author.id))
                            await webhook.send(cloned.content, embed)
                        } else {
                            await webhook.send(embed)
                        }
                    }
                }
            }
        })
        this.client.on("messageDeleteBulk", async (msg) => {
            const format = (str:string) => `${this.lang.purge.deletedMsg}\`\`\`\n${str}\`\`\``
            const first = getFirstMap(msg)
            const backupS = await getBackupChannel(first.guild)
            if (backupS != null && first.channel.id !== backupS.id) {
                try {
                    const send = msg.filter((v) => v.content.length >= 1)
                    .map((v) => `${DiscordFormat.getUserProfile(v.member)[0]} (${v.member.id}) : ${
                        DiscordFormat.normalize(v.content, first.guild, false)
                    }`)
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
                const webhook = await this.getWebhook(backupS,
                    `${names[0]} (#${(newM.channel as Discord.TextChannel).name}, 수정됨)`, names[1]).catch(Log.e)
                if (webhook == null) {
                    return
                }
                if (oldM.embeds.length <= 0 && newM.embeds.length >= 1 && oldContent === newContent) {
                    // embed generated
                    return
                }
                const rich = getRichTemplate(this.global, this.client)
                rich.setDescription("사용자: " + DiscordFormat.mentionUser(newM.author.id))
                rich.setTitle(this.lang.purge.editedMsg)
                rich.addField("수정 전", DiscordFormat.normalizeMention(oldContent, newM.guild))
                rich.addField("수정 후", DiscordFormat.normalizeMention(newContent, newM.guild))
                rich.setTimestamp(new Date(oldM.createdTimestamp))
                if (newM.attachments.size >= 1) {
                    const a = getFirstMap(newM.attachments)
                    if ([".png", ".jpg", ".jpeg"].indexOf(a.filename.substr(a.filename.lastIndexOf("."))) >= 0) {
                        rich.attachFile(new Discord.Attachment(a.url, a.filename))
                        rich.setImage("attachment://" + a.filename)
                    }
                }
                await webhook.send(newM.url, rich)
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
            const numStr = testPurge.get(ParamType.much)
            let all = false // All message (author: me)
            let deleteALL = false // All Author's message (length: defined)
            let num = Number.parseInt(numStr)
            // check number of delete
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
            // check permission
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
            // check delete count / convert to sudo
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
            const gConfig = await this.subUnique(this.config, msg, UniqueID.guild)
            const allowTime = msg.createdTimestamp - gConfig.delaySec * 1000
            /**
             * Simple Delete for few messages.
             */
            if (deleteCount + (deleteALL ? 0 : 50) < 100) {
                // instant delete
                const fastFetches = await msg.channel.fetchMessages({
                    limit: 100,
                    before: msg.id,
                })
                const selected:string[] = []
                let connectedLast = true
                for (const [k, fetchM] of fastFetches) {
                    const authored = fetchM.author.id !== msg.author.id
                    if (selected.length >= deleteCount + 1) {
                        break
                    }
                    if (!fetchM.author.bot && !authored) {
                        // break Solo-say
                        connectedLast = false
                    }
                    if (gConfig.allowLast && connectedLast) {
                        if (authored || deleteALL) {
                            selected.push(fetchM.id)
                        }
                        continue
                    }
                    if (fetchM.createdTimestamp < allowTime || deleteALL) {
                        // ok.
                        if (authored || deleteALL) {
                            selected.push(fetchM.id)
                        }
                    }
                }
                await msg.channel.bulkDelete(selected)
                return Promise.resolve()
            }
            // check cache
            const caching = this.caching
            const progress = await this.updateCache(msg.channel, msg.id, caching)
            if (caching) {
                await progress.delete(2000)
                return Promise.resolve()
            }
            // add queue
            this.working.push(msg.author.id)
            // add
            const deleteIDs:string[] = []
            const recents = this.listMessage.get(msg.channel.id)
            let recentL = recents.length
            for (let i = 0; i < recentL; i += 1) {
                const {authorId, msgId} = recents[i]
                if (deleteALL || authorId.toString() === msg.author.id) {
                    recentL -= 1
                    recents.splice(i, 1)
                    i -= 1
                    deleteIDs.push(msgId.toString())
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
            deleteIDs.unshift(msg.id, progress.id)
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
    /**
     * Ensure cache is up to date (or error)
     * 
     * Takes Long Time!
     * @param channel Channel to create cache
     * @param lastID end of Message ID
     * @param caching override caching value
     * @returns State Message
     */
    private async updateCache(channel:Discord.TextChannel, lastID:string, caching = this.caching) {
        // check cache
        const key = channel.id
        if (!caching) {
            this.caching = true
            let rich:Discord.RichEmbed = null
            let lid:string = null
            if (this.listMessage.has(key)) {
                const data = this.listMessage.get(key)
                if (data.length >= 1) {
                    rich = this.defaultRich
                    lid = data[0].msgId
                    const snowC = SnowFlake.from(lid)
                    const snowN = SnowFlake.from(lastID)
                    rich.addField("캐시 크기", data.length)
                    rich.addField("캐시 ID", snowC.increment, true)
                    rich.addField("현재 ID", snowN.increment, true)
                    rich.addField("캐시 Timestamp", snowC.timestamp)
                    rich.addField("현재 Timestamp", snowN.timestamp)
                    const url = "https://discordapp.com/channels/" + [channel.guild.id, channel.id, lid].join("/")
                    rich.setDescription(url)
                }
            }
            const msg = await channel.send(this.lang.purge.fetchStart, rich).catch(() => null) as Discord.Message
            // takes long!
            const msgIDs:MessageID[] = await this.fetchMessages(channel, lastID, lid).catch(() => [])
            this.caching = false
            if (lid == null) {
                this.listMessage.set(key, msgIDs)
            } else {
                const timeout = Date.now() - timeLimit
                this.cleanLinear(key, timeout)
                this.listMessage.get(key).unshift(...msgIDs)
            }
            /*
            if (msg != null) {
                await msg.delete()
            }
            */
            return msg
        } else {
            return channel.send(this.lang.purge.fetching).catch(() => null) as Promise<Discord.Message>
        }
    }
    private cleanLinear(key:string, time:number) {
        // use linear search because I think that takes not so long
        if (!this.listMessage.has(key)) {
            return
        }
        const list = this.listMessage.get(key)
        const length = list.length
        // tslint:disable-next-line
        let i;
        for (i = length - 1; i >= 0; --i) {
            const msg = list[i]
            if (msg.timestamp > time) {
                break
            }
        }
        list.splice(i,length - i)
    }
    private async fetchMessages(channel:Discord.TextChannel, lastID:string, end:string = null) {
        // limit of bulkdelete
        const timeout = Date.now() - timeLimit
        let msgid = lastID
        const messages:MessageID[] = []
        while (true) {
            let breakL = false
            const fetch = await channel.fetchMessages({
                limit: bulkLimit,
                before: msgid,
                // after: end,
            })
            let i = 0
            for (const [k, fMsg] of fetch) {
                if (end != null && Number.isNaN(Number.parseInt(end))) {
                    Log.d("NaN", end)
                }
                if (end != null && Number.parseInt(fMsg.id) <= Number.parseInt(end)) {
                    Log.d("EndPoint found", end)
                    breakL = true
                    break
                }
                if (fMsg.createdTimestamp < timeout) {
                    breakL = true
                    break
                } else {
                    messages.push({
                        authorId:fMsg.author.id,
                        msgId:fMsg.id,
                        timestamp: fMsg.createdTimestamp
                    })
                }
                if (i === fetch.size - 1) {
                    // Log.d("Timestamp", (fMsg.createdTimestamp - timeout).toString())
                    msgid = fMsg.id
                    break
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
        return messages
    }
}
class PurgeConfig extends Config {
    public filterExplicit = false
    public delaySec = 0
    public allowLast = true
    public backupChannel = "5353"
    constructor() {
        super("purger")
    }
}
interface MessageID {
    authorId:string;
    msgId:string;
    timestamp:number;
}