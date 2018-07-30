import * as Discord from "discord.js";
import { Message, Room } from "node-ncc-es6";
import * as request from "request-promise-native";
import { sprintf } from "sprintf-js";
import Cache from "../../cache";
import Config from "../../config";
import Log from "../../log";
import Article from "../../structure/article";
import Cafe from "../../structure/cafe";
import Comment from "../../structure/comment";
import Profile from "../../structure/profile";
import Plugin from "../plugin";
import { MainCfg } from "../runtime";
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil";

export default class Auth extends Plugin {
    protected config = new AuthConfig();
    protected timeout = 10 * 60 * 1000; // 10 is minutes
    protected authCache:Array<Cache<AuthInfo>> = [];
    protected ncc_listen;
    // declare command.
    private authNaver:CommandHelp;
    private infoNaver:CommandHelp;
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready();
        // CommandHelp: suffix, description
        this.authNaver = new CommandHelp("인증", this.lang.auth.authCmdDesc);
        this.authNaver.addField(ParamType.to, "계정", true, {code: ["id/아이디","nick/닉네임"]});
        this.authNaver.complex = true;
        // info
        this.infoNaver = new CommandHelp("알려", "네이버 정보 갯");
        this.infoNaver.addField(ParamType.dest, "네이버", true);
        this.infoNaver.complex = true;
        // ncc-listen
        this.ncc_listen = this.onNccMessage.bind(this);
        this.ncc.on("message", this.ncc_listen);
        // bind
        this.client.on("guildMemberAdd", this.onGuildMemberAdd.bind(this));
        this.client.on("guildMemberRemove", this.onGuildMemberRemove.bind(this));
        for (const [id,guild] of this.client.guilds) {
            const cfg = await this.sub(this.config, id);
            cfg.guildName = guild.name;
            await cfg.export();
        }
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const user = msg.author;
        const guild = msg.guild;
        const channel = msg.channel;
        const testAuth = this.authNaver.check(this.global,command);
        const testInfo = this.infoNaver.check(this.global,command);
        if (testAuth.match) {
            // check naver
            if (!await this.ncc.availableAsync()) {
                await channel.send(this.lang.noNaver);
                return Promise.resolve();
            }
            if (channel.type === "dm") {
                await channel.send(this.lang.auth.onlyGroup);
                return Promise.resolve();
            }
            /**
             * Check duplicate
             */
            const have = this.getFirst(this.authQueue.filter((v) => v.guildID === guild.id && v.userID === user.id));
            if (have != null) {
                if (await this.inviteExpired(have.uInviteCode)) {
                    await this.ncc.deleteRoom(have.uChatID);
                } else {
                    await channel.send(
                        `${this.lang.auth.authing}\nhttps://talk.cafe.naver.com/channels/${have.uChatID}`);
                    return Promise.resolve();
                }
            }
            /**
             * fetch naver ID
             */
            let type;
            let member:Profile;
            let param = testAuth.get(ParamType.to);
            const guildCfg = await this.sub(this.config, msg.guild.id);
            const cafeID = await this.ncc.parseNaver(guildCfg.commentURL);
            if (param.endsWith("아이디")) {
                type = PType.ID;
                param = param.substring(0, param.lastIndexOf(" "));
                member = await this.ncc.getMemberById(cafeID.cafeId, param).catch((err) => null);
            } else if (param.endsWith("닉네임") || param.endsWith("닉")) {
                type = PType.NICK;
                param = param.substring(0, param.lastIndexOf(" "));
                member = await this.ncc.getMemberByNick(cafeID.cafeId, param).catch((err) => null);
            } else {
                if (param.replace(/[a-zA-Z0-9]+/ig, "").length === 0) {
                    type = PType.ID;
                    member = await this.ncc.getMemberById(cafeID.cafeId, param).catch((err) => null);
                }
                if (member == null) {
                    // Check by nick
                    type = PType.NICK;
                    member = await this.ncc.getMemberByNick(cafeID.cafeId, param).catch((err) => null);
                }
            }
            if (member == null) {
                await channel.send(sprintf(this.lang.auth.nickNotFound, {
                    nick: param,
                    type: type === PType.NICK ? "닉네임" : "아이디",
                }));
                return Promise.resolve();
            }
            /**
             * Check authed
             */
            if (await this.haveAuthed(msg.guild.id,member.userid, msg.author.id)) {
                await channel.send(this.lang.auth.already_auth);
                return Promise.resolve();
            }
            // check permission
            if (!this.client.channels.has(guildCfg.proxyChannel)
                || this.client.channels.get(guildCfg.proxyChannel).type !== "text") {
                await channel.send(this.lang.auth.proxyFailed);
                return Promise.resolve();
            }
            const proxyC = this.client.channels.get(guildCfg.proxyChannel) as Discord.TextChannel;
            if (!proxyC.permissionsFor(proxyC.guild.client.user).has("CREATE_INSTANT_INVITE")) {
                await channel.send(this.lang.auth.proxyFailed);
                return Promise.resolve();
            }
            /**
             * Create room first
             */
            const room:Room = await this.ncc.chat.createRoom(
                { id: cafeID.cafeId }, [{ id: member.userid }],
                {name: "디스코드 인증", isPublic: false}).catch((err) => {Log.e(err); return null;});
            if (room == null) {
                await channel.send(this.lang.auth.roomNotMaked);
                return Promise.resolve();
            }
            /**
             * Create Invite
             */
            const invite = await proxyC.createInvite({
                temporary: true,
                maxAge: 600,
                maxUses: 3,
                unique: true,
            }, `${user.username}#${user.tag} is authing`);
            const authInfo = new AuthInfo();
            authInfo.guildID = guild.id;
            authInfo.proxyID = proxyC.guild.id;
            authInfo.uChatID = room.id;
            authInfo.uInviteCode = invite.code;
            authInfo.userID = user.id;
            authInfo.naverID = member.userid;
            this.addQueue(authInfo);
            /**
             * Send text to ncc room
             */
            await this.ncc.chat.sendText(room, sprintf(this.lang.auth.nccmessage,{
                link: invite.url,
                user: msg.author.username,
            }));
            /**
             * Send rich
             */
            const rich = await getRichByProfile(member, DiscordFormat.getNickname(msg), msg.author.avatarURL);
            const roomURL = `https://talk.cafe.naver.com/channels/${room.id}`;
            await channel.send(roomURL,rich);
        } else if (testInfo.match) {
            if (!await this.ncc.availableAsync()) {
                await channel.send(this.lang.noNaver);
                return Promise.resolve();
            }
            let dest = testInfo.get(ParamType.dest);
            if (dest.endsWith(" 네이버")) {
                dest = dest.substring(0, dest.lastIndexOf(" "));
                if (dest.endsWith("의")) {
                    dest = dest.substring(0, dest.lastIndexOf("의"));
                }
                const guildCfg = await this.sub(this.config, msg.guild.id);
                const cafe = await this.ncc.parseNaver(guildCfg.commentURL);
                const members = await this.getUsers(msg.guild, dest);
                if (members.length === 0) {
                    const naver:Profile = await this.ncc.getMemberByNick(cafe.cafeId, dest).catch((err) => null);
                    if (naver == null) {
                        await channel.send(sprintf(this.lang.auth.nickNotFound, {
                            nick: dest,
                            type: "",
                        }));
                    } else {
                        await channel.send(await getRichByProfile(naver));
                    }
                    return Promise.resolve();
                }
                for (const member of members) {
                    const gu = guildCfg.users.filter((v) => v.userID === member.user.id);
                    let naver:Profile;
                    try {
                        if (gu.length === 1) {
                            naver = await this.ncc.getMemberById(cafe.cafeId, gu[0].naverID);
                        } else {
                            naver = await this.ncc.getMemberByNick(cafe.cafeId, dest);
                        }
                    } catch (err) {
                        Log.w(err);
                    }
                    
                    if (naver == null) {
                        await channel.send(sprintf(this.lang.auth.nickNotFound, {
                            nick: dest,
                            type: "",
                        }));
                    } else {
                        await channel.send(await getRichByProfile(naver, member.nickname, member.user.avatarURL));
                    }
                }
            }
        }
        return Promise.resolve();
    }
    protected async break(queue:AuthInfo, roomID?:string | Room, breakInvite = true) {
        if (roomID == null) {
            roomID = queue.uChatID;
        }
        const room = (typeof roomID === "string") ? await this.ncc.getRoom(roomID) : roomID;
        if (room != null) {
            await this.ncc.chat.deleteRoom(room);
        }
        if (breakInvite) {
            try {
                const invite = await this.getInvite(queue);
                await invite.delete("Checked.");
            } catch (err) {
                Log.e(err);
            }
        }
        this.deleteQueue(queue);
        return Promise.resolve();
    }
    protected async verify(queue:AuthInfo):Promise<string> {
        const invite = await this.getInvite(queue);
        if (await this.inviteExpired(invite)) {
            return this.lang.auth.expiredAuth;
        }
        const cfg = await this.sub(this.config, queue.guildID);
        const guild = this.client.guilds.get(queue.guildID);
        const member = guild.member(queue.userID);
        const toRole = this.getFirstMap(guild.roles.filter((v) => v.name === cfg.destRole));
        if (toRole == null || member == null) {
            return "Config error.";
        }
        if (await this.haveAuthed(guild.id, queue.naverID, queue.userID)) {
            return this.lang.auth.already_auth;
        }
        if (!member.roles.has(toRole.id)) {
            await member.addRole(toRole, `nc ${queue.naverID} authed.`);
        }
        const {...reduced} = queue as AuthUser;
        cfg.users.push(reduced);
        await cfg.export();
        return Promise.resolve(null);
    }
    protected async onNccMessage(message:Message) {
        const roomID = message.room.id;
        const queue = this.getFirst(this.authQueue.filter((_v) => _v.uChatID === roomID));
        if (queue == null || queue.naverID !== message.user.id) {
            return Promise.resolve();
        }
        const room = await this.ncc.getRoom(roomID);
        const error = await this.verify(queue);
        if (error != null) {
            this.ncc.chat.sendText(room, error);
        } else {
            this.ncc.chat.sendText(room, this.lang.auth.authed);
        }
        await this.break(queue, room);
    }
    protected async haveAuthed(guildID:string, nID:string, uID:string):Promise<boolean> {
        let out = false;
        const guildCfg = await this.sub(this.config, guildID);
        for (const user of guildCfg.users) {
            if (user.userID === uID || user.naverID === nID) {
                out = true;
                break;
            }
        }
        return Promise.resolve(out);
    }
    protected async onGuildMemberRemove(member:Discord.GuildMember) {
        const guild = member.guild;
        const uid = member.user.id;
        await Promise.all(this.authQueue.filter((v) => v.userID === uid).map((v) => this.break(v)));

        const guildCfg = await this.sub(this.config, guild.id);
        let changed = false;
        for (const user of guildCfg.users) {
            if (user.userID === member.user.id) {
                changed = true;
                guildCfg.users.splice(guildCfg.users.indexOf(user));
            }
        }
        if (changed) {
            await guildCfg.export();
        }
        return Promise.resolve();
    }
    protected async onGuildMemberAdd(member:Discord.GuildMember) {
        const user = member.user;
        const queue = this.getFirst(this.authQueue.filter((v) => {
            return v.userID === user.id && v.proxyID === member.guild.id;
        }));
        if (queue == null) {
            return Promise.resolve();
        }
        const dm = await user.createDM();
        const invite = await this.getInvite(queue);
        if (invite.uses >= 1) {
            const error = await this.verify(queue);
            if (error != null) {
                await dm.send(error);
            } else {
                await dm.send(this.lang.auth.authed);
            }
        } else {
            // wtf.
            await dm.send("허용되지 않은 접근.");
        }
        await member.kick("Out!");
        await this.break(queue);
        return Promise.resolve();
    }
    private async inviteExpired(inviteCode:string | Discord.Invite) {
        let _invite;
        if (typeof inviteCode === "string") {
            _invite = await this.getInvite(inviteCode);
        } else {
            _invite = inviteCode;
        }
        return _invite == null || Date.now() >= _invite.expiresTimestamp;
    }
    private async getInvite(queue:AuthInfo | string) {
        let id:string;
        let guild:Discord.PartialGuild | Discord.Guild;
        if (typeof queue === "string") {
            id = queue;
            const i:Discord.Invite = await this.client.fetchInvite(id).catch((err) => null);
            if (i == null) {
                return null;
            }
            guild = i.guild;
        } else {
            id = queue.uInviteCode;
            guild = this.client.guilds.get(queue.proxyID);
        }
        if (guild == null || !(guild instanceof Discord.Guild)) {
            return null;
        }
        return this.getFirstMap((await guild.fetchInvites()).filter((v) => v.code === id));
    }
    private deleteQueue(queue:AuthInfo) {
        this.authCache.forEach((v, i) => {
            if (v.expired || (v.cache.uChatID === queue.uChatID && v.cache.uInviteCode === queue.uInviteCode)) {
                this.authCache.splice(i, 1);
            }
        });
    }
    private addQueue(queue:AuthInfo) {
        this.authCache.push(new Cache(queue, this.timeout / 1000));
    }
    private get authQueue() {
        this.authCache.forEach((v,i) => v.expired ? this.authCache.splice(i, 1) : null);
        return this.authCache.map((v) => v.cache);
    }
    private getUsers(guild:Discord.Guild, nick:string):Discord.GuildMember[] {
        const out = [];
        for (const [gKey,gMember] of guild.members) {
            const _nick = gMember.nickname == null ? gMember.user.username : gMember.nickname;
            if (_nick === nick) {
                out.push(gMember);
            }
        }
        return out;
    }
}
export async function getNaver(authlist:AuthConfig,guild:Discord.Guild, userid:string):Promise<string> {
    try {
        if (authlist.users != null) {
            authlist.users.filter((_v) => _v.naverID === userid).forEach((_v) => {
                return Promise.resolve(_v.naverID);
            });
        }
    } catch (err3) {
        Log.e(err3);
    }
    return Promise.resolve(null);
}
export async function getRichByProfile(member:Profile, name?:string, icon?:string) {
    // image
    if (member.profileurl == null) {
        member.profileurl = "https://ssl.pstatic.net/static/m/cafe/mobile/cafe_profile_c77.png";
    }
    // const image:Buffer = await request.get(member.profileurl, { encoding: null });
    // rich message
    const rich = new Discord.RichEmbed();
    rich.setFooter(member.cafeDesc == null ? "네이버 카페" : member.cafeDesc, member.cafeImage);
    // rich.attachFile(new Discord.Attachment(image, "profile.png"));
    // rich.setThumbnail("attachment://profile.png");
    rich.setThumbnail(member.profileurl);
    if (name != null) {
        rich.setAuthor(name, icon);
    }
    rich.addField("네이버 ID", member.userid, true);
    rich.addField("네이버 닉네임", member.nickname, true);
    if (member.level != null) {
        rich.addField("등급", member.level, true);
        rich.addField("총 방문 수", member.numVisits, true);
        rich.addField("총 게시글 수", member.numArticles, true);
        rich.addField("총 댓글 수", member.numComments, true);
    }
    return Promise.resolve(rich);
}
enum PType {
    ID,
    NICK,
}
class AuthUser {
    public userID:string;
    public guildID:string;
    public naverID:string;
}
class AuthInfo extends AuthUser {
    public uChatID:string; // unique
    public uInviteCode:string; // unique
    public proxyID:string;
}
export class AuthConfig extends Config {
    public guildName = "Sample";
    public timeout = 600;
    public commentURL = "cafeURL";
    public destRole = "destRole";
    public users:AuthUser[] = [];
    public proxyChannel = "1234";
    // proxy oauth
    // https://discordapp.com/oauth2/authorize?client_id=INSERT_CLIENT_ID_HERE&scope=bot&permissions=35
    constructor() {
        super("auth");
    }
}