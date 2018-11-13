import Discord, { MessageOptions } from "discord.js"
import request from "request-promise-native"
import Config from "../../config"
import Log from "../../log"
import { cafePrefix } from "../../ncc/ncconstant"
import Article from "../../ncc/structure/article"
import Cafe from "../../ncc/structure/cafe"
import { bindFn, TimerID, WebpackTimer } from "../../webpacktimer"
import Plugin from "../plugin"
import { MarkType, ParamAccept, ParamType, UniqueID } from "../rundefine"
import { CmdParam } from "../rundefine"
import { articleMarkdown, CommandHelp, DiscordFormat } from "../runutil"
import { AuthConfig } from "./auth"

export default class ArtiNoti extends Plugin {
    // declare config file: use save data
    protected config = new AlertConfig()
    // declare command.
    private toggle:CommandHelp
    private checkArti:CommandHelp
    private timer:TimerID
    private articleCache:Map<string,number> = new Map()
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        // CommandHelp: suffix, description
        this.toggle = new CommandHelp("알림 전환", this.lang.noti.toggleDesc, true, {reqAdmin:true})
        this.checkArti = new CommandHelp("게시글 확인", "__", true, {chatType: "guild"})
        this.checkArti.addField(ParamType.dest, "게시글 번호", true, {accept: ParamAccept.NUMBER})
        // get parameter as complex
        this.toggle.complex = true
        // setinterval
        this.timer = WebpackTimer.setInterval(bindFn(this.fetch, this),60000)
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
            const cfg = await this.subUnique(this.config, msg, UniqueID.guild)
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
        const testChecker = this.checkArti.check(this.global, command, state)
        if (testChecker.match) {
            const guild = msg.guild
            const cfg = await this.sub(this.config, guild.id)
            if (cfg.toPostChannel.length < 1 || cfg.cafeURL.indexOf("cafe.naver.com") < 0) {
                return Promise.resolve()
            }
            try {
                const cafe = await this.ncc.parseNaver(cfg.cafeURL)
                const article = await this.ncc.getArticleDetail(
                    cafe.cafeId, Number.parseInt(testChecker.get(ParamType.dest)))
                const rich = await this.articleToRich(cafe, article, guild)
                await msg.channel.send(rich)
            } catch (err) {
                Log.e(err)
            }
        }
        return Promise.resolve()
    }
    public async onDestroy() {
        await super.onDestroy()
        WebpackTimer.clearInterval(this.timer)
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
                    const sendContent = await this.articleToRich(cafe, _ar, guild)
                    if (sendContent == null) {
                        Log.w("Article", "Article parse failed!")
                        continue
                    }
                    for (const _v of cfg.toPostChannel) {
                        if (this.client.channels.has(_v)) {
                            await (this.client.channels.get(_v) as Discord.TextChannel).send(sendContent)
                        }
                    }
                }
            } catch (err) {
                Log.e(err)
            }
        }
    }
    protected async articleToRich(cafe:Cafe, arti:Article, guild?:Discord.Guild):Promise<MessageOptions> {
        try {
            const article = await this.ncc.getArticleDetail(cafe.cafeId, arti.articleId)
            const user = await this.ncc.getMemberById(cafe.cafeId,article.userId)
            const rich = this.defaultRich
            // rich.setTitle(article.articleTitle)
            rich.setThumbnail(user.cafeImage)
            // tslint:disable-next-line
            rich.setAuthor(user.nickname, user.profileurl, `${cafePrefix}/CafeMemberNetworkView.nhn?clubid=${cafe.cafeId.toString(10)}&m=view&memberid=${user.userid}`);
            if (article.imageURL != null) {
                const image:Buffer = await request.get(article.imageURL, { encoding: null })
                rich.attachFile(new Discord.Attachment(image, "image.png"))
                rich.setImage("attachment://image.png")
            }
            const attaches:Discord.Attachment[] = []
            for (const attach of article.attaches) {
                const fname = decodeURIComponent(
                    attach.substring(attach.lastIndexOf("/") + 1, attach.lastIndexOf("?")))
                attaches.push(new Discord.Attachment(attach, fname))
            }
            rich.setDescription(articleMarkdown(article.contents, MarkType.DISCORD))
            rich.setURL(`${cafePrefix}/${cafe.cafeName}/${article.articleId}`)
            try {
                if (guild != null) {
                    const authlist = await this.sub(new AuthConfig(), guild.id, false)
                    const suffix = article.categoryName + ", " + article.articleId.toString(10)
                    rich.setFooter(suffix)
                    if (authlist.users != null) {
                        for (const authUser of authlist.users) {
                            if (authUser.naverID === user.userid) {
                                const m = guild.member(authUser.userID)
                                if (m != null) {
                                    const profile = DiscordFormat.getUserProfile(m)
                                    rich.setFooter(profile[0] + ` - ${suffix}`, profile[1])
                                }
                                break
                            }
                        }
                    }
                }
            } catch (err3) {
                Log.e(err3)
            }
            // comment info
            const comments:string[] = []
            for (const comment of article.comments) {
                const sendCon = comment.content.length >= 1 ? (" " + comment.content) : ""
                if (comment.imageurl != null) {
                    comments.push(`**${comment.nickname}**: [이미지](${comment.imageurl})${sendCon}`)
                } else if (comment.stickerurl != null) {
                    comments.push(`**${comment.nickname}**: [스티커](${comment.stickerurl})${sendCon}`)
                } else {
                    comments.push(`**${comment.nickname}**:${sendCon}`)
                }
            }
            if (comments.length >= 1) {
                rich.addField("댓글", comments.join("\n"))
            }
            // special info
            const icons:string[] = []
            const flag = article.flags
            if (flag.file) {
                const icon = "\u{1F4CE}"
                icons.push(icon)
            }
            if (flag.image) {
                const icon = "\u{1F5BC}"
                icons.push(icon)
            }
            if (flag.question) {
                const icon = "\u{2753}"
                icons.push(icon)
            }
            if (flag.video) {
                const icon = "\u{1F4C0}"
                icons.push(icon)
            }
            if (flag.vote) {
                const icon = "\u{1F4CA}"
                icons.push(icon)
            }
            if (icons.length >= 1) {
                rich.setTitle(article.articleTitle + " " + icons.join(" "))
            }
            return {
                embed: rich,
                files: attaches,
                disableEveryone: true,
            }
        } catch (err2) {
            Log.e(err2)
        }
        return null
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