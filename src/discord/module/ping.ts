import * as Discord from "discord.js";
import Config from "../../config";
import Log from "../../log";
import Plugin from "../plugin";
import { ChainData, CommandHelp, CommandStatus, Keyword, ParamType } from "../runutil";

export default class Ping extends Plugin {
    protected global = new Test();
    private ping:CommandHelp;
    private join:CommandHelp;
    public async ready() {
        const out = super.ready();
        this.ping = new CommandHelp("핑", this.lang.ping.helpPing);
        this.ping.addField(ParamType.from, "서버", false);
        this.ping.complex = true;
        this.join = new CommandHelp("이어", "아몰랑");
        this.join.addField(ParamType.dest, "연결 말");
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
            this.startChain(channel.id, user.id, ChainType.JOIN, param);
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
    
    public get help():CommandHelp[] {
        const out:CommandHelp[] = [];
        out.push(this.ping);
        out.push(this.join);
        return out;
    }
}
enum ChainType {
    JOIN,
}
class Test extends Config {
    public hanzo = "delicious";
    constructor() {
        super("jam");
    }
}