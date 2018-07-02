import * as Discord from "discord.js";
import Plugin, { CmdParam } from "../plugin";

export default class Ping extends Plugin {
    public async init(cl:Discord.Client) {
        return super.init(cl);
    }
    public async ready() {
        return super.ready();
    }
    public async onCommand(msg:Discord.Message, param:CmdParam):Promise<void> {
        if (param.cmd === "핑") {
            msg.reply(`퐁! \`${this.client.ping}\``);
        }
        return Promise.resolve();
    }
}