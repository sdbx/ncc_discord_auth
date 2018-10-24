import * as Discord from "discord.js"
import { sprintf } from "sprintf-js"
import Cache from "../../cache"
import Config from "../../config"
import Log from "../../log"
import { NccEvents } from "../../ncc/ncc"
import Profile from "../../ncc/structure/profile"
import { ChannelType } from "../../ncc/talk/ncbasechannel"
import NcChannel from "../../ncc/talk/ncchannel"
import NcMessage from "../../ncc/talk/ncmessage"
import Plugin from "../plugin"
import { CmdParam, ParamAccept, ParamType, UniqueID } from "../rundefine"
import { AcceptRegex, CommandHelp, decodeDate, DiscordFormat, getFirst } from "../runutil"

export default class Auth extends Plugin {
    protected defaultConfig = {
        "test": 53,
    }
    protected config = new AuthConfig()
    protected timeout = 10 * 60 * 1000 // 10 is minutes
    protected authCache:Array<Cache<AuthInfo>> = []
    protected ncc_listen
    // declare command.
    private authNaver:CommandHelp
    private infoNaver:CommandHelp
    private banNaver:CommandHelp
    private unbanNaver:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        // CommandHelp: suffix, description
        this.authNaver = new CommandHelp("인증", this.lang.auth.authCmdDesc)
        this.authNaver.addField(ParamType.to, "계정", true, {code: [PType.ID, PType.NICK]})
        this.authNaver.complex = true
        // info
        this.infoNaver = new CommandHelp("알려/cafe", "네이버 아이디의 정보가 필요할 때", true)
        this.infoNaver.addField(ParamType.dest, "유저 혹은 아이디", true, {code: [PType.ID, PType.NICK, PType.DISCORD]})
        this.infoNaver.complex = true
        // ban
        this.banNaver = new CommandHelp("밴/ban", "아이디를 밴 합니다.", true, {chatType: "guild"})
        this.banNaver.addField(ParamType.dest, "유저 혹은 아이디", true, {code: [PType.ID, PType.DISCORD]})
        this.banNaver.addField(ParamType.period, "밴 할 시간", false)
        // unban
        this.unbanNaver = new CommandHelp("밴 해제/unban", "아이디의 밴을 해제합니다.", true, {chatType: "guild"})
        this.unbanNaver.addField(ParamType.dest, "아이디", true, {code: [PType.ID]})
        // ncc-listen
        this.ncc_listen = this.onNccMessage.bind(this)
        this.ncc.on(NccEvents.message, this.ncc_listen)
        // bind
        this.client.on("guildMemberAdd", this.onGuildMemberAdd.bind(this))
        this.client.on("guildMemberRemove", this.onGuildMemberRemove.bind(this))
        for (const [id,guild] of this.client.guilds) {
            const cfg = await this.sub(this.config, id)
            cfg.guildName = guild.name
            await cfg.export()
        }
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const user = msg.author
        const guild = msg.guild
        const channel = msg.channel
        const testAuth = this.authNaver.check(this.global,command, state)
        const testInfo = this.infoNaver.check(this.global,command, state)
        const testBan = this.banNaver.check(this.global, command, state)
        const testUnban = this.unbanNaver.check(this.global, command, state)
        if (testAuth.match) {
            // check naver
            if (!await this.ncc.availableAsync()) {
                await channel.send(this.lang.noNaver)
                return Promise.resolve()
            }
            if (channel.type === "dm" || !guild.available) {
                await channel.send(this.lang.auth.onlyGroup)
                return Promise.resolve()
            }
            /**
             * Check duplicate
             */
            const have = this.getFirst(this.authQueue.filter((v) => v.guildID === guild.id && v.userID === user.id))
            if (have != null) {
                if (await this.inviteExpired(have.uInviteCode)) {
                    (await this.ncc.leaveChannel(have.uChatID)).handleError()
                } else {
                    await channel.send(
                        `${this.lang.auth.authing}\nhttps://talk.cafe.naver.com/channels/${have.uChatID}`)
                    return Promise.resolve()
                }
            }
            /**
             * fetch naver ID
             */
            let type = testAuth.code(ParamType.to)
            let member:Profile
            let param = testAuth.get(ParamType.to)
            const guildCfg = await this.subUnique(this.config, msg, UniqueID.guild)
            const cafeID = await this.ncc.parseNaver(guildCfg.commentURL)
            if (type === PType.ID) {
                member = await this.ncc.getMemberById(cafeID.cafeId, param).catch((err) => null)
            } else if (type === PType.NICK) {
                param = param.replace(/"/ig, "")
                member = await this.ncc.getMemberByNick(cafeID.cafeId, param).catch((err) => null)
            } else {
                if (param.replace(/[a-zA-Z0-9]+/ig, "").length === 0) {
                    type = PType.ID
                    member = await this.ncc.getMemberById(cafeID.cafeId, param).catch((err) => null)
                }
                if (member == null) {
                    // Check by nick
                    type = PType.NICK
                    param = param.replace(/"/ig, "")
                    member = await this.ncc.getMemberByNick(cafeID.cafeId, param).catch((err) => null)
                }
            }
            if (member == null) {
                await channel.send(sprintf(this.lang.auth.nickNotFound, {
                    nick: param,
                    type: type === PType.NICK ? "닉네임" : "아이디",
                }))
                return Promise.resolve()
            }
            /**
             * Check banned
             */
            const baninfo = await this.haveBanned(msg.guild.id, member.userid)
            if (baninfo.banned) {
                const sender = DiscordFormat.getUserProfile(msg.member)
                await channel.send(sprintf(this.lang.auth.blockedAuth, {
                    id: member.userid,
                    date: baninfo.expired >= 0 ? `\`${decodeDate(baninfo.expired, true)}\`까지` : "영원히",
                }), await this.getRichByNaver(member, ...sender))
                return Promise.resolve()
            }
            /**
             * Check authed
             */
            if (await this.haveAuthed(msg.guild.id, member.userid, msg.author.id)) {
                await channel.send(this.lang.auth.already_auth)
                return Promise.resolve()
            }
            // check permission
            if (!this.client.channels.has(guildCfg.proxyChannel)
                || this.client.channels.get(guildCfg.proxyChannel).type !== "text") {
                await channel.send(this.lang.auth.proxyFailed)
                return Promise.resolve()
            }
            const proxyC = this.client.channels.get(guildCfg.proxyChannel) as Discord.TextChannel
            if (!proxyC.permissionsFor(proxyC.guild.client.user).has("CREATE_INSTANT_INVITE")) {
                await channel.send(this.lang.auth.proxyFailed)
                return Promise.resolve()
            }
            /**
             * Create room first
             */
            const filterRoom = this.getFirst(this.ncc.joinedChannels.filter((v) => {
                return v.type === ChannelType.OnetoOne && v.channelInfo.name === member.nickname
                    && v.cafe.cafeId === member.cafeId
            }))
            let room:NcChannel
            try {
                if (filterRoom != null) {
                    room = await this.ncc.getConnectedChannel(filterRoom.channelID)
                } else {
                    room = await this.ncc.createChannel(cafeID, [member], {
                        name: "디스코드 인증",
                        description: "",
                        thumbnails: [],
                    }, ChannelType.OnetoOne)
                }
            } catch (err) {
                await channel.send(this.lang.auth.roomNotMaked)
                return Promise.resolve()
            }
            /**
             * Create Invite
             */
            const invite = await proxyC.createInvite({
                temporary: true,
                maxAge: 600,
                maxUses: 3,
                unique: true,
            }, `${user.username}#${user.tag} is authing`)
            const authInfo = new AuthInfo()
            authInfo.guildID = guild.id
            authInfo.proxyID = proxyC.guild.id
            authInfo.uChatID = room.channelID
            authInfo.uInviteCode = invite.code
            authInfo.userID = user.id
            authInfo.naverID = member.userid
            this.addQueue(authInfo)
            /**
             * Send text to ncc room
             */
            const profile = DiscordFormat.getUserProfile(msg.member)
            let nccmessage:string
            if (guildCfg.nccmsg.length === 0 || guildCfg.nccmsg === "기본") {
                nccmessage = this.lang.auth.nccmessage
            } else {
                nccmessage = guildCfg.nccmsg.replace(/\\n/ig, "\n")
            }
            await room.sendCustomEmbed(sprintf(nccmessage, {
                link: invite.url,
                user: profile[0],
            }), {
                title: msg.guild.name,
                description: msg.author.tag,
                domain: this.lang.auth.warningID,
                url: invite.url,
                type: null,
                image: null,
            }, profile[1], false)
            /**
             * Send rich
             */
            const rich = await this.getRichByNaver(member, ...DiscordFormat.getUserProfile(msg.member))
            const roomURL = `https://talk.cafe.naver.com/channels/${room.channelID}`
            await channel.send(roomURL,rich)
        } else if (testInfo.match) {
            if (!await this.ncc.availableAsync()) {
                await channel.send(this.lang.noNaver)
                return Promise.resolve()
            }
            const dest = testInfo.get(ParamType.dest)
            const guildCfg = await this.subUnique(this.config, msg, UniqueID.guild)
            const cafe = await this.ncc.parseNaver(guildCfg.commentURL)
            let naver:Profile
            // check member

            switch (testInfo.code(ParamType.dest)) {
                case PType.DISCORD : {
                    const member = this.getFirst(await this.getUsers(msg.guild, dest))
                    if (member == null) {
                        await channel.send(sprintf(this.lang.auth.nickNotFound, {
                            nick: dest,
                            type: "",
                        }))
                        return Promise.resolve()
                    }
                    const gu = this.getFirst(guildCfg.users.filter((v) => v.userID === member.user.id))
                    if (gu != null) {
                        try {
                            naver = await this.ncc.getMemberById(cafe.cafeId, gu.naverID)
                        } catch (err) {
                            // await channel.send(err);
                        }
                    } else {
                        await channel.send(sprintf(this.lang.auth.noAuth, {
                            nick: dest,
                        }))
                        // naver = await this.ncc.getMemberByNick(cafe.cafeId, dest);
                    }
                } break
                case PType.ID : {
                    try {
                        naver = await this.ncc.getMemberById(cafe.cafeId, dest)
                    } catch (err) {
                        // await channel.send(err);
                    }
                } break
                case PType.NICK : {
                    try {
                        naver = await this.ncc.getMemberByNick(cafe.cafeId, dest)
                    } catch (err) {
                        // await channel.send(err);
                    }
                } break
            }
            if (naver == null) {
                await channel.send(sprintf(this.lang.auth.nickNotFound, {
                    nick: dest,
                    type: "",
                }))
            } else {
                const idOwner = this.getFirst(guildCfg.users.filter((v) => v.naverID === naver.userid))
                let idUser:Discord.GuildMember
                if (idOwner != null) {
                    idUser = guild.members.get(idOwner.userID)
                }
                let rich
                if (idUser == null) {
                    rich = await this.getRichByNaver(naver)
                } else {
                    rich = await this.getRichByNaver(naver,
                        ...DiscordFormat.getUserProfile(idUser))
                }
                await channel.send(rich)
            }
        } else if (testBan.match) {
            if (!await this.ncc.availableAsync()) {
                await channel.send(this.lang.noNaver)
                return Promise.resolve()
            }
            if (!msg.member.hasPermission("BAN_MEMBERS") && !this.global.isAdmin(msg.member.id)) {
                await msg.channel.send(this.lang.auth.noPerm)
                return Promise.resolve()
            }
            const dest = testBan.get(ParamType.dest)
            const code = testBan.code(ParamType.dest)
            const cfg = await this.subUnique(this.config, msg, UniqueID.guild)
            let banUser:string
            if (code === PType.ID) {
                const validID = /[0-9A-Za-z_-]+/i
                if (validID.test(dest)) {
                    banUser = dest
                }
            } else if (code === PType.DISCORD) {
                let banUid:string
                const mention = AcceptRegex.check(ParamAccept.USER, dest)
                if (mention != null) {
                    const banU = this.client.users.find((v) => v.id === mention)
                    if (banU != null) {
                        banUid = banU.id
                    }
                } else {
                    const banU = msg.guild.members.find((v) => DiscordFormat.getNickname(v) === dest)
                    if (banU != null) {
                        banUid = banU.id
                    }
                }
                if (banUid != null) {
                    const uid = getFirst(cfg.users.filter((v) => v.userID === banUid))
                    if (uid != null) {
                        banUser = uid.naverID
                    }
                }
            }
            let period = 0
            const periodStr = testBan.get(ParamType.period)
            if (periodStr != null) {
                const safeGet = (arr:RegExpMatchArray) => {
                    if (arr == null) {
                        return 0
                    }
                    const str = getFirst(arr)
                    const n = Number.parseInt(getFirst(str.match(/\d+/i)))
                    if (Number.isNaN(n)) {
                        return 0
                    }
                    return n
                }
                const sec = safeGet(periodStr.match(/\d+초/i))
                const min = safeGet(periodStr.match(/\d+분/i)) * 60
                const hour = safeGet(periodStr.match(/\d+시간/i)) * 3600
                const day = safeGet(periodStr.match(/\d+일/i)) * 86400
                period = sec + min + hour + day
            }
            if (banUser != null) {
                const expire = (period <= 0 ? -1 : Date.now() + period * 1000)
                let found = false
                for (const bu of cfg.banusers) {
                    if (bu.userid === banUser) {
                        found = true
                        bu.expire = expire
                        break
                    }
                }
                if (!found) {
                    cfg.banusers.push({
                        userid: banUser,
                        expire,
                    })
                }
                await cfg.export()
                await msg.channel.send(sprintf(this.lang.auth.banned, {
                    id: banUser,
                    date: expire >= 0 ? `\`${decodeDate(expire, true)}\`까지` : "영원히",
                }))
            } else {
                await msg.channel.send(sprintf(this.lang.auth.notFoundU, {id: dest}))
            }
        } else if (testUnban.match) {
            if (!msg.member.hasPermission("BAN_MEMBERS") && !this.global.isAdmin(msg.member.id)) {
                await msg.channel.send(this.lang.auth.noPerm)
                return Promise.resolve()
            }
            const dest = testUnban.get(ParamType.dest)
            const guildCfg = await this.subUnique(this.config, msg, UniqueID.guild)
            let changed:string = null
            for (let i = 0; i < guildCfg.banusers.length; i += 1) {
                const id = guildCfg.banusers[i].userid
                if (dest === id) {
                    guildCfg.banusers.splice(i, 1)
                    changed = id
                    break
                }
            }
            if (changed != null) {
                await msg.channel.send(sprintf(this.lang.auth.unbanned, {id: changed}))
            } else {
                await msg.channel.send(sprintf(this.lang.auth.notFoundU, {id: dest}))
            }
        }
        return Promise.resolve()
    }
    protected async break(queue:AuthInfo, roomID?:number | NcChannel, breakInvite = true) {
        if (roomID == null) {
            roomID = queue.uChatID
        }
        const room = (typeof roomID === "number") ? await this.ncc.getJoinedChannel(roomID) : roomID.detail
        if (room != null) {
            await this.ncc.leaveChannel(room.channelID)
        }
        if (breakInvite) {
            try {
                const invite = await this.getInvite(queue)
                await invite.delete("Checked.")
            } catch (err) {
                Log.e(err)
            }
        }
        this.deleteQueue(queue)
        return Promise.resolve()
    }
    protected async verify(queue:AuthInfo):Promise<string> {
        const invite = await this.getInvite(queue)
        if (await this.inviteExpired(invite)) {
            return this.lang.auth.expiredAuth
        }
        const cfg = await this.sub(this.config, queue.guildID)
        const guild = this.client.guilds.get(queue.guildID)
        const member = guild.member(queue.userID)
        const toRole = this.getFirstMap(guild.roles.filter((v) => v.name === cfg.destRole))
        if (toRole == null || member == null) {
            return cfg.destRole + " role not found / Contact admin."
        }
        if (await this.haveAuthed(guild.id, queue.naverID, queue.userID)) {
            return this.lang.auth.already_auth
        }
        if (!member.roles.has(toRole.id)) {
            await member.addRole(toRole, `nc ${queue.naverID} authed.`)
        }
        const {...reduced} = queue as AuthUser
        cfg.users.push(reduced)
        await cfg.export()
        return Promise.resolve(null)
    }
    protected async onNccMessage(channel:NcChannel, message:NcMessage) {
        const roomID = message.id
        const queue = this.getFirst(this.authQueue.filter((_v) => _v.uChatID === roomID))
        if (queue == null || queue.naverID !== message.author.naverId) {
            return Promise.resolve()
        }
        const error = await this.verify(queue)
        if (error != null) {
            await channel.sendText(error)
        } else {
            await channel.sendText(this.lang.auth.authed)
        }
        await this.break(queue, channel.channelID)
    }
    protected async haveBanned(guildID:string, nID:string):Promise<{banned:boolean, expired?:number}> {
        const guildCfg = await this.sub(this.config, guildID)
        for (let i = 0; i < guildCfg.banusers.length; i += 1) {
            const u = guildCfg.banusers[i]
            if (u.userid === nID) {
                if (u.expire > 0 && Date.now() > u.expire) {
                    guildCfg.banusers.splice(i, 1)
                    return {banned: false}
                } else {
                    return {banned: true, expired: u.expire}
                }
            }
        }
        return {banned: false}
    }
    protected async haveAuthed(guildID:string, nID:string, uID:string):Promise<boolean> {
        let out = false
        const guildCfg = await this.sub(this.config, guildID)
        for (const user of guildCfg.users) {
            if (user.userID === uID || user.naverID === nID) {
                out = true
                break
            }
        }
        return Promise.resolve(out)
    }
    protected async onGuildMemberRemove(member:Discord.GuildMember) {
        const guild = member.guild
        const uid = member.user.id
        await Promise.all(this.authQueue.filter((v) => v.userID === uid).map((v) => this.break(v)))

        const guildCfg = await this.sub(this.config, guild.id)
        let changed = false
        for (const user of guildCfg.users) {
            if (user.userID === member.user.id) {
                changed = true
                guildCfg.users.splice(guildCfg.users.indexOf(user))
            }
        }
        if (changed) {
            await guildCfg.export()
        }
        return Promise.resolve()
    }
    protected async onGuildMemberAdd(member:Discord.GuildMember) {
        const user = member.user
        const queue = this.getFirst(this.authQueue.filter((v) => {
            return v.userID === user.id && v.proxyID === member.guild.id
        }))
        if (queue == null) {
            return Promise.resolve()
        }
        const dm = await user.createDM()
        const invite = await this.getInvite(queue)
        if (invite.uses >= 1) {
            const error = await this.verify(queue)
            if (error != null) {
                await dm.send(error)
            } else {
                await dm.send(this.lang.auth.authed)
            }
        } else {
            // wtf.
            await dm.send("허용되지 않은 접근.")
        }
        await member.kick("Out!")
        await this.break(queue)
        return Promise.resolve()
    }
    private async inviteExpired(inviteCode:string | Discord.Invite) {
        let _invite
        if (typeof inviteCode === "string") {
            _invite = await this.getInvite(inviteCode)
        } else {
            _invite = inviteCode
        }
        return _invite == null || Date.now() >= _invite.expiresTimestamp
    }
    private async getInvite(queue:AuthInfo | string) {
        let id:string
        let guild:Discord.PartialGuild | Discord.Guild
        if (typeof queue === "string") {
            id = queue
            const i:Discord.Invite = await this.client.fetchInvite(id).catch((err) => null)
            if (i == null) {
                return null
            }
            guild = i.guild
        } else {
            id = queue.uInviteCode
            guild = this.client.guilds.get(queue.proxyID)
        }
        if (guild == null || !(guild instanceof Discord.Guild)) {
            return null
        }
        return this.getFirstMap((await guild.fetchInvites()).filter((v) => v.code === id))
    }
    private deleteQueue(queue:AuthInfo) {
        this.authCache.forEach((v, i) => {
            if (v.expired || (v.cache.uChatID === queue.uChatID && v.cache.uInviteCode === queue.uInviteCode)) {
                this.authCache.splice(i, 1)
            }
        })
    }
    private addQueue(queue:AuthInfo) {
        this.authCache.push(new Cache(queue, this.timeout / 1000))
    }
    private get authQueue() {
        this.authCache.forEach((v,i) => v.expired ? this.authCache.splice(i, 1) : null)
        return this.authCache.map((v) => v.cache)
    }
    private getUsers(guild:Discord.Guild, nick:string):Discord.GuildMember[] {
        const out = []
        for (const [gKey,gMember] of guild.members) {
            const _nick = gMember.nickname == null ? gMember.user.username : gMember.nickname
            if (_nick === nick) {
                out.push(gMember)
            }
        }
        return out
    }
}
export function getNaver(authlist:AuthConfig, guildid:string, userid:string):string {
    return getFirst(authlist.users.filter(
        (_v) => _v.guildID === guildid && _v.userID === userid).map((_v) => _v.naverID))
}
enum PType {
    ID = "id/아이디",
    NICK = "nick/닉네임",
    DISCORD = "user/유저",
}
class AuthUser {
    public userID:string
    public guildID:string
    public naverID:string
}
class AuthInfo extends AuthUser {
    public uChatID:number // unique
    public uInviteCode:string // unique
    public proxyID:string
}
interface BanInfo {
    userid:string
    expire?:number
}
export class AuthConfig extends Config {
    public guildName = "Sample"
    public timeout = 600
    public commentURL = "cafeURL"
    public destRole = "destRole"
    public banusers:BanInfo[] = []
    public users:AuthUser[] = []
    public proxyChannel = "1234"
    public nccmsg = ""
    // proxy oauth
    // https://discordapp.com/oauth2/authorize?client_id=INSERT_CLIENT_ID_HERE&scope=bot&permissions=35
    constructor() {
        super("auth")
    }
}