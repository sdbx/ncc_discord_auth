import Discord, { TextChannel } from "discord.js"
import fetch from "node-fetch"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { ChainData, CmdParam, ParamAccept, ParamType, UniqueID } from "../rundefine"
import {
    cloneMessage, CommandHelp, CommandStatus, DiscordFormat,
    getFirstMap, getRichTemplate, SnowFlake
} from "../runutil"

const imageTypes = [
    "image/gif",
    "image/jpeg",
    "image/png",
]

export default class Say extends Plugin {
    public config = new SayConfig()
    // declare config file: use save data
    // protected config = new Config("sample")
    // declare command.
    protected sayMe:CommandHelp
    protected codeImage = ["image", "프사", "이미지"]
    protected codeText = ["nick", "이름", "닉네임"]
    protected codeUser = ["user", "유저", "아이디", "계정"]
    protected userProfile:Map<string,HookUser>  = new Map()
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        this.sayMe = new CommandHelp("say/sayM/말", this.lang.sayM.sayDesc, true, {
            chatType: "guild"
        })
        this.sayMe.addField(ParamType.dest, "할 말", false)
        this.sayMe.addField(ParamType.to, "프로필 설정", false, {
            code: [this.codeImage.join("/"), this.codeText.join("/"), this.codeUser.join("/")]})
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testSay = this.sayMe.check(this.global, command, state)
        if (testSay.match && msg.guild.available) {
            const feature = await this.subUnique(this.config, msg, UniqueID.guild, true)
            if (feature.useSaying) {
                return
            }
            if (!this.userProfile.has(msg.channel.id)) {
                this.userProfile.set(msg.channel.id, {
                    nickname: DiscordFormat.getNickname(msg.guild.me),
                    image: DiscordFormat.getAvatarImage(msg.guild.me),
                })
            }
            const user = this.userProfile.get(msg.channel.id)
            if (testSay.has(ParamType.to)) {
                const text = testSay.get(ParamType.to)
                const codeType = testSay.code(ParamType.to)
                const orgImage = user.image
                if (this.codeImage.indexOf(codeType) >= 0) {
                    if (/^https?:\/\//.test(text)) {
                        const iType = await fetch(text).then((res) => res.headers.get("Content-Type"))
                        if (imageTypes.indexOf(iType) >= 0) {
                            user.image = text
                        } else {
                            await msg.channel.send(this.lang.sayM.noImage)
                        }
                    }
                } else if (this.codeText.indexOf(codeType) >= 0) {
                    user.nickname = text.substring(0, Math.min(text.length, 32))
                } else if (this.codeUser.indexOf(codeType) >= 0) {
                    let discordUser:Discord.GuildMember
                    if (/^<@\!?\d+>$/i.test(text)) {
                        const id = text.match(/\d+/i)[0]
                        discordUser = msg.guild.members.find((v) => v.id === id)
                    } else {
                        discordUser = msg.guild.members.find((v) => DiscordFormat.getNickname(v) === text)
                    }
                    if (discordUser != null) {
                        user.nickname = DiscordFormat.getNickname(discordUser)
                        user.image = DiscordFormat.getAvatarImage(discordUser)
                    } else {
                        await msg.channel.send(this.lang.sayM.noDiscordUser)
                    }
                }
                if (orgImage !== user.image && msg.channel instanceof TextChannel) {
                    // await this.getWebhook(msg.channel, user.nickname, user.image)
                }
                // this.userProfile.set(msg.channel.id, user)
            }
            if (msg.attachments.size >= 1) {
                const image = getFirstMap(msg.attachments)
                if (image.width >= 1 && image.height >= 1) {
                    user.image = image.url
                }
            }
            if (testSay.has(ParamType.dest) && msg.channel instanceof TextChannel) {
                msg.delete()
                const hook = await this.getWebhook(msg.channel, user.nickname, user.image)
                if (feature.logName) {
                    const embed = new Discord.RichEmbed()
                    embed.setDescription(`||${DiscordFormat.mentionUser(msg.author.id)}||`)
                    await hook.send(testSay.get(ParamType.dest), {
                        embeds: [embed],
                    })
                } else {
                    await hook.send(testSay.get(ParamType.dest))
                }
            }
        }
        return Promise.resolve()
    }
}
interface HookUser {
    nickname:string
    image:string
}
class SayConfig extends Config {
    public useSaying = true
    public logName = false
    public constructor() {
        super("sayconf")
    }
}