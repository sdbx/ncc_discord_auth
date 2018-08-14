import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Cache from "../../cache"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamAccept, ParamType, } from "../runutil"

const bulkLimit = 100
export default class Purge extends Plugin {
    // declare command.
    private purge:CommandHelp
    private listCache:Map<string, Cache<Array<[string, string]>>> = new Map()
    private caching = false
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.purge = new CommandHelp("purge/삭제", this.lang.purge.purgeDesc)
        this.purge.addField(ParamType.dest, "삭제할 갯수 | ALL", true, {code: ["num/개"]})
        // get parameter as complex
        this.purge.complex = true
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testPurge = this.purge.check(this.global, command, state)
        if (testPurge.match) {
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
                if (msg.member.hasPermission("MANAGE_MESSAGES")) {
                    deleteALL = true
                    num = Math.abs(num)
                    deleteCount = Math.abs(deleteCount)
                } else {
                    await msg.channel.send(this.lang.purge.noPermAll)
                    return Promise.resolve()
                }
            }
            await msg.delete()
            // check cache
            const check = await this.checkCache(msg.channel, msg.id)
            if (check != null) {
                Log.d("Caching", check)
                // await msg.channel.send(check)
                return Promise.resolve()
            }
            // add
            const deleteIDs:string[] = []
            const recents = this.listCache.get(msg.channel.id)
            for (const [userid, msgid] of recents.cache) {
                if (deleteALL || userid.toString() === msg.author.id) {
                    deleteIDs.push(msgid.toString())
                }
                if (!all && deleteIDs.length >= deleteCount) {
                    break
                }
            }
            const startMsg = await msg.channel.send(
                sprintf(this.lang.purge.deleting, {total: deleteIDs.length})) as Discord.Message
            // remove
            while (deleteIDs.length > 0) {
                await msg.channel.bulkDelete(deleteIDs.splice(0, Math.min(deleteIDs.length, 100)), true)
            }
            startMsg.delete()
        }
        return Promise.resolve()
    }
    private async checkCache(channel:Discord.TextChannel, lastID:string) {
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
                    channel.send(this.lang.purge.fetchEnd).then((m:Discord.Message) => {
                        m.delete(5000)
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