import * as Discord from "discord.js";
import { sprintf } from "sprintf-js";
import Config from "../../config";
import Plugin from "../plugin";
import { Keyword } from "../runtime";

export default class Login extends Plugin {
    protected global = new LoginConfig();
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        const lang = this.lang.login;
        if (msg.channel.type === "dm") {
            if (command.endsWith("상태 알려")) {
                const send = new Discord.RichEmbed();
                const nState = 
                (this.ncc.available && await this.ncc.validateLogin() != null) ? lang.naverOn : lang.naverOff;
                send.addField("네이버 로그인", nState);
                send.addField("봇 관리자 여부", this.toLangString(this.config.admins.indexOf(msg.author.id)));
                send.author = {
                    name: msg.author.username,
                    icon_url: msg.author.avatarURL,
                }
                await msg.channel.send(send);
            } else if (command === "인증") {
                let paramOk = false;
                let tokenOk = false;
                for (const piece of options) {
                    if (piece.type === "to") {
                        paramOk = true;
                        if (piece.str === this.client.token.substr(0,5)) {
                            tokenOk = true;
                            break;
                        }
                    }
                }
                if (paramOk && tokenOk) {
                    this.config.admins.push(msg.author.id);
                    await this.config.export();
                    await msg.channel.send(sprintf(lang.successAdmin,this.formatUser(msg.author)));
                } else {
                    const status = paramOk ? lang.failAdmin_invalidToken : lang.failAdmin_noToken;
                    await msg.channel.send(sprintf(status,this.formatUser(msg.author)));
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