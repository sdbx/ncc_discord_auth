import Cheerio from "cheerio"
import colorString from "color-string"
import pretty from "pretty"
import request from "request-promise-native"
import showdown from "showdown"
import ytdl from "ytdl-core"
import Log from "../log"
import { asReadonly, DeepReadonly } from "./deepreadonly"
import Ncc from "./ncc"
import { CAFE_VOTE_SITE, NAVER_THUMB_PROXY, VIDEO_PLAYER_PREFIX } from "./ncconstant"
import { copy, getFirst } from "./nccutil"
import NcFetch from "./ncfetch"
import { ArticleContent, ContentType, GeneralStyle, ImageStyle,
    ImageType, TableType, TextStyle, TextType } from "./structure/article"
import Article from "./structure/article"
import NaverVideo from "./structure/navervideo"

/**
 * From Runutil.ts
 * 
 * Extracted.
 */
const blankChar = "\u{17B5}"
const blankChar2 = "\u{FFF5}"
type MergeStyle = TextStyle & GeneralStyle & ImageStyle
enum MarkType {
    GITHUB,
    DISCORD,
}
const blockTag = ["address", "article", "aside", "blockquote", "canvas",
    "dd", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer",
    "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li",
    "main", "nav", "noscript", "ol", "output", "p", "pre", "section",
    "table", "tfoot", "ul", "video"]
/**
 * I like static class
 * 
 * Article Function Maker
 */
