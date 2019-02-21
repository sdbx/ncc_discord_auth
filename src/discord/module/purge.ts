import Discord from "discord.js"
import fs from "fs-extra"
import path from "path"
import request from "request-promise-native"
import { sprintf } from "sprintf-js"
import tmp from "tmp-promise"
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
    private filterRegex = new RegExp(`(${filterSimple.map((v) => {
        if (v.length <= 1) {
            return v
        }
        return `(${v.split("").join(`[ -~\u{00A1}-\u{ABFF}\u{D7A4}-\u{FEFF}]*`)})`
    }).join("|")})`, "ig")
    private tempDir:tmp.DirectoryResult
    private cacheFiles:Map<string, AttachmentBackup> = new Map()
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
                    const deletes:string[] = []
                    const rich = new Discord.RichEmbed()
                    const attaches:Discord.Attachment[] = []
                    for (const [key, org_attach] of msg.attachments) {
                        const file = await this.getCachedFile(key)
                        if (file != null) {
                            deletes.push(file.path)
                            attaches.push(file.attach)
                        } else {
                            rich.addField("첨부했던 파일", org_attach.filename)
                        }
                    }
                    rich.setDescription("사용자: " + DiscordFormat.mentionUser(msg.author.id))
                    await webhook.send(cloned.content, {
                        embeds: [rich],
                        files: attaches,
                    })
                    for (const dl of deletes) {
                        try {
                            await fs.remove(dl)
                        } catch (err) {
                            Log.e(err)
                        }
                    }
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
        this.tempDir = await tmp.dir({
            unsafeCleanup: true,
        })
        return Promise.resolve()
    }
    public async onMessage(msg:Discord.Message) {
        if (!(msg.channel instanceof Discord.TextChannel)) {
            return
        }
        const sub = await this.sub(this.config, msg.guild.id)
        if (sub.filterExplicit && !msg.channel.nsfw &&
            msg.content.match(this.filterRegex) != null) {
            const perms = msg.channel.permissionsFor(msg.guild.me)
            if (perms.has("MANAGE_MESSAGES")) {
                if (perms.has("MANAGE_WEBHOOKS")) {
                    const webhook = await this.getWebhook(msg.channel,
                        ...DiscordFormat.getUserProfile(msg.member)).catch(Log.e)
                    if (webhook != null) {
                        const clone = cloneMessage(msg)
                        const content = clone.content.replace(this.filterRegex, (s) => `||${s}||`)
                        await webhook.send(content, {
                            files: clone.attaches,
                            embeds: clone.embeds,
                        } as Discord.WebhookMessageOptions)
                    }
                }
                await msg.delete()
            }
        }
        if (msg.attachments.size >= 1 && msg.guild.channels.find((v) => v.id === sub.backupChannel)) {
            await this.addFileCache(msg.attachments, msg.createdTimestamp)
        }
        if (sub.useCache && msg.content.length >= 1 && !this.purge.check(this.global, msg.content).match) {
            const lastM = this.getLastMsg(msg.channel.id)
            if (lastM == null || Date.now() - lastM.timestamp >= 600000) {
                // slient & no await.
                this.updateCache(msg.channel, msg.id, false)
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
            /*
            if (deleteCount + (deleteALL ? 0 : 50) < 0) {
                // instant delete
                const fastFetches = await msg.channel.fetchMessages({
                    limit: 100,
                    before: msg.id,
                })
                const selected:string[] = []
                let connectedLast = true
                for (const [, fetchM] of fastFetches) {
                    const authored = fetchM.author.id === msg.author.id
                    if (selected.length >= deleteCount) {
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
                if (selected.indexOf(msg.id) < 0) {
                    selected.push(msg.id)
                }
                await msg.channel.bulkDelete(selected)
                return Promise.resolve()
            }
            */
            // check cache
            const caching = this.caching
            const lastM = this.getLastMsg(msg.channel.id)
            const progress = await this.updateCache(msg.channel, msg.id, true)
            if (caching) {
                await msg.delete()
                await progress.delete(5000)
                return Promise.resolve()
            }
            const cacheArr = this.listMessage.get(msg.channel.id)
            if (cacheArr == null || cacheArr.length === 0 || 
                this.listMessage.get(msg.channel.id)[0].msgId !== msg.id) {
                // reset cache
                this.listMessage.delete(msg.channel.id)
                await this.updateCache(msg.channel, msg.id, false)
            }
            // add queue
            this.working.push(msg.author.id)
            // add
            const deleteIDs:string[] = []
            const recents = this.listMessage.get(msg.channel.id)
            let recentL = recents.length
            let multiplySelf = true
            for (let i = 0; i < recentL; i += 1) {
                const {authorId, msgId, timestamp} = recents[i]
                const self = authorId === msg.author.id
                const selfBot = authorId === this.client.user.id
                if (multiplySelf && !self && !selfBot) {
                    multiplySelf = false
                }
                let del = false
                if (timestamp <= allowTime) {
                    // old time: pass
                    del = true
                } else if (gConfig.allowLast && multiplySelf) {
                    // solo said: pass
                    del = true
                } else if (deleteALL) {
                    // admin: pass
                    del = true
                }
                if (deleteALL || self) {
                    // delete target
                    if (!del) {
                        // exception by rule
                        deleteCount -= 1
                    }
                } else {
                    del = false
                }
                if (del) {
                    recentL -= 1
                    recents.splice(i, 1)
                    i -= 1
                    deleteIDs.push(msgId.toString())
                }
                if (!all && deleteIDs.length > deleteCount) {
                    break
                }
            }
            let startMsg:Discord.Message
            if (deleteIDs.length >= 50) {
                startMsg = await msg.channel.send(
                    sprintf(this.lang.purge.deleting, { total: deleteIDs.length })) as Discord.Message
            }
            // deleteIDs.unshift(msg.id)
            if (progress != null) {
                deleteIDs.unshift(progress.id)
            }
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
    public async onDestroy() {
        if (this.tempDir != null) {
            this.tempDir.cleanup()
        }
        return super.onDestroy()
    }
    private async getCachedFile(fileid:string) {
        if (!this.cacheFiles.has(fileid)) {
            return null
        }
        const c = this.cacheFiles.get(fileid)
        if (await fs.pathExists(c.filePath)) {
            this.cacheFiles.delete(fileid)
            return {
                path: c.filePath,
                attach: new Discord.Attachment(fs.createReadStream(c.filePath, {encoding: null}), c.fileName)
            }
        } else {
            return null
        }
    }
    private async addFileCache(files:Discord.Collection<string, Discord.MessageAttachment>, time:number) {
        const now = Date.now()
        for (const [key, attach] of files) {
            const attachFile = path.resolve(this.tempDir.path, key)
            try {
                await fs.writeFile(attachFile, await request.get(attach.url, {encoding: null}))
            } catch (err) {
                Log.e(err)
                continue
            }
            this.cacheFiles.set(attach.id, {
                id: attach.id,
                fileName: attach.filename,
                fileSize: attach.filesize,
                filePath: attachFile,
                timestamp: time,
            })
        }
        const fmaps:Array<{fsize:number, fkey:string}> = []
        let totalSize:number = 0
        for (const [key, cache] of this.cacheFiles) {
            fmaps.push({
                fsize: cache.fileSize,
                fkey: key,
            })
            totalSize += cache.fileSize
        }
        for (const sizei of fmaps) {
            const m = this.cacheFiles.get(sizei.fkey)
            // total cache size: 209715200 (200MB)
            // timestamp limit: one day
            if (totalSize < 209715200 && now - m.timestamp <= 86400000) {
                break
            }
            try {
                await fs.remove(m.filePath)
                this.cacheFiles.delete(sizei.fkey)
                totalSize -= sizei.fsize
            } catch (err) {
                Log.e(err)
            }
        }
    }
    private getLastMsg(channelId:string) {
        if (!this.listMessage.has(channelId)) {
            return null
        }
        const ar = this.listMessage.get(channelId)
        if (ar.length === 0) {
            return null
        }
        return ar[0]
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
    private async updateCache(channel:Discord.TextChannel, lastID:string, useMsg = true) {
        // check cache
        const key = channel.id
        if (!this.caching) {
            this.caching = true
            let rich:Discord.RichEmbed = null
            let lid:string = null
            if (this.listMessage.has(key)) {
                const data = this.listMessage.get(key)
                if (data.length >= 1) {
                    lid = data[0].msgId
                    if (useMsg) {
                        rich = this.defaultRich
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
            }
            let msg:Discord.Message
            if (useMsg) {
                msg = await channel.send(this.lang.purge.fetchStart, rich).catch(() => null) as Discord.Message
            }
            // takes long!
            const msgIDs:MessageID[] = await this.fetchMessages(channel, lastID, lid).catch(() => [])
            if (lid == null) {
                this.listMessage.set(key, msgIDs)
            } else {
                if (msgIDs.length >= 1 && msgIDs[msgIDs.length - 1].msgId === lid) {
                    msgIDs.splice(msgIDs.length - 1, 1)
                }
                const timeout = Date.now() - timeLimit
                this.cleanLinear(key, timeout)
                this.listMessage.get(key).unshift(...msgIDs)
            }
            this.caching = false
            /*
            if (msg != null) {
                await msg.delete()
            }
            */
            return useMsg ? msg : null
        } else {
            if (useMsg) {
                return channel.send(this.lang.purge.fetching).catch(() => null) as Promise<Discord.Message>
            } else {
                return null
            }
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
        let deletes = 0
        for (let i = length - 1; i >= 0; --i) {
            const msg = list[i]
            if (msg.timestamp > time) {
                break
            } else {
                deletes += 1
            }
        }
        if (deletes >= 1) {
            list.splice(length - deletes, deletes)
        }
    }
    /**
     * Fetch Messages from channel
     * @param channel Channel
     * @param start The last message of parse (recent)
     * @param breaker The Breaker.
     */
    private async fetchMessages(channel:Discord.TextChannel, start:string, end?:string,
        incStart = true) {
        // limit of bulkdelete
        const timeout = Date.now() - timeLimit
        let msgid:string
        const messages:MessageID[] = []
        if (!incStart) {
            msgid = start
        }
        let breakL = false
        while (!breakL) {
            let fetches:Discord.Message[]
            if (msgid === undefined) {
                fetches = [await channel.fetchMessage(start)]
            } else {
                fetches = (await channel.fetchMessages({
                    limit: bulkLimit,
                    before: msgid,
                })).array()
            }
            for (const msg of fetches) {
                if (end != null) {
                    if (Number.isNaN(Number.parseInt(end))) {
                        throw new Error("Wrong Coding.")
                    } else if (msg.createdTimestamp < SnowFlake.from(end).timestamp) {
                        breakL = true
                    }
                }
                if (msg.createdTimestamp < timeout) {
                    breakL = true
                }
                if (!breakL) {
                    messages.push(this.asSimple(msg))
                } else {
                    break
                }
            }
            if (fetches.length >= 1) {
                msgid = fetches[fetches.length - 1].id
            } else {
                breakL = true
            }
        }
        return messages
    }
    private asSimple(msg:Discord.Message):MessageID {
        let content = msg.content
        if (msg.attachments.size >= 1) {
            for (const [, attach] of msg.attachments) {
                if (content.length >= 1) {
                    content += `\n${attach.filename} (${attach.url})`
                } else {
                    content += `${attach.filename} (${attach.url})`
                }
                break
            }
        }
        return {
            authorId: msg.author.id,
            authorName: DiscordFormat.getNickname(msg.member),
            content,
            msgId: msg.id,
            timestamp: msg.createdTimestamp,
        }
    }
}
class PurgeConfig extends Config {
    public filterExplicit = false
    public delaySec = 0
    public allowLast = true
    public useCache = true
    public backupChannel = "5353"
    constructor() {
        super("purger")
    }
}
interface MessageID {
    authorId:string;
    authorName:string;
    msgId:string;
    content:string;
    timestamp:number;
}
interface AttachmentBackup {
    id:string;
    timestamp:number;
    fileName:string;
    filePath:string;
    fileSize:number;
}
enum MessageCheck {
    SKIP,
    BREAK,
    PASS,
}