import * as Discord from "discord.js";
import { Room } from "node-ncc-es6";
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
    protected timestamps:Map<string,number> = new Map();
    // declare command.
    private authNaver:CommandHelp;
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
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        // test command if match
        const testAuth = this.authNaver.test(command,options);
        if (testAuth.match) {
            // check naver
            if (!await this.ncc.availableAsync()) {
                await msg.channel.send(this.lang.noNaver);
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
            const cafeID = await this.ncc.parseNaver(this.config.commentURL);
            const members = await this.ncc.getMemberPublic(cafeID.cafeId, param, type === PType.NICK);
            if (members.length !== 1) {
                await msg.channel.send(sprintf(this.lang.auth.nickNotFound, {
                    nick: param,
                    type: type === PType.NICK ? "닉네임" : "아이디",
                }));
                return Promise.resolve();
            }
            const member = members[0];
            const room:Room = await this.ncc.chat.createRoom(
                { id: cafeID.cafeId }, [{ id: member.userid }],
                {name: "안뇽", isPublic: false}).catch((err) => {Log.e(err); return null;})
            if (room == null) {
                await msg.channel.send(this.lang.auth.roomNotMaked);
                return Promise.resolve();
            }
            const roomURL = `https://talk.cafe.naver.com/channels/${room.id}`;
            await this.ncc.chat.sendText(room, "반가워");
            await this.ncc.chat.deleteRoom(room);
            // image
            if (member.profileurl == null) {
                member.profileurl = "https://ssl.pstatic.net/static/m/cafe/mobile/cafe_profile_c77.png";
            }
            const image:Buffer = await request.get(member.profileurl, { encoding: null });
            // rich message
            const rich = new Discord.RichEmbed();
            rich.setFooter(cafeID.cafeDesc == null ? "네이버 카페" : cafeID.cafeDesc, cafeID.cafeImage);
            rich.attachFile(new Discord.Attachment(image,"profile.png"));
            rich.setThumbnail("attachment://profile.png");
            rich.setAuthor(getNickname(msg), msg.author.avatarURL);
            rich.addField("네이버 ID",member.userid);
            rich.addField("네이버 닉네임", member.nickname);
            if (member.level != null) {
                rich.addField("등급", member.level);
                rich.addField("총 방문 수", member.numVisits);
                rich.addField("총 게시글 수", member.numArticles);
                rich.addField("총 댓글 수", member.numComments);
            }
            await msg.channel.send(roomURL,rich);
        }
        return Promise.resolve();
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
class AuthConfig extends Config {
    public timeout = 600;
    public commentURL = "https://cafe.naver.com/sdbx/7433"
    constructor() {
        super("auth");
    }
}