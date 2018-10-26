import Discord from "discord.js"
import Reverser from "esrever"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { blankChar2, ChainData, CmdParam, ParamType, thinSpace } from "../rundefine"
import { CommandHelp, decodeCmdInput, DiscordFormat, encodeCmdInput, toLowerString } from "../runutil"
import { coolors } from "./color"
const checkAdmin = false
/**
 * Emojis
 */
const disk = "\u{1F4BE}"
const icecream = "\u{1F368}"
const mic = "\u{1F3A4}"
const textChat = "\u{1F4AC}"
const generalChat = "\u{2699}"
const dango = "\u{1F361}"
const flagEmoji = "\u{1F3C1}"
const palatte = "\u{1F3A8}"
const trash = "\u{1F5D1}"
const sushi = "\u{1F363}"
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
    private editRole:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        // CommandHelp: suffix, description
        this.editRole = new CommandHelp("roles/그룹 편집", this.lang.sample.hello, true)
        this.editRole.addField(ParamType.dest, "Role 이름", false)
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const isGuild = msg.guild != null && msg.guild.available
        const guild = msg.guild
        const testERole = this.editRole.check(this.global, command, state)
        const channel = msg.channel
        if (testERole.match && isGuild) {
            const self = guild.member(this.client.user)
            const roles = guild.roles.array().sort((a,b) => a.position - b.position)
            const channels = guild.channels.array()
            const userHLv = this.getHighestLevel(msg.member, "MANAGE_ROLES")
            const botHLv = this.getHighestLevel(self, "MANAGE_ROLES")

            if (userHLv < 0 || botHLv < 0) {
                // No perm to manage role
                await channel.send(this.lang.perm.noPermMangeRole)
                return Promise.resolve()
            }
            // array's index
            const limitation = roles.length - Math.min(userHLv, botHLv) - 1
            let startI = -1
            let cType = ChainType.LIST_ROLE
            if (testERole.has(ParamType.dest)) {
                const v = testERole.get(ParamType.dest)
                for (const role of roles) {
                    if (role.name === v) {
                        // reverse aligned position.
                        startI = roles.length - role.position - 1
                        cType = ChainType.EDIT_ROLE
                        break
                    }
                }
            }
            const rData = roles.map((v) => ({
                ...v,
                guild:guild.id,
            } as RoleData)).reverse()
            this.startChain<ChainRole>(channel.id, msg.author.id, cType, {
                select: startI,
                roles: rData,
                // commands: new Map(),
                offset: limitation,
                messageID: null,
                permShow: PermShow.GENERAL | PermShow.TEXT | PermShow.VOICE,
                apply: false,
                moveCommands: [],
            })
            await this.callChain(msg)
            /*
            const block = "```md\n" + this.listRoles(roles, 3, Math.min(userHLv, botHLv)) + "\n```"
            const chInfo = this.channelPermInfo(msg.channel as Discord.GuildChannel)
            const chList = "```md\n" + this.listChannels(channels, 2) + "```"
            await msg.channel.send(
                block + "User: " + userHLv + " / Bot: " + botHLv + "\n" + chList, this.roleInfo(roles[1]))
            await msg.channel.send(chInfo)
            */
            // send Message
            // await msg.reply(this.lang.sample.hello)
        }
        return Promise.resolve()
    }
    protected async onChainMessage(message:Discord.Message, type:number, rawData:ChainData):Promise<ChainData> {
        const content = message.content
        if (!(message.channel instanceof Discord.TextChannel)) {
            return rawData
        }
        /**
         * Edit or send message
         * @param _content Send Content
         * @param mid Message ID (nullable)
         */
        const send = async (_content:string, _rich?:Discord.RichEmbed, mid?:string, addHelp?:string) => {
            return this.updateState(message.channel as Discord.TextChannel,  type as ChainType, 
                _content, _rich, mid, addHelp)
        }
        /**
         * End Filter (for debug)
         */
        if (content === "end") {
            return this.endChain(message, type, rawData)
        }
        /**
         * Command List
         * 
         * s(elect) [number] : Role select
         * 
         * u(p) [number] : move Role to up of role
         */
        if (type === ChainType.LIST_ROLE || type === ChainType.EDIT_ROLE) {
            const data = rawData.data as ChainRole
            const roles = data.roles
            const role = this.safeGet(roles, data.select)
            let title = icecream + " "
            /**
             * index **+1** value.
             */
            const parseCmd = (commands:string[]) => this.getIndexID(roles, this.getFirst(this.filterCommand(
                content, commands, roles, data.offset + 1
            )))
            // selector
            const matchSelect = parseCmd(["s", "select", "선택"])
            // position
            const matchUp = parseCmd(["u", "up"])
            const matchDown = parseCmd(type === ChainType.LIST_ROLE ? ["d", "down"] : ["down"])
            // switch mode
            const matchEdit = (/^(p|perm|permission)/i).test(content)
            const matchList = (/^(l|list)/i).test(content)
            // permission manage
            const matchToggle = this.matchNumber(content, ["t", "toggle"])
            const matchLink = content.startsWith("https://discordapi.com/permissions.html#") ||
                content.startsWith("https://discordapp.com/oauth2/authorize")
            const matchColor = (/^(c|color)\s*(0x|)[0-9A-Fa-f]{6}/i).test(content)
            const matchMention = (/^(m|mention)\s*(1|0|on|off|true|false)$/i).test(content)
            const matchHoist = (/^(h|hoist)\s*(1|0|on|off|true|false)$/i).test(content)
            const matchName = (/^(n|name)/i).test(content)
            const matchFlag = this.matchNumber(content, ["f", "flag"])
            const matchApply = /^(a|apply)$/i.test(content)
            const matchDiscard = /^(discard)$/i.test(content)
            if (matchApply || matchDiscard) {
                /**
                 * @todo Apply.
                 */
                data.apply = matchApply
                return this.endChain(message, type, rawData)
            } else if (matchSelect >= 0) {
                /**
                 * Select Role
                 */
                data.select = matchSelect
                // data.select = roles.length - matchSelect.position - 2
            } else if (matchUp >= 0 || matchDown >= 0) {
                /**
                 * Move role order
                 */
                if (role == null) {
                    title += "선택된 그룹이 없습니다."
                } else {
                    let position:number
                    if (matchUp >= 0) {
                        // index(matchUp - 1) + length(data.offset + 1) - 1
                        position = matchUp // + data.offset
                    } else {
                        // index(matchDown - 1) + length(data.offset + 1) + 1
                        position = matchDown + 1 // + data.offset + 1
                    }
                    if (role.position <= 0) {
                        title += "everyone 그룹은 위치를 바꿀 수 없습니다."
                    } else if (role.position < data.offset || position >= roles.length) {
                        title += "잘못된 번호 입니다."
                    } else {
                        this.moveArr(data.roles, data.select, position)
                        if (data.select < position) {
                            position -= 1
                        }
                        data.select = position
                    }
                }
            } else if (matchEdit) {
                /**
                 * Toggle Permission edit Mode.
                 */
                if (role != null) {
                    const selectType = this.getFirst(content.match(/\d+/i))
                    if (selectType == null && type !== ChainType.EDIT_ROLE) {
                        rawData.type = ChainType.EDIT_ROLE
                        data.permShow = PermShow.GENERAL | PermShow.TEXT | PermShow.VOICE
                        return this.onChainMessage(message, rawData.type, rawData)
                    } else if (selectType != null) {
                        const n = Number.parseInt(selectType)
                        let flag:number
                        switch (n) {
                            case 1: flag = PermShow.GENERAL; break
                            case 2: flag = PermShow.TEXT; break
                            case 3: flag = PermShow.VOICE; break
                            default: flag = PermShow.GENERAL | PermShow.TEXT | PermShow.VOICE; break
                        }
                        if (type !== ChainType.EDIT_ROLE || data.permShow !== flag) {
                            rawData.type = ChainType.EDIT_ROLE
                            data.permShow = flag
                            return this.onChainMessage(message, rawData.type, rawData)
                        }
                    }
                } else {
                    title += "그룹을 선택하지 않았습니다."
                }
            } else if (matchList) {
                /**
                 * Switch to List Permission mode.
                 */
                if (type === ChainType.EDIT_ROLE) {
                    rawData.type = ChainType.LIST_ROLE
                    return this.onChainMessage(message, rawData.type, rawData)
                }
            } else if (role != null) {
                const use = /(1|on|true)/i.test(content)
                const nouse = /(0|off|false)/i.test(content)
                if (matchToggle.length >= 1) {
                    const rolePerm = new Discord.Permissions(role.permissions)
                    const mapPerm = this.getPermsByFilter(data.permShow)
                    for (const index of matchToggle) {
                        const pm = this.safeGet(mapPerm, index - 1)
                        if (pm == null) {
                            continue
                        }
                        if (rolePerm.has(pm, false)) {
                            rolePerm.remove(pm)
                        } else {
                            rolePerm.add(pm)
                        }
                    }
                    role.permissions = rolePerm.bitfield
                } else if (matchLink) {
                    const indexPM = content.lastIndexOf("permissions")
                    if (indexPM >= 0) {
                        const pn = this.getFirst(content.substr(indexPM).match(/\d+/i))
                        if (pn != null) {
                            role.permissions = new Discord.Permissions(Number.parseInt(pn)).bitfield
                        }
                    }
                } else if (matchColor) {
                    const color = this.getFirst(content.match(/[0-9A-Fa-f]{6}/i)).toUpperCase()
                    role.color = Number.parseInt(color, 16)
                } else if (matchMention) {
                    if (use) {
                        role.mentionable = true
                    } else if (nouse) {
                        role.mentionable = false
                    }
                } else if (matchHoist) {
                    if (use) {
                        role.hoist = true
                    } else if (nouse) {
                        role.hoist = false
                    }
                } else if (matchName) {
                    role.name = content.replace(/^(name|n)\s*/i, "").trim().replace(/\s/i, " " + blankChar2)
                } else if (matchFlag.length >= 1) {
                    let selectedRole = this.filterCommand(
                        content, ["f", "flag"], roles, data.offset + 1, true
                    )
                    if (selectedRole == null) {
                        selectedRole = []
                    }
                    let flagOR = 0
                    for (const mFlag of matchFlag) {
                        if (mFlag <= 0x7FFFFFFF) {
                            flagOR |= mFlag
                        }
                    }
                    if (selectedRole.filter((v) => v.id === role.id).length === 0) {
                        selectedRole.push(role)
                    }
                    for (const r of selectedRole) {
                        r.permissions = flagOR & 0x7FF7FDFF
                    }
                }
            }
            if (type === ChainType.LIST_ROLE) {
                const sendMsg = this.makeBlock(
                    this.listRoles(data.roles, data.select, data.offset, false), title)
                data.messageID = (await send(sendMsg, null, data.messageID)).id
            } else if (type === ChainType.EDIT_ROLE) {
                if (role == null) {
                    return this.endChain(message, type, rawData)
                }
                // const perms = new Discord.Permissions(role.permissions)
                const sendMsg = this.roleInfo(role, data.permShow)
                sendMsg.setFooter(title)
                const pmURL = "https://discordapi.com/permissions.html#" + role.permissions
                const crystalBall = "\u{1F52E}"
                const additionInfo = `${crystalBall} [GUI 계산기](${pmURL}) 수정한 링크를 입력하면 적용\n`
                // add info
                const checkicon = (bool:boolean) => bool ? "\u{2705}" : "\u{274E}"
                let infoCheck = ""
                infoCheck += `${checkicon(role.mentionable)} ${DiscordFormat.mentionRole(role.id)}\n`
                infoCheck += `${checkicon(role.hoist)} 목록에서 따로 표시`
                sendMsg.addField("그룹 설정", infoCheck, true)
                let roleetcInfo = ""
                if (role.color === 0) {
                    roleetcInfo += `${palatte} 기본`
                } else {
                    roleetcInfo += `${palatte} ${"0x" + (role.color as number).toString(16).toUpperCase()}`
                }
                roleetcInfo += `\n\u{1F530} ${role.id}`
                sendMsg.addField(`기타 (${role.name})`, roleetcInfo, true)
                const roleList = this.makeBlock(
                    this.listRoles(data.roles, data.select, data.offset, false))
                const roleMsg = await send(roleList, sendMsg, data.messageID, additionInfo)
                data.messageID = roleMsg.id
            }
        }
        if (message.deletable) {
            // async.
            await message.delete()
        }
        return rawData
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        if (type === ChainType.LIST_ROLE || type === ChainType.EDIT_ROLE) {
            const result = data.data as ChainRole
            const channel = message.channel
            const guild = message.guild
            const selfPerm = guild.member(this.client.user).permissions
            let msg:Discord.Message
            if (result.messageID != null) {
                msg = channel.messages.find((v) => v.id === result.messageID)
                if (msg == null) {
                    msg = await channel.fetchMessage(result.messageID)
                }
            }
            await message.delete()
            if (guild == null || !guild.available) {
                return Promise.resolve()
            }
            if (!result.apply) {
                if (msg != null) {
                    msg.edit("그룹 편집을 취소했습니다.", {embed:null}).then((v) => v.delete(3000))
                }
                return Promise.resolve()
            }
            result.roles.reverse()
            const roles = guild.roles
            const author = DiscordFormat.getNickname(message.member) + `(${message.author.id})`
            const spliceList:number[] = []
            const changelog:Map<string, string> = new Map()
            let reqPerms = 0
            const printDelta = (title:string, before:string | number | boolean,
                after:string | number | boolean, hex = true) => {
                let bf:string = before.toString()
                let af:string = after.toString()
                if (hex && typeof before === "number" && typeof after === "number") {
                    bf = "0x" + before.toString(16)
                    af = "0x" + after.toString(16)
                } else {
                    bf = before.toString()
                    af = after.toString()
                }
                return `${title}: ${bf}\t \u{27A1} ${af}\n`
            }
            for (const [id,role] of roles) {
                let changed = ""
                const target = this.getFirst(result.roles.map((v, i) => ({index:i, ...v})).filter((v) => v.id === id))
                const delta:RoleData = {
                    id: role.id
                }
                let modified = false
                if (target == null) {
                    // removed.
                    await role.delete("Removed by " + author)
                    continue
                }
                if (target.color !== role.color) {
                    modified = true
                    changed += printDelta("색상", role.color, target.color as number, true)
                    delta.color = target.color
                }
                if (target.hoist !== role.hoist) {
                    modified = true
                    changed += printDelta("개별 표시", role.hoist, target.hoist)
                    delta.hoist = target.hoist
                }
                if (target.mentionable !== role.mentionable) {
                    modified = true
                    changed += printDelta("멘션 가능", role.mentionable, target.mentionable)
                    delta.mentionable = target.mentionable
                }
                if (target.name !== role.name) {
                    modified = true
                    changed += printDelta("이름", role.name, target.name)
                    delta.name = target.name
                }
                if (target.permissions !== role.permissions) {
                    modified = true
                    const filteredPm = (target.permissions as number) & selfPerm.bitfield
                    changed += printDelta("권한", role.permissions, filteredPm, true)
                    reqPerms |= target.permissions as number
                    delta.permissions = filteredPm
                }
                const calcP = target.index
                if (calcP !== role.position) {
                    await role.setPosition(calcP, false)
                    // delta.position = calcP
                }
                if (modified) {
                    await role.edit(delta, "Edited by " + author)
                    let n = role.name
                    if (changelog.has(n)) {
                        n = n + " (" + role.position + ")"
                    }
                    changelog.set(n, changed)
                }
                spliceList.push(target.index)
            }
            spliceList.sort((a, b) => a - b)
            result.roles = result.roles.filter((v, i) => spliceList.indexOf(i) < 0)
            for (const leftRoles of result.roles) {
                await guild.createRole(leftRoles, "Created by " + author)
            }
            const rich = this.defaultRich
            // rich.setTitle()
            const [unick, uimage] = DiscordFormat.getUserProfile(message.member)
            rich.setAuthor(unick, uimage)
            rich.setDescription(DiscordFormat.mentionUser(message.author.id))
            if (changelog.size >= 1) {
                let i = 0
                for (const [name, desc] of changelog) {
                    if (i >= 24) {
                        break
                    }
                    rich.addField(name, desc, true)
                    i += 1
                }
            }
            if (!selfPerm.has("ADMINISTRATOR")) {
                const reqPerm = new Discord.Permissions(reqPerms)
                let notify = false
                let perms = ""
                for (const [pm, korDesc] of Object.entries(allPerms)) {
                    if (!selfPerm.has(pm as Discord.PermissionString) && reqPerm.has(pm as Discord.PermissionString)) {
                        notify = true
                        perms += `${korDesc} ( *${pm}* )\n`
                    }
                }
                if (notify) {
                    rich.addField("경고", perms + "\n\u{26A0} 봇에 권한이 없어 위 권한들은 적용이 불가능합니다.")
                }
            }
            await msg.edit(`${sushi} 그룹 편집을 완료했습니다.`, rich)
        }
        return Promise.resolve()
    }
    /**
     * Update state message
     * @param channel TextChannel
     * @param type Chain's Type
     * @param content String of message
     * @param rich RichEmbed message
     * @param mid Message ID(for Edit.)
     */
    protected async updateState(channel:Discord.TextChannel,
        type:ChainType, content:string, rich?:Discord.RichEmbed, mid?:string, addHelp?:string) {
        let msg:Discord.Message
        if (mid != null) {
            msg = channel.messages.find((v) => v.id === mid)
            if (msg == null) {
                msg = await channel.fetchMessage(mid)
            }
        }
        const cmdHelp = this.helpRoleEdit(type as ChainType)
        if (addHelp != null) {
            cmdHelp.desc += addHelp + "\n"
        }
        const isVaild = content != null && content.length >= 1
        const isRichOnly = (!isVaild) && rich != null
        const isString = typeof content === "string"
        if (isRichOnly) {
            rich.addField(cmdHelp.title, cmdHelp.desc)
            if (msg == null) {
                msg = await channel.send(rich) as Discord.Message
            } else {
                await msg.edit(rich)
            }
        } else if (isVaild) {
            if (rich != null) {
                rich.addField(cmdHelp.title, cmdHelp.desc)
            } else {
                rich = this.defaultRich
                rich.setTitle(cmdHelp.title)
                rich.setDescription(cmdHelp.desc)
            }
            if (msg == null) {
                msg = await channel.send(content, rich) as Discord.Message
            } else {
                await msg.edit(content, rich)
            }
        }
        return msg
    }
    /**
     * Generate Help from Type
     * @param mode Command Type
     */
    protected helpRoleEdit(mode:ChainType) {
        const title:string = "도움말"
        let desc:string = ""
        if (mode === ChainType.LIST_ROLE || mode === ChainType.EDIT_ROLE) {
            // :dango: `d[n]`  n번째의 그룹 아래로 배치합니다.
            if (mode === ChainType.LIST_ROLE) {
                desc += `${dango} select \`<번호>\` : n번 그룹을 선택합니다.\n`
                desc += `${dango} up \`<번호|이름>\` : 선택한 그룹을 지정한 그룹 \u{2B06}다가 배치합니다.\n`
                desc += `${dango} down \`<번호|이름>\` : 선택한 그룹을 지정한 그룹 \u{2B07}다가 배치합니다.\n`
            }
            desc += `${dango} perm \`<1|2|3>\` : 권한을 보여주고 편집합니다.` +
                `\n${flagEmoji} :one: 일반 :two: 문자, :three: 음성 :asterisk: 전체\n`
            if (mode === ChainType.EDIT_ROLE) {
                desc += `${dango} list : 그룹 목록을 보여줍니다.\n`
                desc += `${dango} toggle \`<...권한 번호>\` : 선택한 권한을 전환합니다.\n`
                desc += `${palatte} [color](${coolors}) \`<16진수 색상>\` : 색상을 적용합니다. 0은 기본입니다.\n`
                desc += `${dango} mention \`<on|off>\` : 멘션을 가능하게/불가능하게 정합니다.\n`
                desc += `${dango} hoist \`<on|off>\` : 목록에서 따로 표시하게 할지 정합니다.\n`
                desc += `${dango} name \`<이름>\` : 이름을 바꿔줍니다.\n`
            }
            desc += `${disk} apply : 현재 편집한 내용들을 적용합니다.\n`
            desc += `${trash} discard : 편집 내용들을 무시하고 끝냅니다.\n`
        }
        return {
            title,
            desc,
        }
    }
    /**
     * Get role from selector code
     * @param roles Roles
     * @param index Selected Index (+1, exclude disable)
     * @param offset Disable Length.
     */
    protected getSelected(roles:Discord.Role[], index:number, offset?:number) {
        if (index <= 0) {
            return null
        }
        const i = this.getPosition(index,offset == null ? 0 : offset)
        if (i <= 0 || i >= roles.length) {
            return null
        }
        return roles[i]
    }
    /**
     * Get Element in array safe.
     * @param arr Array
     * @param index Index
     * @returns Element, null if Out-Of-Array
     */
    protected safeGet<T>(arr:T[], index:number) {
        if (index < 0 || index >= arr.length) {
            return null
        }
        return arr[index]
    }
    protected getPosition(index:number, offset:number) {
        return index + offset - 1
    }
    /**
     * Make Channel's PermOverride RichEmbed
     * @param channel Channel
     * @param filterU ?
     */
    protected channelPermInfo(channel:Discord.GuildChannel, filterU?:string) {
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
                out += this.makeBlock(listPerm)
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
     * Get Permissions from filter.
     * @param filter PermShow's bits
     */
    protected getPermsByFilter(filter = PermShow.GENERAL | PermShow.TEXT | PermShow.VOICE) {
        const perms:Discord.PermissionString[] = []
        if ((filter & PermShow.GENERAL) > 0) {
            perms.push(...Object.keys(generalPerms) as Discord.PermissionString[])
        }
        if ((filter & PermShow.TEXT) > 0) {
            perms.push(...Object.keys(textPerms) as Discord.PermissionString[])
        }
        if ((filter & PermShow.VOICE) > 0) {
            perms.push(...Object.keys(voicePerms) as Discord.PermissionString[])
        }
        return perms
    }
    /**
     * Make Permissions' RichEmbed from Role
     * @param role Role
     * @param filter PermShow[GENERAL, TEXT, VOICE]'s bit. (OR) 
     */
    protected roleInfo(role:RoleData, filter = PermShow.GENERAL | PermShow.TEXT | PermShow.VOICE) {
        const rich = this.defaultRich
        if (role.color > 0) {
            rich.setColor(role.color)
        } else {
            rich.setColor(null)
        }
        rich.setTitle(role.name)
        const perms = new Discord.Permissions(role.permissions)
        // General Permission
        const pairs:Array<[string, {[key in string]:string}]> = []
        if ((filter & PermShow.GENERAL) > 0) {
            pairs.push(["일반 권한", generalPerms])
        }
        if ((filter & PermShow.TEXT) > 0) {
            pairs.push(["채팅 권한", textPerms])
        }
        if ((filter & PermShow.VOICE) > 0) {
            pairs.push(["음성 권한", voicePerms])
        }
        let offset = 1
        // let rolePermInfo = "```md\n"
        if (perms.has("ADMINISTRATOR")) {
            const joker = "\u{1F0CF}"
            rich.addField("주의", joker + "\n**관리자 권한**을 가지고 있습니다. 밑의 규칙을 무시하고 **모든** 권한을 갖습니다.")
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
    protected printPerms(perms:Discord.Permissions, query?:Discord.PermissionString[], startIndex = 0,
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
     * @param selected Selected Position - Exclude Disabled, index
     * @param disabled Disabled Position - Include ALL, reverse-aligned index, Include Param.
     * @param spaceOverride ?
     */
    protected listRoles(roles:RoleData[], selected = -1, disabled = -1, autoSort = true) {
        if (autoSort) {
            roles.sort((a, b) => a.position - b.position).reverse()
        }
        const names = roles.map((v) => v.name)
        let out = ""
        let disabledNames = []
        const rSpace = 3 + Math.floor(Math.log10(names.length))
        if (disabled >= 0) {
            disabledNames = names.splice(0, Math.min(names.length, disabled + 1))
            selected -= (disabled + 1)
        }
        if (disabledNames.length >= 1) {
            out += this.listDisabledStr(disabledNames, rSpace) + "\n"
        }
        out += this.listStr(names, selected)
        return out
    }
    /**
     * Print Channel's list
     * 
     * Also modify `channels` order.
     * @param channels Channels
     * @param selected Selected Position (highlighted)
     */
    protected listChannels(channels:Discord.GuildChannel[], selected = -1) {
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
    protected getCheckStr(title:string, checked:Checked, index:number, desc?:string, needOTP = false) {
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
    protected getHighestLevel(member:Discord.GuildMember, perm:Discord.PermissionResolvable | "*" = "*") {
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
    protected listDisabledStr(name:string[], spaceO = 2) {
        return name.map((v) => ">".padEnd(spaceO) + v).join("\n")
    }
    /**
     * Make numbered list string
     * @param name List strings
     * @param selected Selected at?
     */
    protected listStr(name:string[], selected = -1, startIndex = 1) {
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
    protected hasPerm(memberOrRole:Discord.GuildMember | Discord.Role, perm:Discord.PermissionResolvable | CustomPerms,
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
    /**
     * 
     * @param input The command string
     * @param commands List of accept commands
     * @param arr Role or Channel Array
     * @param offset that offset.
     */
    protected filterCommand<T extends RoleData | Discord.GuildChannel>(
        input:string, commands:string[], arr:T[], offset = 0, ignoreI = false) {
        const regex = new RegExp(`^(${commands.join("|")})`, "i")
        if (!regex.test(input)) {
            return null
        }
        const encode = encodeCmdInput(input.replace(regex, "").trim())
        const params = encode.encoded.split(/\s+/ig).map((v) => {
            let result:T
            const decoded = decodeCmdInput(v, encode.key)
            const n = Number.parseInt(decoded)
            if (Number.isNaN(n)) {
                // name search
                result = this.getFirst(arr.filter((_v) => _v.name === decoded))
            } else if (!Number.isSafeInteger(n)) {
                // id search
                result = this.getFirst(arr.filter((_v) => _v.id === decoded))
            } else {
                // index search
                if (!ignoreI) {
                    result = this.safeGet(arr, n + offset - 1)
                }
            }
            return result
        }).filter((v) => v != null)
        if (params.length <= 0) {
            return null
        } else {
            return params
        }
        //             const matchUp = this.getFirst(this.matchNumber(content, /^(u|up)\s*?\d+/i))
    }
    private getIndexID<T extends {id:string}>(arr:T[], obj:T) {
        if (arr == null || obj == null) {
            return -1
        }
        for (let i = 0; i < arr.length; i += 1) {
            if (arr[i].id === obj.id) {
                return i
            }
        }
        return -1
    }
    /**
     * Match Command with numbers
     * @param str String
     * @param cmd Command string
     * @returns Numbers or []
     */
    private matchNumber(str:string, cmd:string[]) {
        const regex = new RegExp(`(^|\\s+)(${cmd.join("|")})[\\s\\d!-/:-@\\[-\`]+`, "i")
        const match = str.match(regex)
        if (match != null) {
            const n = match[0].match(/\d+/g)
            if (n == null) {
                return []
            } else {
                return n.map((v) => {
                    let num = Number.parseInt(v, 10)
                    if (Number.isNaN(num)) {
                        num = Number.parseInt(v, 16)
                        if (Number.isNaN(num)) {
                            return null
                        }                        
                    }
                    return num
                }).filter((v) => v != null)
            }
        } else {
            return []
        }
    }
    private isEveryone(role:Discord.Role) {
        return role.position <= 0
    }
    private sortByLevel(arr:Discord.Role[]) {
        return arr.sort((a, b) => a.position - b.position)
    }
    private makeBlock(str:string, title?:string) {
        return `\`\`\`md\n${str}\`\`\`${title != null ? title : ""}`
    }
    private moveArr<T>(arr:T[], fromIndex:number, toIndex:number) {
        if (fromIndex === toIndex) {
            return arr
        }
        const org = this.getFirst(arr.splice(fromIndex, 1))
        if (fromIndex < toIndex) {
            // modify toIndex -> -1
            toIndex -= 1
        }
        arr.splice(toIndex, 0, org)
        return arr
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
interface ChainRole {
    select:number;
    roles:RoleData[];
    offset:number;
    messageID:string;
    permShow:number;
    apply:boolean;
    moveCommands:MoveCommand[];
}
interface Command {
    roleID:string;
    type:CommandType;
    data_s?:string;
    data_n?:number;
}
interface MoveCommand {
    roleID:string;
    toPosition:number;
}
enum CommandType {
    Position_Update,
}
enum ChainType {
    LIST_ROLE,
    EDIT_ROLE,
}
enum PermShow {
    GENERAL = 1,
    TEXT = 2,
    VOICE = 4,
}
/**
 * Include RoleID
 * 
 * @extends Discord.RoleData
 */
interface RoleData extends Discord.RoleData {
    id:string;
}