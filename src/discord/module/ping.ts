import * as Discord from "discord.js";
import Config from "../../config";
import Plugin from "../plugin";
import { CommandHelp, Keyword, } from "../runtime";

export default class Ping extends Plugin {
    public async ready() {
        const out = super.ready();
        return out;
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
        ping.complex = true;
        out.push(ping);
        for (let i = 0; i < 30; i += 1) {
            const cmd = new CommandHelp("테스트" + i, "테스트");
            cmd.complex = true;
            out.push(cmd);
        }
        return out;
    }
}