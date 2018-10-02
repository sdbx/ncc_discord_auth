import * as Discord from "discord.js"
import Config from "../../config"
import Log from "../../log"
import Plugin from "../plugin"
import { ChainData, CmdParam, ParamAccept, ParamType } from "../rundefine"
import { cloneMessage, CommandHelp, CommandStatus, DiscordFormat,
    getFirstMap, getRichTemplate, SnowFlake } from "../runutil"


export default class ExportMessages extends Plugin {
    // declare command.
    private keep:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.keep = new CommandHelp("메세지 저장", this.lang.sample.hello)
        // get parameter as complex
        this.keep.addField(ParamType.much, "갯수..(최대 100000)", true, {accept: ParamAccept.NUMBER})
        this.keep.complex = true
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testSample = this.keep.check(this.global, command, state)
        if (testSample.match && msg.channel instanceof Discord.TextChannel) {
            const messages:Output[] = []
            const lastM:string = msg.id
            const limit = Number.parseInt(testSample.get(ParamType.much))
            while (true) {
                const msgs = await msg.channel.fetchMessages({
                    limit: 100,
                    before: lastM,
                })
                messages.unshift(...msgs.array().map((v) => ({
                    senderName: DiscordFormat.getNickname(v.member),
                    senderID: v.member.id,
                    content: v.content,
                    file: v.attachments.size >= 1 ? v.attachments.array()[0].url : "",
                    type: v.embeds.length >= 1 ? 2 : (v.content === "" ? 0 : 1),
                    timestamp: v.editedTimestamp,
                } as Output)))
                if (msgs.size < 100 || limit >= messages.length) {
                    break
                }
            }
            // send Message
            await msg.reply(this.lang.sample.hello)
        }
        return Promise.resolve()
    }
}
interface Output {
    senderName:string;
    senderID:string;
    content:string;
    file:string;
    type:number;
    timestamp:number;
}