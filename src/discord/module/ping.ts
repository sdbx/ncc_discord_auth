import * as Discord from "discord.js";
import Plugin, { WordPiece } from "../plugin";

export default class Ping extends Plugin {
    public async ready() {
        return super.ready();
    }
    public async onCommand(msg:Discord.Message, command:string, options:WordPiece[]):Promise<void> {
        if (command === "핑") {
            msg.reply(`퐁! \`${this.client.ping}\``);
        } else {
            // msg.channel.send(JSON.stringify({cmd:command, opt:options}));
        }
        return Promise.resolve();
    }
}