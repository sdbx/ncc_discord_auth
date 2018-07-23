import * as Discord from "discord.js";
import Config from "../../config";
import Log from "../../log";
import Plugin from "../plugin";
import { ChainData, CommandHelp, CommandStatus, Keyword, ParamType } from "../runutil";

export default class Ping extends Plugin {
    private ping:CommandHelp;
    public async ready() {
        const out = super.ready();
        this.ping = new CommandHelp("핑", this.lang.ping.helpPing);
        this.ping.complex = true;
        return out;
    }
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        const channel = msg.channel;
        const user = msg.author;
        const check = this.ping.test(command,options);
        if (check.match) {
            await msg.reply(`퐁! \`${this.client.ping}\` <:GWchinaSakuraThinking:398950680217255977>`);
        }
        return Promise.resolve();
    }
    protected async onChainMessage(message:Discord.Message, type:number, data:ChainData):Promise<ChainData> {
        if (message.content === "끝") {
            return this.endChain(message,type,data);
        }
        data.time = Date.now();
        data.data["words"].push(message.content);
        return Promise.resolve(data);
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        await message.channel.send(data.data["words"].join(" "));
        return Promise.resolve();
    }
}
enum ChainType {
    JOIN,
}