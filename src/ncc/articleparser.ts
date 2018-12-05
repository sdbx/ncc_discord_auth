import Cheerio from "cheerio"
import colorString from "color-string"
import Entities from "html-entities"
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
    ImageType, TableSeperator, TableType, TextStyle, TextType } from "./structure/article"
import Article from "./structure/article"
import NaverVideo from "./structure/navervideo"

/**
 * Semi-transparent char
 * 
 * Works in nickname, but showing char in sublime
 */
const blankChar = "\u{17B5}"
/**
 * Fully-transparent char
 * 
 * Does not work in nickname.
 */
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
    public static async domToContent(els:CheerioElement[], $?:CheerioStatic) {
        const textStyle:TextStyle = {
            bold: false,
            italic: false,
            underline: false,
            namu: false,
            size: 12,
            textColor: null,
            textAlign: "undefined",
            backgroundColor: null,
            fontName: null,
            isTitle: false,
        }
        const generalStyle:GeneralStyle = {
            url: null,
            align: "undefined",
            tagName: "",
        }
        const imageStyle:ImageStyle = {
            viewWidth: -1,
            viewHeight: -1,
        }
        const chain = await this.chain_domToContent({
            els: [...els],
            contents: [],
            style: {
                ...generalStyle,
                ...textStyle,
                ...imageStyle,
            },
        }, $)
        return chain.contents
    }
    /**
     * Print article's content to markdown.
     * @param contents Article's content.
     */
    public static articleToMd(article:Article, markType:MarkType) {
        const contents = article.contents
        let out:string = ""
        let inTable = false
        for (let i = 0; i < contents.length; i += 1) {
            const content = contents[i]
            let lastContent:ArticleContent = null
            if (i >= 1) {
                lastContent = contents[i - 1]               
            }
            // in table, we should use br. (yeah, there's no way without html.)
            let linesep:string = "\n"
            if (inTable) {
                linesep = markType === MarkType.GITHUB ? "<br>" : " "
            } else {
                // invisible, but this is only way supported all library...
                linesep = markType === MarkType.GITHUB ? "  \n" : "\n"
            }
            // NaverVideo | ytdl.videoInfo | ImageType | UrlType | TextType[] | TextStyle
            if (content.type === "newline") {
                if ((lastContent != null && lastContent.type === "table"
                && (lastContent as ArticleContent<TableType>).info.seperator === TableSeperator.tableEnd)) {
                    // in this case, we should ignore line sep cause github bug.
                } else {
                    // else, add.
                    out += linesep
                }
            } else if (content.type === "text") {
                // make style
                const typeCon = content as ArticleContent<TextType>
                const info = typeCon.style
                let txt:MarkdownFormat
                // before processing
                // html escaping looks like hell.
                content.data = content.data.replace(/\\/ig, "\\\\")
                    .replace(/\*/ig, "\\*")
                    .replace(/~/ig, "\\~")
                    .replace(/<.+?(\/>|<\/[A-Za-z0-9-_]+?>)/ig, "\\$&")
                if (markType === MarkType.GITHUB) {
                    txt = new MarkdownFormat(content.data)
                } else if (markType === MarkType.DISCORD) {
                    const data = content.data
                    // before processing
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
                    let sharp = ""
                    if (/^h[1-6]$/i.test(info.tagName)) {
                        const sharps = Number.parseInt(getFirst(info.tagName.match(/\d+/)))
                        for (let k = 0 ; k < sharps; k += 1) {
                            sharp += "#"
                        }
                        sharp += " "
                    }
                    out += sharp + ((info.url != null) ? `[${txt.toString()}](${info.url})` : txt.toString())
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
            } else if (content.type === "nvideo" || content.type === "youtube") {
                let title:string
                let authorNick:string
                let link:string
                let previewImg:string
                if (content.type === "nvideo") {
                    const info = content.info as NaverVideo
                    title = info.title
                    authorNick = info.author.nickname
                    link = info.share
                    previewImg = info.previewImg
                } else {
                    const info = content.info as ytdl.videoInfo
                    title = info.title
                    authorNick = info.author.name
                    link = info.video_url
                    previewImg = info.thumbnail_url
                }
                const videoLink = `[${title} - ${authorNick}](${link})`
                if (markType === MarkType.GITHUB && !inTable) {
                    out += `
| ${videoLink.replace(/\|/ig, "")} |  
| -------------- |  
| [![preview](${previewImg})](${link}) |  \n`
                } else {
                    out += videoLink
                }
            } else if (content.type === "vote") {
                // skip.
                out += `[네이버 투표](${content.data})`
            } else if (content.type === "table") {
                const { seperator, isHead } = (content as ArticleContent<TableType>).info
                const tableOut:string[] = []
                switch (seperator) {
                    case TableSeperator.tableStart: {
                        inTable = true
                        // github markdown's bug.
                        if (markType === MarkType.GITHUB && out.endsWith("\\\n")) {
                            out = out.substring(0, out.length - 2)
                            out += "\n\n"
                        } else {
                            out += "\n"
                        }
                        if (markType === MarkType.GITHUB) {
                            let tableHead1 = "|"
                            let tableHead2 = "|"
                            for (let k = i + 1; k < contents.length; k += 1) {
                                const c = contents[k] as ArticleContent<TableType>
                                if (c.type === "table") {
                                    if (c.info.seperator === TableSeperator.rowNext) {
                                        tableHead1 += " |"
                                        tableHead2 += "--|"
                                    } else if (c.info.seperator === TableSeperator.rowEnd) {
                                        tableHead1 += " |"
                                        tableHead2 += "--|"
                                        break
                                    }
                                }
                            }
                            if (lastContent != null && lastContent.type === "table" 
                                && (lastContent as ArticleContent<TableType>).info.isHead) {
                                // skip when header is before.
                            } else {
                                out += `${tableHead1}\n`
                            }
                            out += `${tableHead2}\n`
                        }
                    } break
                    case TableSeperator.tableEnd: {
                        out += `\n`
                        inTable = false
                    } break
                    case TableSeperator.rowStart: {
                        out += "| "
                    } break
                    case TableSeperator.rowNext: {
                        out += " | "
                    } break
                    case TableSeperator.rowEnd: {
                        out += ` |\n`
                    } break
                }
            }
            lastContent = content
        }
        // github check.
        if (markType === MarkType.GITHUB && out.endsWith("\\\n")) {
            out = out.substring(0, out.length - 2)
        }
        if (markType === MarkType.DISCORD) {
            // post-process
            out = out.replace(/\s*\n[\n\s]*/ig, "\n")
        }
        return out
    }
    public static mdToHTML(article:Article, markdown:string) {
        const sd = new showdown.Converter()
        sd.setFlavor("github")
        sd.setOption("strikethrough", true)
        sd.setOption("tables", true)
        sd.setOption("simpleLineBreaks", false)
        sd.setOption("ghCompatibleHeaderId", false)
        sd.setOption("backslashEscapesHTMLTags", true)
        sd.setOption("emoji", true)
        sd.setOption("underline", true)
        sd.setOption("tablesHeaderId", false)
        return pretty(htmlFrame(sd.makeHtml(markdown), article.articleTitle, article.url, article.userName)) as string
    }
    public static articleToHTML(article:Article) {
        for (const info of article.contents) {
            Log.d("Article", info.data)
        }
    }
    public static contentsToJujube(contents:ArticleContent[]) {
        const out = ""
        const lastMod = ""
        const composer:TextStyle = {
            bold: false,
            italic: false,
            namu: false,
            underline: false,
            size: -1,
            textColor: null,
            backgroundColor: null,
            fontName: null,
            textAlign: null,
            isTitle: false,
        }
        const parser = new Entities.XmlEntities()
        const e = (str:string) => parser.encode(str).replace(/\//ig, "&#47;")
        const jujubeCodes = contents.map((_content) => {
            switch (_content.type) {
                case "text": {
                    const styleTags:string[] = []
                    const content = _content as ArticleContent<TextType>
                    const info = content.style
                    const blKey = [info.bold, info.italic, info.namu, info.underline]
                    const blValue = ["tb", "ti", "ts", "tu"]
                    for (let i = 0; i < blKey.length; i += 1) {
                        if (blKey[i]) {
                            styleTags.push(blValue[i])
                        }
                    }
                    const merge = (str1:string, str2:string) => {
                        return str2 == null ? null : str1 + str2
                    }             
                    const strKey:Array<string | null> = [info.textColor, info.fontName,
                        info.size >= 0 ? info.size + "px" : null, info.backgroundColor]
                    const strValue:string[] = ["c", "f", "i", "k"]
                    for (let i = 0; i < strKey.length; i += 1) {
                        const key = strKey[i]
                        if (key != null) {
                            styleTags.push(e(strValue[i]) + key)
                        }
                    }
                    // header
                    if (/^h[1-6]$/i.test(info.tagName)) {
                        return `<G${getFirst(info.tagName.match(/\d+/ig))}/${e(content.data)}>`
                    }
                    styleTags.push(e(content.data))
                    return `<F${styleTags.join("/")}>`
                } break
                case "newline": {
                    return `<N/>`
                } break
                case "image": {
                    const content = _content as ArticleContent<ImageType>
                    return `<Iu${e(content.info.src)}/zw${content.info.width}/zh${content.info.height}>`
                } break
                case "nvideo": {
                    const content = _content as ArticleContent<NaverVideo>
                    return `<Yu${e(content.info.share)}/${e(content.info.title)}>`
                } break
                case "youtube": {
                    const content = _content as ArticleContent<ytdl.videoInfo>
                    return `<Yu${e(content.info.video_url)}/${e(content.info.title)}>`
                } break
            }
            return ""
        }).filter((v) => v.length >= 1)
        console.log(jujubeCodes.join(""))
        /*
        for (const _content of contents) {
            switch (_content.type) {
                case "text": {
                    const content = _content as ArticleContent<TextType>
                    if (lastMod !== "text") {
                        lastMod = "text"
                        out += "A"
                    }
                } break
                case "newline": {
                    
                }
            }
        }
        */
    }
    protected static async chain_domToContent(param:DomChain, $?:CheerioStatic) {
        const { els, contents } = param
        /**
         * style is Immutable
         */
        const style = asReadonly(param.style)
        for (const element of els) {
            /**
             * set TextStyle from tag/attrStyle.
             * 
             * @todo make process before recursiving
             */
            const url = element.attribs != null ? element.attribs["href"] : null
            const attrStyle = element.attribs != null ? element.attribs["style"] : null
            const tagName = element.tagName != null ? element.tagName.toLowerCase() : ""
            param.style = setStyler({
                style,
                tagName,
                enable: true,
                url,
                attrStyle,
            })
            // table start, end
            const isTableRoot = ["thead", "tbody", "tfoot"].indexOf(tagName) >= 0
            const isTableHead = "thead" === tagName
            /**
             * 세로 한 그룹
             */
            const isTr = tagName === "tr"
            /**
             * 자식 한 개
             */
            const isTd = tagName === "td"
            if (isTableRoot) {
                contents.push(contentAsTableInfo(TableSeperator.tableStart, isTableHead, style))
            }
            if (isTr) {
                contents.push(contentAsTableInfo(TableSeperator.rowStart, isTableHead, style))
            }
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
            if (checkBreak.length >= 1 && $ != null) {
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
                    if (qUrl.length === 1) {
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
                                ...style,
                                url: linkInfo.url,
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
                            ...style,
                            url: linkInfo.url,
                        }
                    } as ArticleContent<TextType>, contentAsLS(style))
                } else {
                    throw new Error("No implement breaking!")
                }
                // @TODO add other special parser
            } else if (hasChild) {
                // resclusive DOM
                param.els = element.children
                await this.chain_domToContent(param, $)
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
            /**
             * @todo Post-process from recursive
             */
            // add table info
            if (isTableRoot) {
                // table end info
                contents.push(contentAsTableInfo(TableSeperator.tableEnd, isTableHead, style))
            }
            if (isTr) {
                // remove empty rowNext for beauty table.
                if (contents.length >= 1) {
                    const lastCon = contents[contents.length - 1]
                    if (lastCon.type === "table" && 
                        (lastCon as ArticleContent<TableType>).info.seperator === TableSeperator.rowNext) {
                        contents.pop()
                    }
                }
                // row end info
                contents.push(contentAsTableInfo(TableSeperator.rowEnd, isTableHead, style))
            }
            if (isTd) {
                // child end info
                contents.push(contentAsTableInfo(TableSeperator.rowNext, isTableHead, style))
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
function setStyler(param:{
    style:DeepReadonly<MergeStyle>, tagName:string, enable:boolean, url:string, attrStyle:string
}):MergeStyle {
    const { tagName, enable, url, attrStyle } = param
    // break immutable for style.
    const style = { ...param.style }
    style.tagName = tagName
    // style simple blod, underline, italic, strike, link(not simple), and title.
    let titleSize = -1
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
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
            const clamp = (num:number, min:number, max:number) => Math.min(Math.max(num, min), max)
            titleSize = [2, 1.5, 1.17, 1, 0.83, 0.67][clamp(Number.parseInt(tagName.charAt(1)) - 1, 0, 5)]
            if (style.size < 0) {
                titleSize *= 18
            } else {
                titleSize *= style.size
            }
            titleSize = Math.round(titleSize)
            style.bold = enable
            style.isTitle = enable
            Log.d("ParentSize", style.size + "")
            Log.d("TitleSize", titleSize + "")
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
            const fontSize = sizeAsPx(fontText, style.size)
            if (fontText.indexOf("!important") >= 0 && style.size >= 0) {
                // we don't have parent's css, so ignore.
            } else {
                style.size = fontSize
            }
        } else if (titleSize >= 0) {
            style.size = titleSize
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
    } else if (titleSize >= 0) {
        style.size = titleSize
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
 * @param str 15px, 15pt, 1.25rem, 1.5353em, 100%...
 */
function sizeAsPx(str:string, parentSize?:number) {
    let sizePx = -1
    // rem = otaku
    const sizeText = getFirst(str.match(/\d+(\.\d+)?\s*(px|pt|rem|em|%)/ig))
    if (sizeText == null) {
        return (parentSize == null || parentSize < 0) ? -1 : parentSize
    }
    if (parentSize == null || parentSize < 0) {
        // fallback to default browser number.
        parentSize = 16
    }
    const sizeNum = Number.parseFloat(getFirst(str.match(/\d+(\.\d{1,3})?/i)))
    switch (safeGet(getFirst(sizeText.match(/(px|pt|rem|em|%)/i)), "")) {
        case "px":
            sizePx = sizeNum
            break
        case "pt":
            sizePx = sizeNum * 4 / 3
            break
        case "rem":
            // I'll define root element's fontSize is 16.
            sizePx = sizeNum * 16
            break
        case "em":
            sizePx = sizeNum * parentSize
            break
        case "%":
            // how can i define this..
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
/**
 * Generate table info with style
 * @param tableInfo Table's seperate info
 * @param style General Style
 */
function contentAsTableInfo(tableInfo:TableSeperator, isHead:boolean,
    style:DeepReadonly<GeneralStyle> | GeneralStyle):ArticleContent<TableType> {
    return {
        type: "table",
        data: "",
        info: { seperator: tableInfo, isHead },
        style: { ...style },
    }
}
function shouldBreak(el:CheerioElement) {
    if (el.attribs == null) {
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
        if (this._block || this._blockBig) {
            format = "%s"
            if (this._block) {
                format = format.replace("%s", "`%s`")
            } else {
                format = format.replace("%s", "```%s```")
            }
        } else {
            let startBlank:string
            let endBlank:string
            if (this._underline || this._namu || this._italic || this._bold) {
                startBlank = getFirst(content.match(/^\s+/i))
                if (startBlank != null) {
                    content = content.substr(startBlank.length)
                }
                endBlank = getFirst(content.match(/\s+$/i))
                if (endBlank != null) {
                    content = content.substring(0, content.length - endBlank.length)
                }
                if (content.length < 1) {
                    return content
                }
            }
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
            if (startBlank != null) {
                format = startBlank + format
            }
            if (endBlank != null) {
                format = format + endBlank
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
const htmlFrame = (markDown:string, title:string, url:string, author:string) => `
<!DOCTYPE html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://necolas.github.io/normalize.css/8.0.1/normalize.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css">
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/polonel/SnackBar@latest/dist/snackbar.min.css" />
    <!--<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sindresorhus/github-markdown-css@latest/github-markdown.css">-->
    <!--<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>-->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>
    <script type="text/javascript" src="https://cdn.jsdelivr.net/gh/polonel/SnackBar@latest/dist/snackbar.min.js"></script>
    
    <style>
    img {
        max-width: 100%;
        height: auto;
    }
    .main-header {
        background-color: #6ac36e;
    }
    strong {
        font-weight: bolder;
    }
    #arti-title {
        padding-left: 2rem;
        font-size: 2rem;
    }
    @media screen and (max-width:800px) {
        /* Smallize */
        #arti-title {
            padding-left: 0;
            font-size: 1.5rem;
            white-space: nowrap;
        }
    }
    </style>
</head>
<body>
    <div id="dogpig" style="width:100%;height:100%;position:ablsolute;top:0;left:0;bottom:0;right:0;background-size:fill;background-image:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAMAAABHPGVmAAAAPFBMVEX///8AAADtHCQICAifn5+Hh4cgICC3t7doaGgYGBgQEBD39/eXl5dYWFhAQEAEBARgYGBwcHBHR0c3NzclDAhFAAADUklEQVRoge2Y23rbIAyAOcQmTp22297/XRdzlDhKxLtZrfRLCQZ+JIQEFuKSS4SQ8ev4lrYowSMhD4mt3S+Z6qUgyAgiUxFXytCDBvEzPQCu2IXARrYzhRFHlf7TM5efO9NcoJOfZhq40j/OBtcMGVmnvEGQ1qMxA08ndWoOnFuPbK6MVC3WGhW8fwHhWCozEqiUeYNs+txFueSHiVLq9fX6+LIrKiuuFkVDEf4xwrzjhJHDD5F+oIAOILhIYP1XEJUgCrDaaxK3PBFSW3gISfKGJgrZKEL8H4yI8xAlKhAlACSGwTqEINA4aXNAH4CxPSVlcDIislSyvoIL4YqdVHiF+Ut+tJhVYllvJxNu6/qQhZyJcTp8lZDzMMFM96x+OZFjnJmeH+WjszBejVyLUzFOjRYCcPQ8hcAImHnKRkAEzCxlJzLeoRzGehLbTlMOY1Uct0PhMwzZWJHCV2Wj3f3Mpx9az6hCVGQLQ8+oshMvsanZhCob0bUSZGHfrXeiaxkwMhtCVQS6h+YuClERFBQW5qJ4K5i1G8RtIgAKM+3lrbB2c4UL0kBhJsRboRfFK/mMuVPCnJZ24lvLXMPcKdj7q5ilDAnfPHuB1ow8Tgx3FUjEjC2hWXE795NlnOvD8YxxcGFHCJNOsWQMF2LgSZmah5kQy7Dm5JyPeJDEEJxsz4Pg8xk5r7Adfia68FJDNiVqdOGlhsqumukXBd4c44bIG78Fye+mwVVPhBTX30jJVtpQt33pIWFTw5TuFy5b6Y0aX0oP2YogGdPHgVvQBGlxu/SQV8UnqrCqueIvOPHDWj47DCClvQrdwD7/0HbidtHWwCaYrBizOFCDFOV8wi/al6/XY5OV9sqxS2I87JMFewbFZIW9llZyBIuTritxkK7N6OcbGIQ33EkP3Ix8qUH3vkoY69pME1McOgjVBuxB7Cy+xxC0RysrYLqrbyn7iIHvfbpcgcGR7zclAm0oEtiJoSvH8Kr+JO5a2ODV4fDpqE5fkRTau+ufvfEwEm1JO0hTkYD4Q4oNSd0wMz/Ko+fAt/RWsLnTMcVz4M4YvPfbu09bFCi3EcLpwbkFYM5dg3Krh9WD/Baq4NxhsSWGrUcD2BnDMth68OQEPcZCfYXKlr801w8oOgVHEQAAAABJRU5ErkJggg==')"></div>
    <div class="navbar-fixed">
    <nav>
    <div class="nav-wrapper main-header">
        <div id="arti-title" class="brand-logo"><a href="${url}">${title}</a></div>
        <ul id="nav-mobile" class="right hide-on-med-and-down">
            <li style="margin-right: 2rem;">${author}</li>
            <li><a href="${url}">카페에서 보기</a></li>
        </ul>
    </div>
    </nav>
    </div>
    <div class="container">
        <div id="content" class="section">
${markDown}
        </div>
    </div>
    <noscript>
        자바스크립트를 활성화 해주세요.
    </noscript>
    <script>
        var isIE11 = !!window.MSInputMethodContext && !!document.documentMode;
        if (!isIE11) {
            document.getElementById('dogpig').remove();
        }
        try {
            if (Number.parseInt(Symbol("ES2017 <3").description.substring(2,6)) * 53 === 106901) {
                console.log("You are using latest browser!");
            }
        } catch (err) {
            // if browser version lower than chrome v70+, firefox v60+
            Snackbar.show({text: "(구) 브라우저로 인해 문제점이 발생할 수도 있습니다.", pos: "bottom-center"});
            // document.getElementById('content').innerHTML = \`<p>브라우저를 채신버전으로 업데이트 시켜주세요!</p>\`
        }
    </script> 
</body>
`
/* tslint:enable */