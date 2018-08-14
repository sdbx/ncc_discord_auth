import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamAccept, ParamType, } from "../runutil"

const bulkLimit = 100
export default class Purge extends Plugin {
    // declare command.
    private purge:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.purge = new CommandHelp("purge,삭제", this.lang.sample.hello)
        this.purge.addField(ParamType.dest, "삭제할 갯수", true, {code: ["num/개"], accept:ParamAccept.NUMBER})
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
            let num = Number.parseInt(numStr)
            if (!Number.isSafeInteger(num)) {
                await msg.channel.send("__")
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
            let deleteALL = false
            const userid = msg.author.id
            const canDelete = Date.now() - 1000 * 3600 * 24 * 14 + 60000
            let msgid = msg.id
            let deleteCount = num
            const deleteMsgs:string[] = []
            deleteMsgs.push(msg.id)
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
            const delStr = (success:number) => {
                if (num - success <= 0) {
                    return this.lang.purge.success
                } else {
                    return sprintf(this.lang.purge.deleting, {
                        success,
                        total:num,
                    })
                }
            }
            const notifier = await msg.channel.send(delStr(0)) as Discord.Message
            // add all self message
            while (true) {
                const messages = await msg.channel.fetchMessages({
                    before:msgid,
                    limit: bulkLimit,
                })
                if (messages.size <= 0) {
                    // no message
                    break
                }
                let endTime = false
                const deletes = messages.filter((v) => {
                    const inTime = v.createdTimestamp >= canDelete
                    if (!inTime) {
                        endTime = true
                    }
                    return (v.author.id === userid || deleteALL) && inTime
                }).map((v) => v.id)
                if (deleteCount < deletes.length) {
                    deleteMsgs.push(...deletes.sort((a, b) => Number.parseInt(b) - Number.parseInt(a))
                    .slice(0, deleteCount))
                    deleteCount = 0
                } else {
                    deleteMsgs.push(...deletes)
                    deleteCount -= deletes.length
                }
                msgid = messages.array()[messages.size - 1].id
                if (messages.size < bulkLimit || endTime || deleteCount <= 0) {
                    // end of line
                    break
                }
            }
            // bulkDelete
            while (true) {
                const deletes = deleteMsgs.splice(0, Math.min(deleteMsgs.length, bulkLimit))
                try {
                    await msg.channel.bulkDelete(deletes)
                    await notifier.edit(delStr(num - deleteMsgs.length))
                } catch (err) {
                    Log.e(err)
                    break
                }
                if (deleteMsgs.length <= 0) {
                    break
                }
            }
            await notifier.delete(1000)
        }
        return Promise.resolve()
    }
}