import * as Discord from "discord.js";
import Config from "../../config";
import Plugin, { CmdParam } from "../plugin";

const expId = /(아이디|아디|id|ID)로/g;
const expNick = /(닉네임|닉|이름)(로|으로)/g;
export default class Auth extends Plugin {
    private cfg = new AuthConfig();
    public async ready():Promise<void> {
        await this.cfg.import(true).catch((err) => null);
    }
    public async onCommand(msg:Discord.Message, param:CmdParam):Promise<void> {
        if (param.cmd === "인증") {
            const userid = msg.author.id;
            let authid:string = null;
            const authorNick = msg.guild.members.get(userid).nickname;
            let nick = authorNick;
            if (param.etc.filter((value) => expId.test(value)).length >= 1) {
                authid = param.etc.filter((value) => !expId.test(value)).join("");
            } else if (param.etc.filter((value) => expNick.test(value)).length >= 1) {
                nick = param.etc.filter((value) => !expNick.test(value)).join(" ");
            }
            const embed = new Discord.RichEmbed();
            if (authid == null) {
                embed.addField(this.cfg.textNaverID,authid);
            } else {
                embed.addField(this.cfg.textNickname,nick);
            }
            embed.setAuthor(authorNick,msg.author.avatarURL,"https://kkiro.kr");
            await (msg.channel as Discord.TextChannel).send("인증중!",embed);
        }
        return Promise.resolve();
    }
}
class AuthConfig extends Config {
    public textNaverID = "네이버ID";
    public textNickname = "닉네임";
    public textSuccess = "$user님 인증 완료다냐!"
    constructor() {
        super("auth");
    }
}