export class ArticleParser {
    public static GITHUB = MarkType.GITHUB
    public static DISCORD = MarkType.DISCORD
    public static async domToContent($:CheerioStatic, els:CheerioElement[]) {
        const chain = await this.chain_domToContent($, {
            els: [...els],
            contents: [],
            style: {
                bold: false,
                italic: false,
                underline: false,
                namu: false,
                url: null,
                size: 12,
                textColor: null,
                textAlign: "undefined",
                backgroundColor: null,
                fontName: null,
                align: "undefined",
                viewWidth: -1,
                viewHeight: -1,
            },
        })
        return chain.contents
    }
    /**
     * Print article's content to markdown.
     * @param contents Article's content.
     */
    public static articleToMd(article:Article, markType:MarkType) {
        const contents = article.contents
        let out:string = ""
        const addLineSep = () => {
            if (!out.endsWith("\n")) {
                out += "\n"
                if (markType === MarkType.GITHUB) {
                    out += "\n"
                }
            }
        }
        for (const content of contents) {
            // NaverVideo | ytdl.videoInfo | ImageType | UrlType | TextType[] | TextStyle
            if (content.type === "newline") {
                addLineSep()
            } else if (content.type === "text") {
                // make style
                const typeCon = content as ArticleContent<TextType>
                const info = typeCon.style
                let txt:MarkdownFormat
                if (markType === MarkType.GITHUB) {
                    txt = new MarkdownFormat(content.data)
                } else if (markType === MarkType.DISCORD) {
                    let data = content.data
                    // before processing
                    data = data.replace(/\\/ig, "\\\\").replace(/\*/ig, "\\*").replace(/~/ig, "\\~")
                    txt = new MarkdownFormat((info.url != null) ? `[${data}](${info.url})` : data)
                } else {
                    throw new Error("wtf")
                }
                if (info.bold) {
                    txt.bold.eof()
                }
                if (info.italic) {
                    txt.italic.eof()
                }
                if (info.namu) {
                    txt.namu.eof()
                }
                if (info.underline) {
                    txt.underline.eof()
                }
                if (markType === MarkType.GITHUB) {
                    out += (info.url != null) ? `[${txt.toString()}](${info.url})` : txt.toString()
                } else if (markType === MarkType.DISCORD) {
                    if (info.bold || info.italic || info.namu || info.underline) {
                        out += txt.toString() + blankChar2
                    } else {
                        out += txt.toString()
                    }
                }
            } else if (content.type === "image") {
                const info = content.info as ImageType
                let name = info.name
                if (name.length <= 0) {
                    name = "Image"
                }
                if (markType === MarkType.GITHUB) {
                    /*
                    let src = info.src
                    if (info.width > 0 && info.height > 0) {
                        src += ` =${info.width}x${info.height}`
                    }
                    */
                    let imgmd = `![${name}](${info.src})`
                    if (content.style.url != null) {
                        imgmd = `[${imgmd}](${content.style.url})`
                    }
                    out += imgmd
                } else if (markType === MarkType.DISCORD) {
                    out += `[${name}](${info.src})`
                }
            } else if (content.type === "embed") {
                const url = content.data
                if (url.length >= 1) {
                    out += `[Unknown Embed](${url})`
                }
            } else if (content.type === "nvideo") {
                const info = content.info as NaverVideo
                if (markType === MarkType.GITHUB) {
                    out += `[![Thumbnail-${info.masterVideoId}](${info.previewImg})](${info.share})\n`
                }
                out += `[${info.title} - ${info.author.nickname}](${info.share})`
            } else if (content.type === "vote") {
                // skip.
                out += `[네이버 투표](${content.data})`
            } else if (content.type === "youtube") {
                const info = content.info as ytdl.videoInfo
                if (markType === MarkType.GITHUB) {
                    out += `[![Thumbnail-${info.video_id}](${info.thumbnail_url})](${info.video_url})\n`
                }
                out += `[${info.title} - ${info.author.name}](${info.video_url})`
            } else if (content.type === "table") {
                const info = content.info as TableType
                const tableOut:string[] = []
                if (info.header.length === 1) {
                    let column = "|"
                    let endColumn = "|"
                    for (const tel of info.header[0]) {
                        column += " " + tel + " |"
                        endColumn += " " + "".padStart(tel.length, "-") + " |"
                    }
                    tableOut.push(column, endColumn)
                } else if (markType === MarkType.GITHUB) {
                    tableOut.push("|  |  |", "| - | - |")
                }
                if (info.body.length >= 1) {
                    for (const body of info.body) {
                        let column = "|"
                        for (const tel of body) {
                            column += " " + tel + " |"
                        }
                        tableOut.push(column)
                    }
                }
                addLineSep()
                out += tableOut.join("\n")
                addLineSep()
            }
        }
        if (markType === MarkType.DISCORD) {
            // post-process
            out = out.replace(/\s*\n[\n\s]*/ig, "\n")
        }
        return out
    }
    public static mdToHTML(article:Article, markdown:string) {
        const conv = new showdown.Converter()
        const html = `
        ${htmlFrame}
        <body>
        <article class="markdown-body">
        <h1><a href=\"${article.url}\">${article.articleTitle}</a></h1>
        ${conv.makeHtml(markdown)}
        </article>
        </body>
        `
        return pretty(html) as string
    }
    public static articleToHTML(article:Article) {
        for (const info of article.contents) {
            Log.d("Article", info.data)
        }
    }
    protected static async chain_domToContent($:CheerioStatic, param:DomChain) {
        const { els, contents } = param
        /**
         * style is Immutable
         */
        const style = asReadonly(param.style)
        for (const element of els) {
            /**
             * First
             * 
             * set TextStyle from tag/attrStyle.
             */
            const url = element.attribs != null ? element.attribs["href"] : null
            const attrStyle = element.attribs != null ? element.attribs["style"] : null
            const tagName = element.tagName != null ? element.tagName.toLowerCase() : ""
            param.style = setTextStyler({
                style,
                tagName,
                enable: true,
                url,
                attrStyle,
            })
            /**
             * Two
             * 
             * Push Contents to array
             */
            // parse style
            const eData = element.data != null ? element.data.trim() : ""
            const hasChild = element.children != null && element.children.length >= 1
            // push raw Text into ContentType
            if (element.data != null) {
                // just push content's text.
                if (tagName.length >= 1 || eData.length >= 1) {
                    contents.push(contentAsText(element.data, style))
                }
            }
            const checkBreak = shouldBreak(element)
            // custom parser
            if (checkBreak.length >= 1) {
                /**
                 * Naver link parser.
                 */
                if (checkBreak === "naverURL") {
                    const c$ = $(element)
                    const linkInfo = {
                        title: "링크",
                        image: null,
                        imageWidth: 1,
                        imageHeight: 1,
                        url: null,
                    }
                    const qTitle = c$.find(".tit")
                    if (qTitle.length === 1) {
                        linkInfo.title = qTitle.text()
                    }
                    const qUrl = c$.find(".link")
                    if (qTitle.length === 1) {
                        linkInfo.url = qUrl.attr("href")
                    }
                    const qImg = c$.find("img")
                    if (qImg.length === 1) {
                        const u = qImg.attr("src")
                        if (u != null) {
                            if (u.startsWith("https://dthumb-phinf.pstatic.net/")) {
                                linkInfo.image = u
                                const query = u.lastIndexOf("type=")
                                if (query >= 0) {
                                    const nums = u.substr(query).match(/\d+/ig)
                                    if (nums != null && nums.length === 2) {
                                        linkInfo.imageWidth = Number.parseInt(nums[0])
                                        linkInfo.imageHeight = Number.parseInt(nums[1])
                                    }
                                }
                            } else {
                                const imgI = contentAsImage(qImg[0], style)
                                linkInfo.image = imgI.data
                                linkInfo.imageWidth = imgI.info.width
                                linkInfo.imageHeight = imgI.info.height
                                linkInfo.title = imgI.info.name
                            }
                        }
                        contents.push({
                            type: "image",
                            data: linkInfo.image,
                            info: {
                                src: linkInfo.image,
                                width: linkInfo.imageWidth,
                                height: linkInfo.imageHeight,
                                name: linkInfo.title,
                            },
                            style: {
                                url: linkInfo.url,
                                ...style,
                            }
                        } as ArticleContent<ImageType>)
                    }
                    contents.push({
                        type: "text",
                        data: linkInfo.title,
                        info: {
                            content: linkInfo.title,
                        },
                        style: {
                            url: linkInfo.url,
                            ...style,
                        }
                    } as ArticleContent<TextType>, contentAsLS(style))
                } else if (checkBreak === "table") {
                    /**
                     * Table Parser
                     */
                    const info = {
                        header: [],
                        body: [],
                    }
                    // select thead tbody
                    const table$ = $(element)
                    const tParser = (tIO:Cheerio, query:string) => {
                        const jArr = tIO.find(query + " > tr").map((_ti, _tEl) => {
                            return $(_tEl).find("td").map((_ti2, _tEl2) => $(_tEl2).text())
                        }) as any as string[][]
                        // That's a strange thing
                        const outArr:string[][] = []
                        // tslint:disable-next-line
                        for (let k = 0; k < jArr.length; k += 1) {
                            const oneArr:string[] = []
                            const dep1Arr = jArr[k]
                            // tslint:disable-next-line
                            for (let l = 0; l < dep1Arr.length; l += 1) {
                                oneArr.push(dep1Arr[l])
                            }
                            outArr.push(oneArr)
                        }
                        return outArr
                    }
                    if (table$.find("thead").length > 0) {
                        info.header = tParser(table$, "thead")
                    }
                    if (table$.find("tbody").length > 0) {
                        info.body = tParser(table$, "tbody")
                    }
                    contents.push({
                        type: "table",
                        data: "",
                        info,
                        style: { ...style },
                    } as ArticleContent<TableType>)
                } else {
                    throw new Error("No implement breaking!")
                }
                // @TODO add other special parser
            } else if (hasChild) {
                // resclusive DOM
                param.els = element.children
                await this.chain_domToContent($, param)
            } else {
                // Lastest Depth of code!
                // There's no need to put text here. (Element.data part)
                switch (tagName) {
                    case "br": {
                        // newline
                        contents.push(contentAsLS(style))
                    } break
                    case "img": {
                        // image
                        contents.push(contentAsImage(element, style))
                    } break
                    case "embed":
                    case "iframe": {
                        // iframe/embed start
                        if (element.attribs != null) {
                            const src = element.attribs.src
                            const embedObj = {
                                data: src,
                                style: { ...style },
                            }
                            if (src == null) {
                                // unknown
                                contents.push({
                                    type: "embed",
                                    info: {},
                                    ...embedObj,
                                } as ArticleContent<{}>)
                            } else if (src.startsWith(CAFE_VOTE_SITE)) {
                                // nc vote
                                contents.push({
                                    type: "vote",
                                    info: {},
                                    ...embedObj,
                                } as ArticleContent<{}>)
                            } else if (src.startsWith(VIDEO_PLAYER_PREFIX)) {
                                // naver video
                                try {
                                    const video = await new NcFetch().getVideoFromURL(src)
                                    contents.push({
                                        type: "nvideo",
                                        data: video.share,
                                        info: video,
                                        style: { ...style },
                                    } as ArticleContent<NaverVideo>)
                                } catch (err) {
                                    Log.e(err)
                                }
                            } else if (src.startsWith("https://www.youtube.com/embed/")) {
                                // youtube
                                try {
                                    const video = await ytdl.getBasicInfo(src)
                                    contents.push({
                                        type: "youtube",
                                        data: video.video_url,
                                        info: video,
                                        style: { ...style },
                                    } as ArticleContent<ytdl.videoInfo>)
                                } catch (err) {
                                    Log.e(err)
                                }
                            } else {
                                // unknown
                                contents.push({
                                    type: "embed",
                                    info: {},
                                    ...embedObj,
                                } as ArticleContent<{}>)
                            }
                        }
                        // iframe/embed end
                    }
                }
            }
            // line seperator need tag?
            if (contents.length >= 1 && blockTag.find((v) => v === tagName) != null) {
                const last = contents[contents.length - 1]
                if (last.type === "newline" || (last.type === "text" && last.data.endsWith("\n"))) {
                    // pass
                } else {
                    contents.push(contentAsLS(style))
                }
            }
            // restore original style
            param.style = { ...style }
        }
        return param
    }
}
/**
 * Style or unstyle *TextStyle*
 * @param param Parameters.
 */
