import Cheerio from "cheerio"
import request from "request-promise-native"
import showdown from "showdown"
import ytdl from "ytdl-core"
import Log from "../log"
import { ArticleContent, ImageType, TableType, TextStyle } from "./structure/article"
import Article from "./structure/article"
import NaverVideo from "./structure/navervideo"

/**
 * From Runutil.ts
 * 
 * Extracted.
 */
const blankChar = "\u{17B5}"
const blankChar2 = "\u{FFF5}"
enum MarkType {
    GITHUB,
    DISCORD,
}
const githubCSSURL = "https://github.com/sindresorhus/github-markdown-css/raw/gh-pages/github-markdown.css"
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
    public static domToContent(els:CheerioElement[]):ArticleContent[] {
        const chain = this.chain_domToContent({
            els: [...els],
            contents: [],
            style: {
                bold: false,
                italic: false,
                underline: false,
                namu: false,
                url: null,
                size: 12,
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
                const info = content.info as TextStyle
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
                    if (info.linkURL.length >= 1) {
                        imgmd = `[${imgmd}](${info.linkURL})`
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
    public static articleToHTML(article:Article) {
        for (const info of article.contents) {
            Log.d("Article", info.data)
        }
    }
    protected static chain_domToContent(param:DomChain) {
        // all are object, so they are just pointer.
        const { els, contents, style } = { ...param }
        for (const element of els) {
            // set TextStyle from tag/attrStyle.
            const url = element.attribs != null ? element.attribs["href"] : null
            const attrStyle = element.attribs != null ? element.attribs["style"] : null
            const orgStyle = { ...style } // COPIED
            const tagName = element.tagName != null ? element.tagName.toLowerCase() : ""
            setTextStyler({
                style,
                tagName,
                enable: true,
                url,
                attrStyle,
            })
            const eData = element.data != null ? element.data.trim() : ""
            const hasChild = element.children != null && element.children.length >= 1
            // push raw Text into ContentType
            if (element.data != null) {
                // just push content's text.
                if (tagName.length >= 1 || eData.length >= 1) {
                    contents.push(contentAsText(element.data, style))
                }
            }
            if (hasChild) {
                // resclusive DOM
                param.els = element.children
                this.chain_domToContent(param)
            } else {
                // Lastest Depth of code!
                // There's no need to put text here. (Element.data part)
                switch (tagName) {
                    case "br": {
                        // newline
                        contents.push(contentAsLS())
                    } break
                    case "img": {
                        Log.d("Image!")
                    } break
                }
            }
            // line seperator need tag?
            for (const tag of blockTag) {
                if (tagName === tag) {
                    if (contents.length >= 1) {
                        const last = contents[contents.length - 1]
                        if (last.type === "newline" || (last.type === "text" && last.data.endsWith("\n"))) {
                            // pass
                        } else {
                            contents.push(contentAsLS())
                        }
                    }
                    break
                }
            }
            // restore original style
            param.style = orgStyle
        }
        return param
    }
}
/**
 * Style or unstyle *TextStyle*
 * @param param Parameters.
 */
function setTextStyler(param:{ style:TextStyle, tagName:string, enable:boolean, url:string, attrStyle:string }) {
    const { tagName, style, enable, url, attrStyle } = param
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
    return style
}
/**
 * Generate Line Seperator (ArticleContent)
 */
function contentAsLS():ArticleContent {
    return {
        type: "newline",
        data: "\n",
    }
}
/**
 * Generate Text with style (ArticleContent)
 * @param content Content of text
 * @param style Text Style
 */
function contentAsText(content:string, style:TextStyle):ArticleContent {
    return {
        type: "text",
        data: content,
        info: style,
    }
}
interface DomChain {
    els:CheerioElement[],
    contents:ArticleContent[],
    style:TextStyle,
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
        return format.replace("%s", this._content)
    }
}