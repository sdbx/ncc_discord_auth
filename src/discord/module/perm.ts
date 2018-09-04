import * as Discord from "discord.js"
import * as Reverser from "esrever"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { blankChar, blankChar2, ChainData, CmdParam, CommandHelp,
    CommandStatus, DiscordFormat, ParamType, thinSpace, toLowerString, } from "../runutil"
const checkAdmin = false
/**
 * General permissions
 */
const generalPerms = {
    "ADMINISTRATOR": "관리자",
    "VIEW_AUDIT_LOG": "감사 로그 보기",
    "MANAGE_GUILD": "서버 관리",
    "MANAGE_ROLES": "역할 관리",
    "MANAGE_CHANNELS": "채널 관리",
    "KICK_MEMBERS": "멤버 추방",
    "BAN_MEMBERS": "멤버 차단",
    "CREATE_INSTANT_INVITE" : "초대 코드 만들기",
    "CHANGE_NICKNAME": "별명 변경",
    "MANAGE_NICKNAMES" : "별명 관리",
    "MANAGE_EMOJIS" : "이모지 관리",
    "MANAGE_WEBHOOKS": "웹훅 관리",
    "VIEW_CHANNEL": "채팅 및 음성 채널 보기",
}
/**
 * Text-Channel Permissions
 */
const textPerms = {
    "SEND_MESSAGES" : "메시지 보내기",
    "SEND_TTS_MESSAGES" : "TTS 메시지 보내기",
    "MANAGE_MESSAGES": "메시지 관리",
    "EMBED_LINKS" : "링크 첨부",
    "ATTACH_FILES" : "파일 첨부",
    "READ_MESSAGE_HISTORY" : "메시지 기록 보기",
    "MENTION_EVERYONE" : "모두를 호출하기",
    "USE_EXTERNAL_EMOJIS" : "외부 스티커를 사용",
    "ADD_REACTIONS" : "반응 추가",
}
/**
 * Voice-Channel Permissions
 */
const voicePerms = {
    "CONNECT" : "연결",
    "SPEAK" : "발언권",
    "MUTE_MEMBERS" : "멤버 마이크 끄기",
    "DEAFEN_MEMBERS" : "멤버 소리 끄기",
    "MOVE_MEMBERS" : "멤버 이동",
    "USE_VAD" : "음성 감지 사용",
    "PRIORITY_SPEAKER" : "발언 우선권",
}
const etcPerms = {
    "CREATE_INSTANT_INVITE": "초대 코드 만들기",
}
const otpPerms:Discord.PermissionString[] = [
    "ADMINISTRATOR",
    "MANAGE_GUILD",
    "MANAGE_ROLES",
    "MANAGE_CHANNELS",
    "KICK_MEMBERS",
    "BAN_MEMBERS",
    "MANAGE_WEBHOOKS",
    "MANAGE_MESSAGES",
]
const descPerms = {
    "ADMINISTRATOR": "모든 권한을 가지고 채널 설정을 무시합니다.",
    "VIEW_AUDIT_LOG": "서버 관리 기록을 볼 수 있습니다.",
    "MANAGE_GUILD": "서버의 위치나 이름을 변경할 수 있습니다.",
    "MANAGE_ROLES": "하위 역할을 수정할 수 있습니다.",
    "MANAGE_CHANNELS": "채널을 창조하거나 파괴할 수 있습니다.",
    "CHANGE_NICKNAME": "자신의 별명을 바꿀 수 있습니다.",
    "MANAGE_NICKNAMES": "다른 사람의 별명을 바꿀 수 있습니다.",
    "SEND_TTS_MESSAGES": "/tts 명령어로 음성 메시지를 보낼 수 있습니다.",
    "MANAGE_MESSAGES": "어느 메세지를 고정하거나 다른 회원의 메시지를 삭제할 수 있습니다.",
    "MENTION_EVERYONE": "모든 멤버에게 알림을 보낼 수 있습니다.",
    "USE_EXTERNAL_EMOJIS": "다른 서버의 이모티콘을 사용할 수 있습니다.",
    "ADD_REACTIONS": "메세지에 새로운 반응을 추가할 수 있습니다.",
    "MOVE_MEMBERS": "특정 멤버를 다른 보이스챗으로 이동시킬 수 있습니다.",
    "USE_VAD": "이 권한이 없는 멤버는 무조건 Push-To-Talk를 이용해야 합니다.",
    "PRIORITY_SPEAKER": "다른 사람이 알아듣기 쉽게 자신이 말할 때 다른 사람의 소리를 낮춥니다.",
}
const generalChPerms:Discord.PermissionString[] = [
    "CREATE_INSTANT_INVITE",
    "MANAGE_CHANNELS",
    "MANAGE_ROLES",
    "MANAGE_WEBHOOKS",
    "VIEW_CHANNEL",
]
const categoryChPerm:Discord.PermissionString[] = [
    ...generalChPerms,
    ...Object.keys(textPerms) as Discord.PermissionString[],
    ...Object.keys(voicePerms) as Discord.PermissionString[]
]
const textChPerm:Discord.PermissionString[] = [
    ...generalChPerms,
    ...Object.keys(textPerms) as Discord.PermissionString[]
]
const voiceChPerm:Discord.PermissionString[] = [
    ...generalChPerms,
    ...Object.keys(voicePerms) as Discord.PermissionString[]
]
const allPerms = {
    ...generalPerms,
    ...textPerms,
    ...voicePerms,
    ...etcPerms,
}