function setTextStyler(param:{
    style:DeepReadonly<MergeStyle>, tagName:string, enable:boolean, url:string, attrStyle:string
}):MergeStyle {
    const { tagName, enable, url, attrStyle } = param
    // break immutable for style.
    const style = { ...param.style }
    // style simple blod, underline, italic, strike, link(not simple)
    switch (tagName.toLowerCase()) {
        case "b": {
            style.bold = enable
        } break
        case "u": {
            style.underline = enable
        } break
        case "i": {
            style.italic = enable
        } break
        case "strike":
        case "s": {
            style.namu = enable
        } break
        case "a": {
            if (url != null && enable) {
                style.url = url
            } else {
                style.url = null
            }
        } break
    }
    // if not modify element
    if (attrStyle != null) {
        // parse style to Map<key, value>
        /* padding:0;margin:0;max-width:100%;display:inline-block;vertical-align:middle;font-size:16px */
        const styleMap = new Map<string, string>()
        const pairs:string[][] = attrStyle.split(";").map(
            (v) => v.split(":")).filter((v) => v.length === 2)
        for (const pair of pairs) {
            const [key, value] = pair
            styleMap.set(key.trim(), value.trim())
        }
        // font-size : !important - ignore, [n]sem - ignore, [n](px, em, pt) - accept (Yes convert.)
        if (styleMap.has("font-size")) {
            const fontText = styleMap.get("font-size")
            const fontSize = sizeAsPx(fontText)
            Log.d("TextSize", fontSize + "")
            if (fontText.indexOf("!important") >= 0 && fontSize <= 0) {
                // we don't have parent's css, so ignore.
            } else {
                style.size = fontSize
            }
        }
        // text-align : center, left, right, justify - fu**you
        if (styleMap.has("text-align")) {
            Log.d("TextAlign", styleMap.get("text-align"))
            switch (styleMap.get("text-align")) {
                case "left":
                    style.align = "left"
                    break
                case "center":
                    style.align = "center"
                    break
                case "right":
                    style.align = "right"
                    break
                case "justify":
                    style.align = "undefined"
                    break
            }
        }
        // font-family: i think so lot.
        if (styleMap.has("font-family")) {
            const fonts = styleMap.get("font-family").split(",").map((v) => v.trim())
            if (fonts.length >= 1) {
                style.fontName = fonts[0]
            }
        }
        // text color
        if (styleMap.has("color")) {
            style.textColor = colorAsHex(styleMap.get("color").trim())
        }
        // text background color
        if (styleMap.has("background-color")) {
            style.backgroundColor = colorAsHex(styleMap.get("background-color").trim())
        }
        // css3: underline, strike
        if (styleMap.has("text-decoration-line")) {
            const styles = styleMap.get("text-decoration-line").trim().split(/\s+/ig)
            style.underline = styles.indexOf("underline") >= 0
            style.namu = styles.indexOf("line-through") >= 0
        }
        // bold
        if (styleMap.has("font-weight")) {
            const fw = styleMap.get("font-weight").trim()
            switch (fw) {
                case "normal":
                    style.bold = false; break
                case "bold":
                    style.bold = true; break
            }
        }
        // italic
        if (styleMap.has("font-style")) {
            const fontS = styleMap.get("font-style").trim()
            switch (fontS) {
                case "italic":
                case "oblique":
                    style.italic = true; break
                case "normal":
                    style.italic = false; break
            }
        }
        // width, height : to img tag
        if (styleMap.has("width") && styleMap.has("height")) {
            const width = sizeAsPx(styleMap.get("width"))
            const height = sizeAsPx(styleMap.get("height"))
            if (width >= 0 && height >= 0) {
                style.viewWidth = width
                style.viewHeight = height
            }
        }
    }
    return style
}
function colorAsHex(str:string) {
    const colorInfo = colorString.get.rgb(str) // [r,g,b,a]
    if (colorInfo == null) {
        return ""
    }
    if (colorInfo[3] < 1) {
        colorInfo[3] = Math.floor(colorInfo[3] * 255)
        colorInfo.unshift(colorInfo.pop())
    } else {
        colorInfo.pop()
    }
    return "#" + colorInfo.map((v) => v.toString(16).toUpperCase()).join("")
}
/**
 * Conver various css length to px
 * @param str 15px, 15pt
 */
