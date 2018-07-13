import * as Discord from "discord.js";
import Config from "../../config";
import Log from "../../log";
import Plugin from "../plugin";
import { ChainData, CommandHelp, CommandStatus, Keyword, ParamType } from "../runutil";

export default class Ping extends Plugin {
    private ping:CommandHelp;
    private join:CommandHelp;
    public async ready() {
        const out = super.ready();
        this.ping = new CommandHelp("핑", this.lang.ping.helpPing);
        this.ping.addField(ParamType.from, "서버", false);
        this.ping.complex = true;
        this.join = new CommandHelp("이어", "아몰랑");
        this.join.addField(ParamType.dest, "")
        this.join.complex = true;
        return out;
    }
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        const channel = msg.channel;
        const user = msg.author;
        const check = this.ping.test(command,options);
        const join = this.join.test(command,options);
        Log.json("Commands",check);
        if (check.match) {
            await msg.reply(`퐁! \`${this.client.ping}\` ${check.get(ParamType.from)}`);
        } else {
            await msg.channel.send(JSON.stringify({cmd:command, opt:options}));
        }
        if (join.match) {
            const param = {words: [] as string[]};
            if (join.exist(ParamType.dest)) {
                param.words.push(join.get(ParamType.dest));
            }
            this.startChain(channel.id, user.id, ChainType.JOIN);
        }
        return Promise.resolve();
    }
    protected async onChainMessage(message:Discord.Message, type:number, data:object):Promise<ChainData> {
        if (message.content === "끝") {
            return this.endChain(message,type,data);
        }
        const output = {
            type,
            data: {words:[] as string[]},
            time: Date.now(),
        };
        output.data.words.push(message.content);
        return Promise.resolve(output);
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:object):Promise<void> {
        await message.channel.send(data["words"].join(" "));
        return Promise.resolve();
    }
    
    public get help():CommandHelp[] {
        const out:CommandHelp[] = [];
        out.push(this.ping);
        out.push(this.join);
        for (let i = 0; i < 5; i += 1) {
            const cmd = new CommandHelp("테스트" + i, "테스트");
            cmd.complex = true;
            out.push(cmd);
        }
        return out;
    }
}
enum ChainType {
    JOIN,
}