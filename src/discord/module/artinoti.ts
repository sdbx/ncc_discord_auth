import * as Discord from "discord.js"
import * as request from "request-promise-native"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import { cafePrefix } from "../../ncc/ncconstant"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil"
import { AuthConfig } from "./auth"

export default class ArtiNoti extends Plugin {
    // declare config file: use save data
    protected config = new AlertConfig()
    // declare command.
    private toggle:CommandHelp
    private timer
    private articleCache:Map<string,number> = new Map()
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.toggle = new CommandHelp("알림 전환", this.lang.noti.toggleDesc, true, {reqAdmin:true})
        // get parameter as complex
        this.toggle.complex = true
        // setinterval
        this.timer = setInterval(this.fetch.bind(this),60000)
        // call once :)
        await this.fetch()
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const testToggle = this.toggle.check(this.global,command,state)
        if (testToggle.match) {
            const cfg = await this.sub(this.config, msg.guild.id)
            if (cfg.toPostChannel.indexOf(msg.channel.id) >= 0) {
                cfg.toPostChannel.splice(cfg.toPostChannel.indexOf(msg.channel.id), 1)
            } else {
                cfg.toPostChannel.push(msg.channel.id)
            }
            const rich = this.defaultRich
            rich.addField("수신 채널 목록",cfg.toPostChannel.length <= 0 ? "없음" : cfg.toPostChannel.join(","))
            await msg.channel.send(rich)
            await cfg.export()
        }
        return Promise.resolve()
    }
    public async onDestroy() {
        await super.onDestroy()
        clearInterval(this.timer)
        return Promise.resolve()
    }
    protected async fetch() {
        if (!await this.ncc.availableAsync()) {
            return Promise.resolve()
        }
        for (const [gID, guild] of this.client.guilds) {
            const cfg = await this.sub(this.config, gID)
            if (cfg.toPostChannel.length < 1 || cfg.cafeURL.indexOf("cafe.naver.com") < 0) {
                continue
            }
            try {
                const cafe = await this.ncc.parseNaver(cfg.cafeURL)
                let articles = await this.ncc.getRecentArticles(cafe.cafeId, true)
                if (articles.length <= 0) {
                    continue
                }
                let lastID = -1
                if (this.articleCache.has(guild.id)) {
                    lastID = this.articleCache.get(guild.id)
                    this.articleCache.set(guild.id, articles[0].articleId)
                } else {
                    lastID = articles[0].articleId
                    this.articleCache.set(guild.id,lastID)
                    continue
                }
                articles = articles.filter((_v) => _v.articleId > lastID)
                for (const _ar of articles) {
                    try {
                        const article = await this.ncc.getArticleDetail(cafe.cafeId, _ar.articleId)
                        const user = await this.ncc.getMemberById(cafe.cafeId,article.userId)
                        const rich = this.defaultRich
                        rich.setTitle(article.articleTitle)
                        // tslint:disable-next-line
                        rich.setAuthor(user.nickname, user.profileurl, `${cafePrefix}/CafeMemberNetworkView.nhn?clubid=${cafe.cafeId.toString(10)}&m=view&memberid=${user.userid}`);
                        if (article.imageURL != null) {
                            const image:Buffer = await request.get(article.imageURL, { encoding: null })
                            rich.attachFile(new Discord.Attachment(image, "image.png"))
                            rich.setImage("attachment://image.png")
                        }
                        const contents = article.contents.filter(
                            (v) => ["newline","image"].indexOf(v.type) < 0)
                            .map((v) => v.data)
                        if (contents.length > 15) {
                            contents.splice(10,contents.length - 10)
                            contents.push("...")
                        }
                        rich.setDescription(contents.join("\n").replace(/\n[\n\s]*/igm, "\n"))
                        rich.setURL(`${cafePrefix}/${cafe.cafeName}/${article.articleId}`)
                        try {
                            const authlist = await this.sub(new AuthConfig(), guild.id, false)
                            if (authlist.users != null) {
                                authlist.users.filter((_v) => _v.naverID === user.userid).forEach((_v) => {
                                    const m = guild.member(_v.userID)
                                    if (m != null) {
                                        rich.setFooter(m.nickname === null ? m.user.username : m.nickname,
                                            m.user.avatarURL)
                                    }
                                })
                            }
                        } catch (err3) {
                            Log.e(err3)
                        }
                        for (const _v of cfg.toPostChannel) {
                            if (this.client.channels.has(_v)) {
                                await (this.client.channels.get(_v) as Discord.TextChannel).send(rich)
                            }
                        }
                    } catch (err2) {
                        Log.e(err2)
                        continue
                    }
                }
            } catch (err) {
                Log.e(err)
            }
        }
    }
}
class AlertConfig extends Config {
    public cafeURL = "<네이버 카페 URL>"
    public toPostChannel:string[] = []
    // proxy oauth
    // https://discordapp.com/oauth2/authorize?client_id=INSERT_CLIENT_ID_HERE&scope=bot&permissions=35
    constructor() {
        super("artialert")
    }
}