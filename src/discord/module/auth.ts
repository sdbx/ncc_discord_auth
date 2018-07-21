import * as Discord from "discord.js";
import { Message, Room } from "node-ncc-es6";
import * as request from "request-promise-native";
import { sprintf } from "sprintf-js";
import Config from "../../config";
import Log from "../../log";
import Article from "../../structure/article";
import Cafe from "../../structure/cafe";
import Comment from "../../structure/comment";
import Profile from "../../structure/profile";
import Plugin from "../plugin";
import { getNickname, MainCfg } from "../runtime";
import { ChainData, CommandHelp, CommandStatus, Keyword, ParamType } from "../runutil";

export default class Auth extends Plugin {
    protected config = new AuthConfig();
    protected timeout = 10 * 60 * 1000; // 10 is minutes
    protected invites:Map<InvitePair,Discord.Invite> = new Map();
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
        this.authNaver.addField(ParamType.to, "(ID) 아이디|(닉) 닉네임", true);
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
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        // test command if match
        const user = msg.author;
        const channel = msg.channel;
        const testAuth = this.authNaver.test(command,options);
        const testInfo = this.infoNaver.test(command,options);
        if (testAuth.match) {
            // check naver
            if (!await this.ncc.availableAsync()) {
                await channel.send(this.lang.noNaver);
                return Promise.resolve();
            }
            let type;
            let param = testAuth.get(ParamType.to);
            if (param.endsWith("아이디")) {
                type = PType.ID;
                param = param.substring(0, param.lastIndexOf(" "));
            } else if (param.endsWith(" 닉네임") || param.endsWith(" 닉")) {
                type = PType.NICK;
                param = param.substring(0, param.lastIndexOf(" "));
            } else {
                if (param.replace(/[a-zA-Z0-9]+/ig, "").length === 0) {
                    type = PType.ID;
                } else {
                    type = PType.NICK;
                }
            }
            if (channel.type === "dm") {
                await channel.send(this.lang.auth.onlyGroup);
                return Promise.resolve();
            }
            // search nickname
            const guildCfg = await this.sub(this.config, msg.guild.id);
            const cafeID = await this.ncc.parseNaver(guildCfg.commentURL);
            let member:Profile;
            try {
                if (type === PType.NICK) {
                    member = await this.ncc.getMemberByNick(cafeID.cafeId, param);
                } else {
                    member = await this.ncc.getMemberById(cafeID.cafeId, param);
                }
            } catch (err) {
                Log.e(err);
                member = null;
            }
            if (member == null) {
                await channel.send(sprintf(this.lang.auth.nickNotFound, {
                    nick: param,
                    type: type === PType.NICK ? "닉네임" : "아이디",
                }));
                return Promise.resolve();
            }
            // create instant link
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
            const roomURL = `https://talk.cafe.naver.com/channels/${room.id}`;
            /**
             * Create Invite
             */
            const invite = await proxyC.createInvite({
                temporary: true,
                maxAge: 600,
                maxUses: 3,
                unique: true,
            }, user.id);
            const uniqueU = {
                guild: msg.guild.id,
                user: user.id,
                naverid: member.userid,
                roomid:room.id,
            } as InvitePair;
            if (this.invites.has(uniqueU)) {
                if (Date.now() < this.invites.get(uniqueU).expiresTimestamp) {
                    await channel.send(this.lang.auth.authing);
                    return Promise.resolve();
                } else {
                    try {
                        this.invites.get(uniqueU).delete("Reassign");
                    } catch (err) {
                        Log.e(err);
                    }
                    this.invites.delete(uniqueU);
                }
            }
            this.invites.set(uniqueU, invite);
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
            const rich = await this.getRichByProfile(member, getNickname(msg), msg.author.avatarURL);
            await channel.send(roomURL,rich);
        } else if (testInfo.match) {
            let dest = testInfo.get(ParamType.dest);
            if (dest.endsWith(" 네이버")) {
                dest = dest.substring(0, dest.lastIndexOf(" "));
                if (dest.endsWith("의")) {
                    dest = dest.substring(0, dest.lastIndexOf("의"));
                }
                const guildCfg = await this.sub(this.config, msg.guild.id);
                const cafe = await this.ncc.parseNaver(guildCfg.commentURL);
                const members = await this.getUsers(msg.guild, dest);
                for (const member of members) {
                    const gu = guildCfg.users.filter((v) => v.user === member.user.id);
                    let naver:Profile;
                    try {
                        if (gu.length === 1) {
                            naver = await this.ncc.getMemberById(cafe.cafeId, gu[0].naverid);
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
                        await channel.send(await this.getRichByProfile(naver, member.nickname, member.user.avatarURL));
                    }
                }
            }
        }
        return Promise.resolve();
    }
    protected async onNccMessage(message:Message) {
        if (this.invites.size >= 1) {
            for (const [key,value] of this.invites) {
                if (Date.now() > value.expiresTimestamp) {
                    this.invites.delete(key);
                    continue;
                }
                if (key.roomid === message.room.id && key.naverid === message.user.id) {
                    // checkmate.
                    const cfg = await this.sub(this.config, key.guild);
                    const guild = this.client.guilds.get(key.guild);
                    const member = guild.member(key.user);
                    const destRs = guild.roles.filter((v) => v.name === cfg.destRole);
                    const rooms = (await this.ncc.chat.getRoomList())
                        .filter((_v) => _v.id === key.roomid);
                    if (member != null && destRs.size === 1) {
                        try {
                            for (const [k, v] of destRs) {
                                if (!member.roles.has(v.id)) {
                                    await member.addRole(v, `nc ${key.naverid} authed.`);
                                    const dm = await member.createDM();
                                    await dm.send(this.lang.auth.authed);
                                    // await user.setNote(tag.naverid);
                                    for (const room of rooms) {
                                        await this.ncc.chat.sendText(room, this.lang.auth.authed);
                                        await this.ncc.chat.deleteRoom(room);
                                    }
                                    try {
                                        await value.delete("Ncc authed.");
                                    } catch (err2) {
                                        Log.e(err2);
                                    }
                                    delete key.guild;
                                    delete key.roomid;
                                    cfg.users.push(key as UserPair);
                                    await cfg.export();
                                }
                            }
                        } catch (err) {
                            Log.e(err);
                        }
                    }
                }
            }
        }
    }
    protected async onGuildMemberAdd(member:Discord.GuildMember) {
        const user = member.user;
        if (this.invites.size >= 1) {
            let invitesG;
            try {
                invitesG = await member.guild.fetchInvites();
            } catch (err) {
                Log.e(err);
            }
            const removes = [];
            if (invitesG == null) {
                // permission denied.
                return;
            }
            for (const [tag, _invite] of this.invites) {
                const invite:Discord.Invite = invitesG.find("code", _invite.code);
                if (invite == null) {
                    continue;
                }
                if (Date.now() >= invite.expiresTimestamp) {
                    removes.push(tag);
                    continue;
                }
                this.invites.set(tag, invite);
                if (user.id === tag.user && invite.uses >= 1) {
                    const cfg = await this.sub(this.config, tag.guild);
                    if (member.guild.channels.has(cfg.proxyChannel)) {
                        // Destinations guild
                        const destG = this.client.guilds.get(tag.guild);
                        const sudoG = member.guild;
                        const destRs = destG.roles.filter((v) => v.name === cfg.destRole);
                        if (destRs.size === 1) {
                            try {
                                for (const [k, v] of destRs) {
                                    if (destG.member(user) != null && !destG.member(user).roles.has(v.id)) {
                                        await destG.member(user).addRole(v, `nc ${tag.naverid} authed.`);
                                        await sudoG.member(user).kick("Authed");
                                        const dm = await user.createDM();
                                        await dm.send(this.lang.auth.authed);
                                        // await user.setNote(tag.naverid);
                                        delete tag.guild;
                                        delete tag.roomid;
                                        cfg.users.push(tag as UserPair);
                                        await cfg.export();
                                    }
                                }
                            } catch (err) {
                                Log.e(err);
                            }
                        }
                    }
                }
            }
        }
        return Promise.resolve();
    }
    private async getRichByProfile(member:Profile, name:string, icon:string) {
        // image
        if (member.profileurl == null) {
            member.profileurl = "https://ssl.pstatic.net/static/m/cafe/mobile/cafe_profile_c77.png";
        }
        const image:Buffer = await request.get(member.profileurl, { encoding: null });
        // rich message
        const rich = new Discord.RichEmbed();
        rich.setFooter(member.cafeDesc == null ? "네이버 카페" : member.cafeDesc, member.cafeImage);
        rich.attachFile(new Discord.Attachment(image, "profile.png"));
        rich.setThumbnail("attachment://profile.png");
        if (name != null) {
            rich.setAuthor(name, icon);
        }
        rich.addField("네이버 ID", member.userid);
        rich.addField("네이버 닉네임", member.nickname);
        if (member.level != null) {
            rich.addField("등급", member.level);
            rich.addField("총 방문 수", member.numVisits);
            rich.addField("총 게시글 수", member.numArticles);
            rich.addField("총 댓글 수", member.numComments);
        }
        return Promise.resolve(rich);
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
enum PType {
    ID,
    NICK,
}
interface AuthInfo {
    message:Discord.MessageEmbed,
    userid:string, // discord id
    useID:boolean, // use id?
    useFixedName:boolean, // use fixed name?
    name:string,
    timestamp:number,
    token:number,
}
interface InvitePair extends UserPair {
    guild:string,
    roomid:string,
}
interface UserPair {
    user:string,
    naverid:string,
}
export class AuthConfig extends Config {
    public guildName = "Sample";
    public timeout = 600;
    public commentURL = "cafeURL";
    public destRole = "destRole";
    public users:UserPair[] = [];
    public proxyChannel = "1234";
    // proxy oauth
    // https://discordapp.com/oauth2/authorize?client_id=INSERT_CLIENT_ID_HERE&scope=bot&permissions=35
    constructor() {
        super("auth");
    }
}