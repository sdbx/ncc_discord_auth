import Discord, { MessageOptions } from "discord.js"
import request from "request-promise-native"
import Config from "../../config"
import Log from "../../log"
import { ArticleParser } from "../../ncc/articleparser"
import { cafePrefix } from "../../ncc/ncconstant"
import Article from "../../ncc/structure/article"
import Cafe from "../../ncc/structure/cafe"
import Profile from "../../ncc/structure/profile"
import { bindFn, TimerID, WebpackTimer } from "../../webpacktimer"
import Plugin from "../plugin"
import { MarkType, ParamAccept, ParamType, UniqueID } from "../rundefine"
import { CmdParam } from "../rundefine"
import { CommandHelp, DiscordFormat } from "../runutil"
import { AuthConfig } from "./auth"
const debug = false

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
        this.toggle = new CommandHelp("게시글 중계", this.lang.noti.toggleDesc, true, {reqAdmin:true})
        this.toggle.addField(ParamType.dest, "중계할 게시판 이름", false)
        this.checkArti = new CommandHelp("게시글 확인", "__", true, {chatType: "guild"})
        this.checkArti.addField(ParamType.dest, "게시글 번호", true, {accept: ParamAccept.NUMBER})
        // get parameter as complex
        this.toggle.complex = true
        // setinterval
        this.timer = WebpackTimer.setInterval(bindFn(this.fetch, this), debug ? 5000 : 30000)
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
            const postCh = cfg.toPostChannel
            const categoryP = testToggle.get(ParamType.dest)
            const categoryCfg = cfg.categoryFilter[msg.channel.id]
            if (postCh.indexOf(msg.channel.id) >= 0) {
                if (categoryCfg === undefined) {
                    if (categoryP == null) {
                        postCh.splice(postCh.indexOf(msg.channel.id), 1)
                    } else {
                        delete cfg.categoryFilter[msg.channel.id]
                    }
                } else {
                    if (categoryP == null) {
                        delete cfg.categoryFilter[msg.channel.id]
                    } else {
                        cfg.categoryFilter[msg.channel.id] = categoryP
                    }
                }
            } else {
                if (categoryCfg !== null) {
                    delete cfg.categoryFilter[msg.channel.id]
                }
                if (categoryP != null) {
                    cfg.categoryFilter[msg.channel.id] = categoryP
                }
                postCh.push(msg.channel.id)
            }
            const rich = this.defaultRich
            const categorys = cfg.categoryFilter[msg.channel.id]
            rich.addField("수신 채널 목록",cfg.toPostChannel.length <= 0 ? "없음" : cfg.toPostChannel.join(","))
            rich.addField("현재 채널 정보", postCh.indexOf(msg.channel.id) >= 0 ?
                (categorys == null ? "전체 글" : categorys) : "수신 안함")
            await msg.channel.send(rich)
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
                const riches = await this.articleToRich(cafe, article, guild)
                for (const rich of riches) {
                    await msg.channel.send(rich)
                }
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
                // const categorys = cfg.categoryFilter[msg.channel.id]
                articles = articles.filter((_v) => {
                    if (debug) {
                        return _v.articleId >= lastID
                    } else {
                        return _v.articleId > lastID
                    }
                })
                for (const _ar of articles) {
                    const article = await this.ncc.getArticleDetail(cafe.cafeId, _ar.articleId)
                    const sendContents = await this.articleToRich(cafe, article, guild)
                    if (sendContents.length === 0) {
                        Log.w("Article", "Article parse failed!")
                        continue
                    }
                    for (const _v of cfg.toPostChannel) {
                        const categories = cfg.categoryFilter[_v]
                        if (categories != null) {
                            const categoryArr = categories.split(",").map((v) => v.trim())
                            if (categoryArr.indexOf(article.categoryName) < 0) {
                                continue
                            }
                        }
                        if (this.client.channels.has(_v)) {
                            const ch = this.client.channels.get(_v) as Discord.TextChannel
                            for (const rich of sendContents) {
                                try {
                                    await ch.send(rich)
                                } catch (err) {
                                    Log.e(err)
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                Log.e(err)
            }
        }
    }
    protected async articleToRich(cafe:Cafe, article:Article, guild?:Discord.Guild) {
        try {
            const user = await this.ncc.getMemberById(cafe.cafeId,article.userId).catch((err) => {
                Log.e(err)
                return null as Profile
            })
            const rich = this.defaultRich
            rich.setTitle(article.articleTitle)
            if (user != null) {
                rich.setThumbnail(user.cafeImage)
                // tslint:disable-next-line
                rich.setAuthor(user.nickname, user.profileurl, `${cafePrefix}/CafeMemberNetworkView.nhn?clubid=${cafe.cafeId.toString(10)}&m=view&memberid=${user.userid}`)
            } else {
                rich.setAuthor(article.userId + " (탈퇴한 사용자)")
            }
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
            rich.setURL(`${cafePrefix}/${cafe.cafeName}/${article.articleId}`)
            try {
                if (guild != null) {
                    const authlist = await this.sub(new AuthConfig(), guild.id, false)
                    const suffix = article.categoryName + ", " + article.articleId.toString(10)
                    rich.setFooter(suffix)
                    if (authlist.users != null && user != null) {
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
                    comments.push(`**${comment.nickname}** [이미지](${comment.imageurl})${sendCon}`)
                } else if (comment.stickerurl != null) {
                    comments.push(`**${comment.nickname}** [스티커](${comment.stickerurl})${sendCon}`)
                } else {
                    comments.push(`**${comment.nickname}**${sendCon}`)
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
            // split
            const contentSplit = ArticleParser.articleToMd(article, MarkType.DISCORD).split("\n")
            const contents:string[] = []
            let conCache:string = ""
            while (contentSplit.length >= 1) {
                const piece = contentSplit.shift() + "\n"
                if (piece.length + conCache.length >= 1000) {
                    // push content and reset
                    conCache = conCache.substring(0, conCache.length - 1)
                    contents.push(conCache)
                    conCache = piece
                } else {
                    conCache += piece
                }
            }
            if (conCache.length >= 1) {
                contents.push(conCache)
            }
            const out:Array<MessageOptions | Discord.RichEmbed> = []
            if (contents.length === 0) {
                rich.setDescription("내용 없음")
            } else {
                rich.setDescription(contents[0] + ((contents.length >= 2) ? "..." : ""))
            }
            const readFile = ArticleParser.mdToHTML(article, ArticleParser.articleToMd(article, MarkType.GITHUB))
            attaches.push(new Discord.Attachment(Buffer.from(readFile, "utf8"), article.articleId + ".html"))
            out.push({
                embed: rich,
                files: attaches,
                disableEveryone: true,
            } as MessageOptions)
            if (contents.length >= 2 && false) {
                contents.shift()
                out.push(...contents.map((v) => {
                    const _rich = new Discord.RichEmbed()
                    _rich.setTitle("더 보기")
                    _rich.setDescription(v)
                    return _rich
                }))
            }
            return out
        } catch (err2) {
            Log.e(err2)
        }
        return null
    }
}
class AlertConfig extends Config {
    public cafeURL = "<네이버 카페 URL>"
    public toPostChannel:string[] = []
    public categoryFilter:{[key in string]:string} = {}
    // proxy oauth
    // https://discordapp.com/oauth2/authorize?client_id=INSERT_CLIENT_ID_HERE&scope=bot&permissions=35
    constructor() {
        super("artialert")
    }
}