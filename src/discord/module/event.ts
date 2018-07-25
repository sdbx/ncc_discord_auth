import * as Discord from "discord.js";
import { sprintf } from "sprintf-js";
import Config from "../../config";
import Log from "../../log";
import Plugin from "../plugin";
import { MainCfg } from "../runtime";
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil";

export default class EventNotifier extends Plugin {
    // declare config file: use save data
    protected config = new EventConfig();
    // declare command.
    private welcome:CommandHelp;
    private eventR:CommandHelp;
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready();
        // CommandHelp: suffix, description
        this.welcome = new CommandHelp("환영", this.lang.events.descWelcome, true, {reqAdmin: true});
        this.eventR = new CommandHelp("이벤트 수신", this.lang.events.descBotCh, true, {reqAdmin: true});
        this.client.on("guildMemberAdd",(async (member:Discord.GuildMember) => {
            const guild = member.guild;
            const cfg = await this.sub(this.config, guild.id);
            await this.sendContent(guild, cfg.welcomeCh, sprintf(cfg.welcomeMsg, {
                name: member.user.username,
                mention: DiscordFormat.mentionUser(member.user.id),
            }));
        }).bind(this));
        this.client.on("guildMemberRemove", (async (member:Discord.GuildMember) => {
            const guild = member.guild;
            const cfg = await this.sub(this.config, guild.id);
            const nick = member.nickname != null ? member.nickname : member.user.username;
            await this.sendContent(guild, cfg.botCh, sprintf(this.lang.events.exitUser, {
                name: nick,
            }));
        }).bind(this));
        this.client.on("guildMemberUpdate", (async (oldMember:Discord.GuildMember, newMember:Discord.GuildMember) => {
            const guild = newMember.guild;
            const cfg = await this.sub(this.config, guild.id);
            const oldNick = oldMember.nickname != null ? oldMember.nickname : oldMember.user.username + " (기본값)";
            const newNick = newMember.nickname != null ? newMember.nickname : newMember.user.username + " (기본값)";
            if (oldNick !== newNick) {
                const rich = new Discord.RichEmbed();
                rich.setTitle(this.lang.events.changeNick);
                rich.addField("예전 닉네임", oldNick);
                rich.addField("바뀐 닉네임", newNick);
                await this.sendContent(guild, cfg.botCh, DiscordFormat.mentionUser(newMember.user.id), rich);
            }
        }).bind(this));
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testWelcome = this.welcome.check(this.global, command, state);
        const testReceive = this.eventR.check(this.global, command, state);
        if (testWelcome.match) {
            await msg.channel.send(this.lang.events.typeWelcomeMsg);
            this.startChain(msg.channel.id, msg.author.id, ChainType.WELCOME);
            return Promise.resolve();
        }
        if (testReceive.match) {
            const cfg = await this.sub(this.config, msg.guild.id);
            cfg.botCh = msg.channel.id;
            await msg.channel.send(this.lang.events.setBotCh);
            await cfg.export();
        }
        return Promise.resolve();
    }
    protected async sendContent(guild:Discord.Guild, channelID:string, text:string, rich:Discord.RichEmbed = null) {
        if (this.client.channels.has(channelID)) { 
            const channel = this.client.channels.get(channelID) as Discord.TextChannel;
            await channel.send(text, rich);
        }
        return Promise.resolve();
    }
    protected async onChainMessage(message:Discord.Message, type:number, data:ChainData):Promise<ChainData> {
        data.data["msg"] = message.content;
        return this.endChain(message, type, data);
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        const cfg = await this.sub(this.config, message.guild.id);
        cfg.welcomeMsg = data.data["msg"];
        cfg.welcomeCh = message.channel.id;
        await cfg.export();
        await message.channel.send(sprintf(
            this.lang.events.setWelcomeSuccess + "\n\n" + cfg.welcomeMsg,{
                name: message.author.username,
                mention: DiscordFormat.mentionUser(message.author.id),
            }));
        return Promise.resolve();
    }
}
enum ChainType {
    WELCOME,
}
class EventConfig extends Config {
    public welcomeCh = "welcome";
    public botCh = "bot";
    public welcomeMsg = "Hello!";
    constructor() {
        super("event");
    }
}