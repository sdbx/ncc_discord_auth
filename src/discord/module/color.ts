import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil"

export default class Color extends Plugin {
    // declare config file: use save data
    protected config = new ColorConfig()
    // declare command.
    private colorize:CommandHelp
    private clearColor:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.colorize = new CommandHelp("염색,색 입혀", this.lang.sample.hello)
        this.colorize.addField(ParamType.to, "0xFFFFFF or #ffffff or ffffff or role", true)
        // get parameter as complex
        this.colorize.complex = true
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testColor = this.colorize.check(this.global, command, state)
        if (testColor.match && msg.guild.available) {
            const sub = await this.sub(this.config, msg.guild.id)
            const roles = msg.guild.roles.filter((v) => v.name.startsWith(sub.colorRolePrefix))
            const param = testColor.get(ParamType.to)
            const member = msg.member
            const prefix = sub.colorRolePrefix
            let colorCode:string
            if (param.startsWith("0x")) {
                colorCode = param.substr(2)
            } else if (param.startsWith("#")) {
                colorCode = param.substr(1)
            } else {
                colorCode = param
            }
            const validColor = (/^[0-9A-Fa-f]{6}$/i).test(colorCode)
            if (validColor) {
                colorCode = colorCode.toUpperCase()
            }
            try {
                const definedRole = this.getFirstMap(roles.filter((v) => v.name === (prefix + colorCode)))
                if (definedRole != null) {
                    await this.cleanRole(prefix, member)
                    await member.addRole(definedRole, "Color Nickname")
                    await msg.channel.send(this.lang.color.colorSuccess)
                    await this.clearUnusedColors(prefix, msg.guild)
                    return Promise.resolve()
                }
                if (!validColor) {
                    await msg.channel.send(this.lang.color.wrongColor)
                    return Promise.resolve()
                }
                const colorRole = await msg.guild.createRole({
                    name: prefix + colorCode,
                    permissions: [],
                    color: colorCode,
                })
                if (colorRole != null) {
                    await this.cleanRole(prefix, member)
                    await member.addRole(colorRole)
                    await msg.channel.send(this.lang.color.colorSuccess)
                    await this.clearUnusedColors(prefix, msg.guild)
                }
                return Promise.resolve()
            } catch (err) {
                Log.e(err)
            }
        }
        return Promise.resolve()
    }
    protected async cleanRole(prefix:string, member:Discord.GuildMember) {
        const colorRoles = member.roles.filter((v) => v.name.startsWith(prefix))
        if (colorRoles.size >= 1) {
            return await member.removeRoles(colorRoles)
        }
        return null
    }
    protected async clearUnusedColors(prefix:string, guild:Discord.Guild) {
        const unusedRoles = guild.roles.filter((v) => v.name.startsWith(prefix) && v.members.size <= 0)
        if (unusedRoles.size >= 1) {
            for (const [key, role] of unusedRoles) {
                await role.delete("Unused color")
            }
        }
        return Promise.resolve()
    }
}
class ColorConfig extends Config {
    public colorRolePrefix = "Color_"
    constructor() {
        super("color")
    }
}