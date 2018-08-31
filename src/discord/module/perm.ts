import * as Discord from "discord.js"
import * as Reverser from "esrever"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { blankChar, ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil"

export default class PermManager extends Plugin {
    // declare config file: use save data
    protected config = new Config("perm")
    // declare command.
    private debug:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.debug = new CommandHelp("list", this.lang.sample.hello)
        // get parameter as complex
        this.debug.complex = true
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testSample = this.debug.check(this.global, command, state)
        const channel = msg.channel
        if (testSample.match) {
            const self = msg.guild.member(this.client.user)
            const roles = msg.guild.roles.array().sort((a,b) => a.position - b.position)
            const userHLv = this.getHighestLevel(msg.member, "MANAGE_ROLES")
            const botHLv = this.getHighestLevel(self, "MANAGE_ROLES")

            if (userHLv < 0) {
                // No perm to manage role
                await channel.send(this.lang.perm.noPermMangeRole)
                return Promise.resolve()
            }
            //

            const block = "```md\n" + this.printRole(roles, 3, Math.min(userHLv, botHLv)) + "\n```"
            await msg.channel.send(block + "User: " + userHLv + " / Bot: " + botHLv)
            // send Message
            // await msg.reply(this.lang.sample.hello)
        }
        return Promise.resolve()
    }
    public roleInfo(role:Discord.Role) {
        const rich = new Discord.RichEmbed()
        if (role.color > 0) {
            rich.setColor(role.color)
        }
        rich.setTitle(role.name)
        rich.setDescription()
    }
    public printRole(roles:Discord.Role[], selected = -1, disabled = -1, spaceOverride = -1) {
        const names = roles.map((v) => v.name).reverse()
        let out = ""
        let disabledNames = []
        const rSpace = 3 + Math.floor(Math.log10(names.length))
        if (disabled >= 0) {
            disabledNames = names.splice(0, names.length - disabled)
        }
        if (disabledNames.length >= 1) {
            out += this.listDisabledStr(disabledNames, rSpace) + "\n"
        }
        out += this.listStr(names, selected - 1)
        return out
    }
    public getCheckStr(title:string, checked:Checked, index:number, desc?:string) {

    }
    /**
     * Get user's highest level permission
     * @param member User
     * @param perm Asterisk for ALL, Specify for that Perm.
     * @returns Level or -1 (No Perm)
     */
    public getHighestLevel(member:Discord.GuildMember, perm:Discord.PermissionResolvable | "*" = "*") {
        const selfed = member.id === this.client.user.id
        const sorted = member.roles.array().sort((a, b) => a.position - b.position)
        let highestLv = -1
        for (const role of sorted) {
            if (perm === "*" || this.hasPerm(role, perm, selfed)) {
                if (highestLv < role.position) {
                    highestLv = role.position
                }
                highestLv = Math.max(highestLv, role.position)
            }
        }
        return highestLv
    }
    /**
     * Make disabled list string
     * @param name List strings
     */
    public listDisabledStr(name:string[], spaceO = 2) {
        return name.map((v) => ">".padEnd(spaceO) + v).join("\n")
    }
    /**
     * Make numbered list string
     * @param name List strings
     * @param selected Selected at?
     */
    public listStr(name:string[], selected = -1) {
        let str = ""
        let maxl = 1 + Math.floor(Math.log10(name.length))
        maxl += 2
        for (let i = 0; i < name.length; i += 1) {
            let bf = ((i + 1).toString() + ".").padEnd(maxl)
            if (i === selected) {
                bf += `✅[${name[i]}](${this.lang.perm.selected})`
            } else {
                bf += name[i]
            }
            if (i < name.length - 1) {
                bf += blankChar + "\n"
            }
            str += bf
        }
        return str
    }
    public hasPerm(memberOrRole:Discord.GuildMember | Discord.Role, perm:Discord.PermissionResolvable | CustomPerms,
            ignoreCustom = true) {
        const roles = memberOrRole instanceof Discord.GuildMember ? memberOrRole.roles.array() : [memberOrRole]
        const customPerm = typeof perm === "string" && Object.values(CustomPerms).indexOf(perm) >= 0
        for (const role of roles) {
            if (customPerm) {
                // @TODO make..
                return true
            }
            if (role.hasPermission(perm as Discord.PermissionResolvable)) {
                return true
            }
        }
        return false
    }
}
/**
 * In-module Permission declare
 */
export enum CustomPerms {
    /**
     * User having this perm 
     */
    IGNORE_PERM_LEVEL = "IGNORE_PERMLEVEL",
}
export enum Checked {
    on = 1,
    off = -1,
    default = 0,
}