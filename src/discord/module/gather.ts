import * as Discord from "discord.js";
import { sprintf } from "sprintf-js";
import Config from "../../config";
import Log from "../../log";
import Plugin from "../plugin";
import { getNickname, MainCfg } from "../runtime";
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil";

export default class Gather extends Plugin {
    // declare config file: use save data
    protected config = new GatherConfig();
    // declare command.
    private gather:CommandHelp;
    private remove:CommandHelp;
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready();
        // CommandHelp: suffix, description
        this.gather = new CommandHelp("집결", this.lang.gather.gatherDesc, true, {reqAdmin: true});
        this.gather.addField(ParamType.to, "대표?", false);
        this.remove = new CommandHelp("집결 해제", this.lang.gather.removeDesc, true, {reqAdmin: true});
        // this.remove.addField(ParamType.to, "방ID", true);
        // get parameter as complex
        this.gather.complex = true;
        return Promise.resolve();
    }
    public async onMessage(msg:Discord.Message) {
        if (msg.channel.type === "dm") {
            return Promise.resolve();
        }
        const cfg = await this.sub(this.config, msg.guild.id);
        if (!msg.guild.channels.has(cfg.destChannel)) {
            return Promise.resolve();
        }
        const destCh = msg.guild.channels.get(cfg.destChannel) as Discord.TextChannel;
        if (cfg.listenChannels.indexOf(msg.channel.id) < 0) {
            return Promise.resolve();
        }
        const channel = msg.channel as Discord.TextChannel;
        let webhook:Discord.Webhook;
        try {
            const webhooks = (await destCh.fetchWebhooks()).filter((w) => w.id === cfg.webhookID);
            if (webhooks.size === 1) {
                webhook = webhooks.get(cfg.webhookID);
            }
        } catch (err) {
            Log.e(err);
        }
        if (webhook == null) {
            Log.w("Gather", "skip - no webhook");
            return Promise.resolve();
        }
        // change image
        const name = `${getNickname(msg)} (#${(msg.channel as Discord.TextChannel).name})`
        if (name !== webhook.name || msg.author.avatarURL !== cfg.lastImage) {
            await webhook.edit(name, msg.author.avatarURL);
            cfg.lastImage = msg.author.avatarURL;
        }
        // cast to dest
        let data:any = {
            files: [],
        };
        const content = msg.content;
        for (const [key, attach] of msg.attachments) {
            data.files.push({attachment: attach.url, name: attach.filename});
        }
        for (const embed of msg.embeds) {
            const richEmbed = new Discord.RichEmbed();
            if (embed.author != null) {
                const author = embed.author;
                richEmbed.setAuthor(author.name,author.iconURL,author.url);
            }
            if (embed.color != null) {
                richEmbed.setColor(embed.color);
            }
            if (embed.description != null) {
                richEmbed.setDescription(embed.description);
            }
            for (const field of embed.fields) {
                richEmbed.addField(field.name,field.value,field.inline);
            }
            if (embed.footer != null) {
                richEmbed.setFooter(embed.footer.text,embed.footer.iconURL);
            }
            if (embed.thumbnail != null) {
                richEmbed.setThumbnail(embed.thumbnail.url);
            }
            if (embed.title != null) {
                richEmbed.setTitle(embed.title);
            }
            if (embed.url != null) {
                richEmbed.setURL(embed.url);
            }
            if (embed.image != null) {
                richEmbed.setImage(embed.image.url);
            }
            if (embed.timestamp != null) {
                richEmbed.setTimestamp(new Date(embed.timestamp));
            }
            data = richEmbed;
            break;
            // data.files.push({ attachment: attach.url, name: attach.filename });
        }
        if (content.length === 0) {
            await webhook.send(data);
        } else {
            await webhook.send(content, data);
        }
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testGather = this.gather.check(this.global, command, state);
        const testRemove = this.remove.check(this.global, command, state);
        if (msg.channel.type !== "dm" && (testGather.match || testRemove.match)) {
            const cfg = await this.sub(this.config,msg.guild.id);
            const channel = msg.channel as Discord.TextChannel;
            if (testGather.match && testGather.has(ParamType.to) && testGather.get(ParamType.to) === "대표") {
                cfg.destChannel = channel.id;
                const webhook = await channel.createWebhook("gatherHook", null, "All-in-one message");
                cfg.webhookID = webhook.id;
                await channel.send(this.lang.gather.gatherDesc);
            } else {
                const i = cfg.listenChannels.indexOf(channel.id);
                if (testGather.match && i < 0) {
                    cfg.listenChannels.push(channel.id);
                    await channel.send(this.lang.gather.addGather);
                } else if (testRemove.match && i >= 0) {
                    cfg.listenChannels.splice(i, 1);
                    await channel.send(this.lang.gather.removeGather);
                }
            }
            await cfg.export();
        }
        return Promise.resolve();
    }
}
class GatherConfig extends Config {
    public listenChannels = [];
    public destChannel = "1234";
    public webhookID = "2345";
    public lastImage = "_";
    constructor() {
        super("gather");
    }
}