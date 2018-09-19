import * as Discord from "discord.js"
import Plugin from "../plugin"
import { ChainData, CmdParam } from "../rundefine"
import { CommandHelp } from "../runutil"

export default class Ping extends Plugin {
    private ping:CommandHelp
    public async ready() {
        const out = super.ready()
        this.ping = new CommandHelp("핑", this.lang.ping.helpPing)
        this.ping.complex = true
        return out
    }
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        const channel = msg.channel
        const user = msg.author
        const check = this.ping.check(this.global, command, state)
        if (check.match) {
            await msg.reply(`퐁! \`${this.client.ping}\` <:GWchinaSakuraThinking:398950680217255977>`)
        }
        return Promise.resolve()
    }
    protected async onChainMessage(message:Discord.Message, type:number, data:ChainData):Promise<ChainData> {
        if (message.content === "끝") {
            return this.endChain(message,type,data)
        }
        data.time = Date.now();
        (data.data as object)["words"].push(message.content)
        return Promise.resolve(data)
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        await message.channel.send((data.data as object)["words"].join(" "))
        return Promise.resolve()
    }
}
enum ChainType {
    JOIN,
}