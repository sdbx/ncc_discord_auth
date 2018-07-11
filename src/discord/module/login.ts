import * as Discord from "discord.js";
import Config from "../../config";
import Plugin, { WordPiece } from "../plugin";

export default class Login extends Plugin {
    protected config = new LoginConfig();
    public async onCommand(msg:Discord.Message, command:string, options:WordPiece[]):Promise<void> {
        if (msg.channel.type === "dm") {
            if (command.endsWith("상태 알려")) {
                const send = new Discord.RichEmbed();
                send.addField("네이버 로그인 여부", this.ncc.available ? "성공" : "실패");
                send.addField("봇 관리자 여부", this.config.admins.indexOf(msg.author.id) >= 0 ? "맞다냥" : "아니다냥");
                send.author = {
                    name: msg.author.avatar,
                    icon_url: msg.author.avatarURL,
                }
                await msg.channel.send(send);
            } else if (command === "인증") {
                let ok = false;
                for (const piece of options) {
                    if (piece.type === "to" && piece.str === this.client.token.substr(0,5)) {
                        ok = true;
                        break;
                    }
                }
                if (ok) {
                    this.config.admins.push(msg.author.id);
                    await this.config.export();
                    await msg.channel.send("OK.");
                }
            }
        }
        return Promise.resolve();
    }
}
class LoginConfig extends Config {
    public admins:string[] = [];
    constructor() {
        super("login");
    }
}