function sizeAsPx(str:string) {
    let sizePx = -1
    const sizeText = getFirst(str.match(/\d+(\.\d{1,3})?\s*(px|pt|em|%)/ig))
    if (sizeText == null) {
        return -1
    }
    const sizeNum = Number.parseFloat(getFirst(str.match(/\d+(\.\d{1,3})?/i)))
    switch (safeGet(getFirst(sizeText.match(/(px|pt|em|%)/i)), "")) {
        case "px":
            sizePx = sizeNum
            break
        case "pt":
            sizePx = sizeNum * 4 / 3
            break
        case "em":
            sizePx = sizeNum * 12
            break
        case "%":
            sizePx = sizeNum * 8
            break
        default:
            sizePx = -1
            break
    }
    sizePx = Math.round(sizePx)
    return sizePx
}
/**
 * Parse Image from <img> html
 * @param el Cheerio Element (img tag)
 */
function contentAsImage(el:CheerioElement, 
    _style:DeepReadonly<GeneralStyle & ImageStyle> | (GeneralStyle & ImageStyle)):ArticleContent<ImageType> {
    // image
    let width:number = -1
    let height:number = -1
    let style = el.attribs["style"]
    if (el.attribs["width"] != null && el.attribs["height"] != null) {
        const _w = el.attribs["width"]
        const _h = el.attribs["height"]
        width = sizeAsPx(_w.trim())
        height = sizeAsPx(_h.trim())
    } else if (_style.viewWidth >= 0 && _style.viewHeight >= 0) {
        width = _style.viewWidth
        height = _style.viewHeight
    } else if (style != null) {
        // legacy code. (should not fallback.)
        style = style.replace(/\s+/ig, "")
        const _w = style.match(/width:\s*\d+px/i)
        if (_w != null) {
            width = Number.parseInt(_w[0].match(/\d+/)[0])
        }
        const _h = style.match(/height:\s*\d+px/i)
        if (_h != null) {
            height = Number.parseInt(_h[0].match(/\d+/)[0])
        }
    }
    if (Number.isNaN(width)) {
        width = -1
    }
    if (Number.isNaN(height)) {
        height = -1
    }
    // name
    const src = el.attribs["src"]
    let name = decodeThumb(src)
    if (name != null && name.indexOf("?") >= 0) {
        name = name.substring(0, name.indexOf("?"))
    }
    name = name.substr(name.lastIndexOf("/") + 1)
    name = decodeURIComponent(name)
    // return
    return {
        type: "image", data: src, info: {
            src,
            width,
            height,
            name,
        } as ImageType,
        style: { ..._style },
    }
}
/**
 * Generate Line Seperator (ArticleContent)
 */
