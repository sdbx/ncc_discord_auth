import * as colorConvert from "color-convert"
import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Cache from "../../cache"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil"

// tslint:disable-next-line
const mdnPicker = `https://mdn.mozillademos.org/en-US/docs/Web/CSS/CSS_Colors/Color_picker_tool$samples/ColorPicker_Tool`
export default class Color extends Plugin {
    // declare config file: use save data
    protected config = new ColorConfig()
    protected colorRegex = /^[0-9A-Fa-f]{6}$/i
    // declare command.
    private colorize:CommandHelp
    private lastMessaged:Map<string, number> = new Map()
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.colorize = new CommandHelp("염색,색 입혀", this.lang.color.colorDesc)
        this.colorize.addField(ParamType.to, "<6Digit Hex> or default or 기본", true)
        // get parameter as complex
        this.colorize.complex = true
        return Promise.resolve()
    }
    public async onMessage(msg:Discord.Message) {
        const now = Date.now()
        if (msg.guild == null) {
            return
        }
        const sub = await this.sub(this.config, msg.guild.id)
        const key = msg.guild.id + "$" + msg.author.id
        const time = this.lastMessaged.get(key)
        if (time == null) {
            this.lastMessaged.set(key, now)
            return 
        }
        if (Date.now() - time >= 10000) {
            const colorRoles = msg.guild.roles.map((v) => {
                const cl = v.name.startsWith(sub.colorRolePrefix)
                const rand = v.name.startsWith(sub.colorRolePrefix + "Random")
                if (!cl) {
                    return null
                }
                return {
                    color: cl && !rand,
                    rand,
                    value:v
                }
            }).filter((v) => v != null)
            const randRoles = colorRoles.filter((v) => v.rand)
            for (const rRole of randRoles) {
                let color:number
                if (Math.random() * 100 >= sub.pureRand) { 
                    color = colorRoles[Math.floor(colorRoles.length * Math.random())].value.color
                } else {
                    color = Math.floor(Math.random() * 0x1000000)
                }
                await rRole.value.setColor(color, "Random Color")
            }
            this.lastMessaged.set(key, now)
        }
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
            const validColor = this.colorRegex.test(colorCode)
            if (validColor) {
                colorCode = colorCode.toUpperCase()
            }
            const setRole = async (role:Discord.Role) => {
                await this.cleanRole(prefix, member)
                await member.addRole(role)
                await this.clearUnusedColors(prefix, msg.guild)
                return Promise.resolve()
            }
            const getRich = async (color:string) => {
                const rich = this.defaultRich
                rich.setColor(color)
                const [r,g,b] = colorConvert.hex.rgb(color)
                const [h,s,v] = colorConvert.hex.hsv(color)
                /*
                const image = Buffer.from(`<svg>
                <rect width="128" height="128" style="fill:rgb(${r},${g},${b})"></rect>
                </svg>`)
                rich.attachFile(new Discord.Attachment(await sharp(image).toBuffer(), "color.png"))
                rich.setThumbnail("attachment://color.png")
                */
                rich.setTitle(this.lang.color.colorSuccess)
                rich.setColor(color)
                const profile = DiscordFormat.getUserProfile(member)
                rich.setAuthor(profile[0], profile[1])
                rich.setURL(mdnPicker)
                rich.addField("Red", r, true)
                rich.addField("Green", g, true)
                rich.addField("Blue", b, true)
                rich.addBlankField(false)
                rich.addField("Hue", sprintf("%d",h), true)
                rich.addField("Saturation", sprintf("%d%%",s), true)
                rich.addField("Value", sprintf("%d%%",v), true)
                return rich
            }
            try {
                if (colorCode === "000000") {
                    colorCode = "010101"
                }
                if (colorCode.toLowerCase() === "default" || colorCode === "기본") {
                    await this.cleanRole(prefix, member)
                    await this.clearUnusedColors(prefix, msg.guild)
                    return Promise.resolve()
                }
                const definedRole = this.getFirstMap(roles.filter((v) => v.name === (prefix + colorCode)))
                if (definedRole != null) {
                    await setRole(definedRole)
                    await msg.channel.send(
                        await getRich(definedRole.color.toString(16).padStart(6, "0")))
                    return Promise.resolve()
                }
                if (colorCode.toLowerCase() === "random" || colorCode === "랜덤") {
                    const role = await msg.guild.createRole({
                        name: prefix + "Random",
                        permissions:[],
                        mentionable: true,
                        color: 0x000000,
                    })
                    await setRole(role)
                    await msg.channel.send("알록달록")
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
                    await setRole(colorRole)
                    await msg.channel.send(await getRich(colorCode))
                }
                return Promise.resolve()
            } catch (err) {
                Log.e(err)
            }
        }
        return Promise.resolve()
    }
    protected async cleanRole(prefix:string, member:Discord.GuildMember):Promise<Discord.GuildMember> {
        const colorRoles = member.roles.filter((v) => v.name.startsWith(prefix))
        if (colorRoles.size >= 1) {
            return member.removeRoles(colorRoles)
        }
        return Promise.resolve(null)
    }
    protected async clearUnusedColors(prefix:string, guild:Discord.Guild) {
        const unusedRoles = guild.roles.filter((v) => v.name.startsWith(prefix) && v.members.size <= 0)
        if (unusedRoles.size >= 1) {
            for (const [key, role] of unusedRoles) {
                if (this.colorRegex.test(role.name.replace(prefix, ""))) {
                    await role.delete()
                }
            }
        }
        return Promise.resolve()
    }
}
class ColorConfig extends Config {
    public colorRolePrefix = "Color_"
    public pureRand = 30
    constructor() {
        super("color")
    }
}