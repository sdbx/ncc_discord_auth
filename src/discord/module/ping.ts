import * as Discord from "discord.js";
import Plugin from "../plugin";
import { CommandHelp, Keyword, } from "../runtime";

export default class Ping extends Plugin {
    public async ready() {
        return super.ready();
    }
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        if (command === "핑") {
            msg.reply(`퐁! \`${this.client.ping}\``);
        } else {
            msg.channel.send(JSON.stringify({cmd:command, opt:options}));
        }
        return Promise.resolve();
    }
    public get help():CommandHelp[] {
        const out:CommandHelp[] = [];
        const ping = new CommandHelp("핑", this.lang.ping.helpPing);
        out.push(ping);
        return out;
    }
}