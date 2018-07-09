import * as Discord from "discord.js";
import Config from "../../config";
import Plugin, { WordPiece } from "../plugin";

const expId = /(아이디|아디|id|ID)로/g;
const expNick = /(닉네임|닉|이름)(로|으로)/g;
const textNaverID = "네이버ID";
const textNickname = "닉네임";
const textAuthTime = "남은 시간";
export default class Auth extends Plugin {
    protected config = new AuthConfig();
    private tokens = [];
    public async ready():Promise<void> {
        super.ready();
        await this.config.import(true).catch((err) => null);
    }
    public async onCommand(msg:Discord.Message, command:string, options:WordPiece[]):Promise<void> {
        /*
        if (param.cmd === "인증") {
            const userid = msg.author.id;
            let useFixedName = false;
            let authid:string = null;
            const authorNick = msg.guild.members.get(userid).displayName;
            let nick = authorNick;
            if (param.etc.filter((value) => expId.test(value)).length >= 1) {
                authid = param.etc.filter((value) => !expId.test(value)).join("");
            } else if (param.etc.filter((value) => expNick.test(value)).length >= 1) {
                nick = param.etc.filter((value) => !expNick.test(value)).join(" ");
                useFixedName = true;
            }
            const embed = new Discord.RichEmbed();
            if (authid != null) {
                embed.addField(textNaverID,authid);
            } else {
                embed.addField(textNickname,nick);
            }
            embed.addField(textAuthTime, "...");
            embed.setAuthor(authorNick,msg.author.avatarURL,"https://kkiro.kr");
            const message:Discord.MessageEmbed = await (msg.channel as Discord.TextChannel).send(embed).catch(() => msg.author.send(embed)).catch(() => null);
            if (message != null) {
                // gen random
                let rand = 0;
                do {
                    rand = 100000 + Math.floor(Math.random() * 900000);
                } while (this.tokens.indexOf(rand) >= 0);
                this.tokens.push(rand);
                // fire queue (async)
                this.queueAuth({
                    message,
                    userid,
                    useID: authid != null,
                    useFixedName,
                    name: authid != null ? authid : nick,
                    timestamp: Date.now() + this.config.timeout * 1000,
                    token: rand,
                });
            }
        }
        */
        return Promise.resolve();
    }
    private async queueAuth(info:AuthInfo) {
        console.log("Hi");
    }
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
    public textSuccess = "$user님 인증 완료다냐!"
    public timeout = 600;
    public commentURL = "https://cafe.naver.com/sdbx/7433"
    constructor() {
        super("auth");
    }
}