export default class PermManager extends Plugin {
    /**
     * Commands
     * 
     * 1. a(llow) <number | permission> : Allow Permission
     * 2. d(eny) <number | permission> : Deny Permission
     * 3. t(oggle) <number | permission> : Toggle Permission
     * 4. i <number | permission> : Reset Permission
     * 5. s(elect) <channel | role> : Select Role / Channel
     * 6. l(ist) <"channel" | "role"> : List Role/ Channel
     * 7. t(op) <index | role | channel> : Move position to up of role
     * 8. b(ottom) <index | role | channel> : Move position to down of role
     * 
     */
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
        if (testSample.match && msg.channel instanceof Discord.GuildChannel) {
            const self = msg.guild.member(this.client.user)
            const roles = msg.guild.roles.array().sort((a,b) => a.position - b.position)
            const channels = msg.guild.channels.array()
            const userHLv = this.getHighestLevel(msg.member, "MANAGE_ROLES")
            const botHLv = this.getHighestLevel(self, "MANAGE_ROLES")

            if (userHLv < 0) {
                // No perm to manage role
                await channel.send(this.lang.perm.noPermMangeRole)
                return Promise.resolve()
            }
            //
            const block = "```md\n" + this.listRoles(roles, 3, Math.min(userHLv, botHLv)) + "\n```"
            const chInfo = this.channelPermInfo(msg.channel)
            const chList = "```md\n" + this.listChannels(channels, 2) + "```"
            await msg.channel.send(
                block + "User: " + userHLv + " / Bot: " + botHLv + "\n" + chList, this.roleInfo(roles[1]))
            await msg.channel.send(chInfo)
            // send Message
            // await msg.reply(this.lang.sample.hello)
        }
        return Promise.resolve()
    }
    /**
     * Make Channel's PermOverride RichEmbed
     * @param channel Channel
     * @param filterU ?
     */
    public channelPermInfo(channel:Discord.GuildChannel, filterU?:string) {
        const rich = this.defaultRich
        rich.setTitle("Channel Perm")
        const overridePerms = channel.permissionOverwrites.map((po, roleOrMember) => {
            const role = channel.guild.roles.find((v) => v.id === roleOrMember)
            let member:Discord.GuildMember
            if (role == null) {
                member = channel.guild.members.find((v) => v.id === roleOrMember)
            }
            const name = role != null ? role.name : DiscordFormat.getNickname(member)
            let mention:string = null
            if (role != null) {
                if (this.isEveryone(role)) {
                    if (filterU != null && role.id !== filterU) {
                        // filtered.
                        return null
                    }
                    if (role.mentionable) {
                        mention = DiscordFormat.mentionRole(role.id)
                    }
                }
            } else if (member != null) {
                if (filterU != null && member.id !== filterU) {
                    // filtered.
                    return null
                }
                mention = DiscordFormat.mentionUser(member.id)
            }
            return {
                info: role != null ? role : member,
                key:roleOrMember,
                value: po,
                name,
                position: role != null ? role.position : 0.5,
                mention,   
            }
        }).filter((v) => v != null).sort((a, b) =>  b.position - a.position)
        // create req perm list
        let perms:Discord.PermissionString[]
        if (channel.type === "text") {
            perms = textChPerm
        } else if (channel.type === "voice") {
            perms = voiceChPerm
        } else if (channel.type === "category") {
            perms = categoryChPerm
        } else {
            // wtf
            Log.e(new Error("Unexpected Error"))
            return null
        }
        for (const oPerms of overridePerms) {
            const overPerm = oPerms.value
            const name = oPerms.name
            const allowed = overPerm.allowed.toArray(checkAdmin)
            const denied = overPerm.denied.toArray(checkAdmin)
            let out = ""
            if (oPerms.mention != null) {
                out += oPerms.mention + "\n"
            }
            const listPerm = this.printPerms(null, perms, 1, (perm) => {
                let flag = Checked.default
                if (allowed.indexOf(perm) >= 0 ) {
                    flag = Checked.on
                } else if (denied.indexOf(perm) >= 0) {
                    flag = Checked.off
                } else {
                    flag = Checked.hide
                }
                return flag
            })
            if (listPerm.length <= 0) {
                const badminton = "\u{1F3F8}"
                out += badminton
            } else {
                out += `\`\`\`md\n${listPerm}\`\`\``
            }
            rich.addField(name + "\nid: " + oPerms.info.id, out)
        }
        let parentPerm:number = 0
        const everyonePerm = channel.guild.roles.find(this.isEveryone).permissions
        if (filterU != null && overridePerms.length >= 1) {
            const pm = overridePerms[0].info.permissions
            if (typeof pm === "number") {
                parentPerm = pm
            } else {
                parentPerm = pm.bitfield
            }
        }
        let add = "```md\n"
        add += this.printPerms(new Discord.Permissions(parentPerm | everyonePerm), perms, 1)
        add += "```"
        rich.addField("@global", add)
        return rich
    }
    /**
     * Make Permissions' RichEmbed from Role
     * @param role Role
     */
    public roleInfo(role:Discord.Role) {
        const rich = this.defaultRich
        if (role.color > 0) {
            rich.setColor(role.color)
        } else {
            rich.setColor(null)
        }
        rich.setTitle(role.name)
        const perms = new Discord.Permissions(role.permissions)
        // General Permission
        const pairs = [
            ["일반 권한", generalPerms],
            ["채팅 권한", textPerms],
            ["음성 권한", voicePerms],
        ]
        let offset = 1
        // let rolePermInfo = "```md\n"
        if (perms.has("ADMINISTRATOR")) {
            const joker = "\u{1F0CF}"
            rich.addField("주의", joker + "**관리자**는 밑의 규칙을 무시하고 **모든** 권한을 갖습니다.")
        }
        for (const [field, perm] of pairs) {
            const keys = Object.keys(perm) as Discord.PermissionString[]
            // rolePermInfo += `# ${field}`
            // rolePermInfo += `\n${this.printPerms(perms, keys, offset)}\n`
            rich.addField(field, `\`\`\`md\n${this.printPerms(perms, keys, offset)}\`\`\``)
            offset += keys.length
        }
        // rolePermInfo += "```"
        // rich.setDescription(rolePermInfo)
        return rich
    }
    /**
     * Create Permission's list string
     * @param perms Default Permissions list (null if custom checkFn)
     * @param query Checking permissions (to Show)
     * @param startIndex Start index of list (Ex. 1. starts from 1)
     * @param checkFn Custom Permission status Checking Function
     */
    public printPerms(perms:Discord.Permissions, query?:Discord.PermissionString[], startIndex = 0,
            checkFn:(perm:Discord.PermissionString) => Checked = null) {
        if (query == null) {
            query = Object.keys(Discord.Permissions.FLAGS) as Discord.PermissionString[]
        }
        if (checkFn == null) {
            checkFn = (perm) => (perms.has(perm, checkAdmin)) ? Checked.on : Checked.off
        }
        let out = ""
        for (let i = 0; i < query.length; i += 1) {
            const q = query[i]
            let title = allPerms[q]
            if (title == null) {
                title = toLowerString(q)
            }
            const checked = checkFn(q)
            if (checked === Checked.hide) {
                continue
            }
            const desc = descPerms[q]
            out += this.getCheckStr(title, checked, i + startIndex,desc, otpPerms.indexOf(q) >= 0)
            if (i < query.length - 1) {
                out += "\n"
            }
        }
        return out
    }
    /**
     * Print Roles list
     * 
     * Also modify `roles` order.
     * @param roles Roles
     * @param selected Selected Position (highlighted)
     * @param disabled Disable Position (0...length - 1)
     * @param spaceOverride ?
     */
    public listRoles(roles:Discord.Role[], selected = -1, disabled = -1, spaceOverride = -1) {
        roles.sort((a, b) => a.position - b.position).reverse()
        const names = roles.map((v) => v.name)
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
    /**
     * Print Channel's list
     * 
     * Also modify `channels` order.
     * @param channels Channels
     * @param selected Selected Position (highlighted)
     */
    public listChannels(channels:Discord.GuildChannel[], selected = -1) {
        channels.sort((a, b) =>  a.position - b.position)
        const sorts:string[] = [] // sorting infomation
        const roots:Discord.GuildChannel[] = [] // uncategories
        const goryMap = new Map<string, Discord.GuildChannel[]>() // categoried maps
        // tslint:disable-next-line:semicolon
        const categories:Discord.CategoryChannel[] = []; // the categories
        for (const ch of channels) {
            if (ch.type === "category" && ch instanceof Discord.CategoryChannel) {
                categories.push(ch)
                continue
            }
            if (ch.parentID == null) {
                roots.push(ch)
                continue
            }
            if (!goryMap.has(ch.parentID)) {
                goryMap.set(ch.parentID, [ch])
            } else {
                goryMap.get(ch.parentID).push(ch)
            }
        }
        let out = ""
        let index = 1
        const toName = (v:Discord.GuildChannel) => v.name
        const push = (ch:Discord.GuildChannel, prefix?:string) => {
            sorts.push(ch.id)
            out += this.listStr([(prefix != null ? prefix : "") + ch.name], selected - index, index) + "\n"
            index += 1
        }
        for (const _root of roots) {
            push(_root)
        }
        for (const _category of categories) {
            const label = "\u{1F3F7}"
            push(_category, label)
            const uni = _category.name.match(/[ -~]/ig)
            out += "\n".padStart(_category.name.length * 2 - (uni == null ? 0 : uni.length), "=")
            if (goryMap.has(_category.id)) {
                const groups = goryMap.get(_category.id)
                groups.sort((a, b) => {
                    const aI = a.type === "voice" ? a.position + 65536 : a.position
                    const bI = b.type === "voice" ? b.position + 65536 : b.position
                    return aI - bI
                })
                sorts.push(...groups.map((v) => v.id))
                out += this.listStr(groups.map((v) => {
                    if (v.type === "voice") {
                        const mic = "\u{1F3A4}"
                        return mic + v.name
                    } else {
                        return v.name
                    }
                }), selected - index, index)
                index += groups.length
                out += "\n"
            }
        }
        channels.sort((a, b) => sorts.indexOf(a.id) - sorts.indexOf(b.id))
        Log.d("Channels", channels.map((v) => v.name).join("\n"))
        return out
    }
    /**
     * Generate check markdown
     * @param title Title of permission
     * @param checked Checked?
     * @param index Number of selector
     * @param desc Description
     * @param needOTP needs OTP?
     */
    public getCheckStr(title:string, checked:Checked, index:number, desc?:string, needOTP = false) {
        let str = `${(index.toString(10) + ".").padEnd(3)}${thinSpace}`
        if (needOTP) {
            const lock = "\u{1F510}"
            str += lock
        }
        str += `[${title}]`
        if (checked !== Checked.on) {
            str += blankChar2
        }
        str += "("
        const check = checked === Checked.default ? "\u{2753}" : (checked === Checked.on ? "\u{2705}" : "\u{274C}")
        str += check
        str += ")"
        if (desc != null) {
            if (checked !== Checked.on) {
                str += ` ${desc}`
            } else {
                str += `*${thinSpace}${desc}*`
            }
        }
        return str
    }
    /**
     * Get user's highest level permission
     * @param member User
     * @param perm Asterisk for ALL, Specify for that Perm.
     * @returns Level or -1 (No Perm)
     */
    public getHighestLevel(member:Discord.GuildMember, perm:Discord.PermissionResolvable | "*" = "*") {
        const selfed = member.id === this.client.user.id
        const sorted = this.sortByLevel(member.roles.array())
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
    public listStr(name:string[], selected = -1, startIndex = 1) {
        let str = ""
        let maxl = Math.floor(Math.log10(startIndex + name.length))
        maxl += 2
        for (let i = 0; i < name.length; i += 1) {
            let bf = ((i + startIndex).toString() + ".").padEnd(maxl)
            bf += thinSpace
            if (i === selected) {
                bf += `✅[${name[i]}](${this.lang.perm.selected})`
            } else {
                bf += name[i]
            }
            if (i < name.length - 1) {
                bf += "\n"
            }
            str += bf
        }
        return str
    }
    /**
     * Custom hasPermission which overridable from Config (fake)
     * 
     * WIP.
     * @param memberOrRole 
     * @param perm 
     * @param ignoreCustom 
     */
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
    public isEveryone(role:Discord.Role) {
        return role.position <= 0
    }
    public sortByLevel(arr:Discord.Role[]) {
        return arr.sort((a, b) => a.position - b.position)
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
    hide = -53,
}