function contentAsLS(
    style:DeepReadonly<TextStyle & GeneralStyle> | (TextStyle & GeneralStyle)):ArticleContent<TextType> {
    return {
        type: "newline",
        data: "\n",
        info: { content: "\n", style: {...style} } as TextType,
        style: { ...style },
    }
}
/**
 * Generate Text with style (ArticleContent)
 * @param content Content of text
 * @param style Text Style
 */
function contentAsText(content:string, 
    style:DeepReadonly<TextStyle & GeneralStyle> | (TextStyle & GeneralStyle)):ArticleContent<TextType> {
    return {
        type: "text",
        data: content,
        info: { content, style: {...style} } as TextType,
        style: { ...style },
    }
}
function shouldBreak(el:CheerioElement) {
    if (["table"].indexOf(el.tagName) >= 0) {
        return "table"
    } else if (el.attribs == null) {
        return ""
    } else if (el.attribs["class"] != null) {
        const classes = el.attribs["class"].split(/\s+/ig)
        if (classes.indexOf("og") >= 0) {
            // naver link.
            return "naverURL"
        }
    }
    return ""
}
/**
 * Decode dthumb-phint to real src
 * @param url URL
 */
function decodeThumb(url:string) {
    if (url == null) {
        return ""
    } else if (url.startsWith(NAVER_THUMB_PROXY)) {
        let u = url.substr(url.indexOf("src=") + 4)
        if (u.indexOf("&") >= 0) {
            u = u.substring(0, u.indexOf("&"))
        }
        u = decodeURIComponent(u)
        if (u.startsWith("\"")) {
            u = u.substr(1)
        }
        if (u.endsWith("\"")) {
            u = u.substring(0, u.length - 1)
        }
        return u
    }
    return url
}
function safeGet<T>(value:T, defaultV?:T):T {
    if (value == null) {
        if (defaultV !== undefined) {
            return defaultV
        } else {
            return null
        }
    } else {
        return value
    }
}
interface DomChain {
    els:CheerioElement[],
    contents:ArticleContent[],
    style:MergeStyle,
}
class MarkdownFormat {
    private _italic = false
    private _bold = false
    private _underline = false
    private _namu = false
    private _block = false
    private _blockBig = false
    private readonly _content:string
    public constructor(str:string) {
        this._content = str
    }
    public get normal() {
        this._italic = this._bold = this._underline = this._namu = false
        return this
    }
    public get italic() {
        this._italic = true
        return this
    }
    public get bold() {
        this._bold = true
        return this
    }
    public get underline() {
        this._underline = true
        return this
    }
    public get namu() {
        this._namu = true
        return this
    }
    public get block() {
        this._block = true
        return this
    }
    public get blockBig() {
        this._blockBig = true
        return this
    }
    public eof() {
        return this
    }
    public toString() {
        let format = "%s"
        let content = this._content
        content = content.replace(/>/ig, "\\>").replace(/\*/ig, "\\*")
        if (this._underline) {
            format = format.replace("%s", "__%s__")
        }
        if (this._namu) {
            format = format.replace("%s", "~~%s~~")
        }
        if (this._italic) {
            format = format.replace("%s", "*%s*")
        }
        if (this._bold) {
            format = format.replace("%s", "**%s**")
        }
        if (this._block || this._blockBig) {
            format = "%s"
            if (this._block) {
                format = format.replace("%s", "`%s`")
            } else {
                format = format.replace("%s", "```%s```")
            }
        }
        return format.replace("%s", content)
    }
}
/*
        headers.push("<meta charset=\"UTF-8\">")
        headers.push("<head>")
        headers.push(String.raw`<meta name="viewport" content="width=device-width, initial-scale=1">`)
        // tslint:disable-next-line
        headers.push(String.raw``)
        headers.push(exportCss)
*/
/* tslint:disable */
const htmlFrame = String.raw`
<meta charset="UTF-8">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sindresorhus/github-markdown-css@latest/github-markdown.css">
    <style>
	.markdown-body {
		box-sizing: border-box;
		min-width: 200px;
		max-width: 980px;
		margin: 0 auto;
		padding: 45px;
	}

	@media (max-width: 767px) {
		.markdown-body {
			padding: 15px;
		}
    }

    img {
        max-width: 100%;
        height: auto;
    }
    </style>
</head>
`
/* tslint:enable */